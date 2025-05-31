// lib/ultravox-singleton.ts
import { UltravoxSession } from 'ultravox-client';
import { Utterance } from '@/lib/types';
import { logger } from '@/lib/logger';
import { getConfig } from '@/lib/config';

interface SessionCallbacks {
  onStatusChange: (status: string, details?: any) => void;
  onTranscriptUpdate: (transcripts: Utterance[]) => void;
  onSessionEnd: (details: { code?: number; reason?: string; error?: Error }) => void;
  onError: (error: Error, context?: string) => void;
  onExperimentalMessage?: (message: any) => void;
}

interface SessionState {
  joinUrl: string;
  callId: string;
  status: string;
  transcripts: Utterance[];
  timestamp: number;
}

interface ReconnectionState {
  attempts: number;
  lastAttemptTime: number;
  isReconnecting: boolean;
  reconnectTimer?: NodeJS.Timeout;
}

class UltravoxSingleton {
  private static instance: UltravoxSingleton;
  private session: UltravoxSession | null = null;
  private currentJoinUrl: string | null = null;
  private currentCallId: string | null = null;
  private isConnecting: boolean = false;
  private callbacks: SessionCallbacks | null = null;
  private loggedTranscripts: Set<string> = new Set();
  private sessionState: SessionState | null = null;
  private reconnectionState: ReconnectionState = {
    attempts: 0,
    lastAttemptTime: 0,
    isReconnecting: false
  };
  private heartbeatInterval?: NodeJS.Timeout;
  private heartbeatTimeout?: NodeJS.Timeout;
  private lastHeartbeatTime: number = 0;
  private persistenceTimer?: NodeJS.Timeout;

  private constructor() {}

  static getInstance(): UltravoxSingleton {
    if (!UltravoxSingleton.instance) {
      UltravoxSingleton.instance = new UltravoxSingleton();
    }
    return UltravoxSingleton.instance;
  }

  setCallbacks(callbacks: SessionCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(joinUrl: string, callId: string, isReconnection: boolean = false): Promise<void> {
    logger.log('[UltravoxSingleton] Connect requested', { 
      joinUrl: joinUrl.substring(0, 50), 
      callId,
      isReconnection,
      reconnectAttempts: this.reconnectionState.attempts 
    });

    // Prevent duplicate connections
    if (this.isConnecting) {
      logger.warn('[UltravoxSingleton] Already connecting, ignoring duplicate request');
      return;
    }

    // Check if already connected to this URL
    if (this.currentJoinUrl === joinUrl && this.session && !isReconnection) {
      logger.log('[UltravoxSingleton] Already connected to this URL');
      return;
    }

    // Disconnect if connected to a different URL
    if (this.session && this.currentJoinUrl !== joinUrl && !isReconnection) {
      logger.log('[UltravoxSingleton] Disconnecting from previous session');
      await this.disconnect();
    }

    this.isConnecting = true;
    this.currentJoinUrl = joinUrl;
    this.currentCallId = callId;

    try {
      // Create new session
      this.session = new UltravoxSession({
        experimentalMessages: ["debug"]
      });

      // Add event listeners
      this.setupEventListeners();

      // Connect
      logger.log('[UltravoxSingleton] Connecting to Ultravox...');
      await this.session.joinCall(joinUrl);
      logger.log('[UltravoxSingleton] Connected successfully');

      // Reset reconnection state on successful connection
      this.reconnectionState = {
        attempts: 0,
        lastAttemptTime: 0,
        isReconnecting: false
      };

      // Start heartbeat monitoring
      this.startHeartbeat();

      // Save session state
      this.saveSessionState();

      this.callbacks?.onStatusChange('connected');
    } catch (error) {
      logger.error('[UltravoxSingleton] Connection failed:', error);
      
      if (isReconnection) {
        // Handle reconnection failure
        this.handleReconnectionFailure(error);
      } else {
        this.callbacks?.onError(error instanceof Error ? error : new Error(String(error)), 'Connection');
        this.cleanup();
      }
      
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect(preserveForReconnection: boolean = false): Promise<void> {
    logger.log('[UltravoxSingleton] Disconnect requested', { preserveForReconnection });
    
    if (!this.session) {
      logger.log('[UltravoxSingleton] No active session to disconnect');
      return;
    }

    try {
      // First notify callbacks that we're disconnecting
      this.callbacks?.onStatusChange('disconnecting');
      
      // Stop heartbeat monitoring
      this.stopHeartbeat();
      
      if (this.session.status !== 'disconnected') {
        logger.log('[UltravoxSingleton] Calling endCall()...');
        await this.session.endCall();
        logger.log('[UltravoxSingleton] endCall() completed');
      }
    } catch (error) {
      logger.error('[UltravoxSingleton] Error during disconnect:', error);
    } finally {
      if (preserveForReconnection) {
        // Save state before cleanup for potential reconnection
        this.saveSessionState();
        this.startPersistenceTimer();
      }
      
      this.cleanup(!preserveForReconnection);
      
      // Notify that we've disconnected
      this.callbacks?.onStatusChange('disconnected');
    }
  }

  private setupEventListeners() {
    if (!this.session || !this.callbacks) return;

    this.session.addEventListener('status', (event) => {
      const config = getConfig();
      if (config.enableDebugLogging) {
        logger.debug('[UltravoxSingleton] Status event:', event);
      }
      this.callbacks?.onStatusChange(this.session?.status || 'unknown', event);
      
      // Clear heartbeat timeout on any status update (indicates connection is alive)
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = undefined;
      }
    });

    this.session.addEventListener('transcripts', (event) => {
      const config = getConfig();
      const rawTranscripts = this.session?.transcripts || [];
      
      // Skip empty transcript events completely after disconnect
      if (rawTranscripts.length === 0 && (!this.session || this.session.status === 'disconnected')) {
        return;
      }
      
      // Only log verbose transcript details if enabled
      if (config.enableVerboseTranscriptLogging && rawTranscripts.length > 0) {
        logger.debug('[UltravoxSingleton] Transcripts event:', event);
        logger.debug('[UltravoxSingleton] Raw transcripts:', rawTranscripts);
        logger.debug('[UltravoxSingleton] Raw transcripts length:', rawTranscripts.length);
      }
      
      // Map Ultravox transcript format to our Utterance type
      const utterances: Utterance[] = rawTranscripts.map((t: any) => {
        // Only log individual transcript items if verbose logging is enabled
        if (config.enableVerboseTranscriptLogging) {
          logger.debug('[UltravoxSingleton] Raw transcript item:', t);
        }
        
        // Log final transcripts at normal level (not debug), but avoid duplicates
        if (t.isFinal) {
          const transcriptKey = `${t.speaker}:${t.text}`;
          
          // Only log if we haven't logged this exact transcript before
          if (!this.loggedTranscripts.has(transcriptKey)) {
            logger.log('[UltravoxSingleton] Final transcript:', {
              speaker: t.speaker,
              text: t.text,
              isFinal: t.isFinal
            });
            this.loggedTranscripts.add(transcriptKey);
          }
        }
        
        return {
          speaker: t.speaker || t.role || 'unknown',
          transcript: t.text || t.transcript || t.message || '',
          timestamp: t.timestamp || Date.now()
        };
      });
      
      if (config.enableVerboseTranscriptLogging) {
        logger.debug('[UltravoxSingleton] Mapped utterances:', utterances);
      }
      
      this.callbacks?.onTranscriptUpdate(utterances);
    });

    this.session.addEventListener('error', (event) => {
      logger.error('[UltravoxSingleton] Error event:', event);
      this.callbacks?.onError(new Error(event.message || 'Unknown error'), 'Session');
    });

    this.session.addEventListener('close', (event) => {
      logger.log('[UltravoxSingleton] Close event:', event);
      this.callbacks?.onSessionEnd({ code: event.code, reason: event.reason });
      
      // Check if we should attempt reconnection
      const config = getConfig();
      if (config.enableAutoReconnect && event.code !== 1000) { // 1000 is normal closure
        logger.log('[UltravoxSingleton] Unexpected close, attempting reconnection');
        this.disconnect(true).then(() => {
          this.attemptReconnection();
        });
      } else {
        this.cleanup();
      }
    });

    if (this.callbacks.onExperimentalMessage) {
      this.session.addEventListener('experimental_message', (event) => {
        this.callbacks?.onExperimentalMessage?.(event);
      });
    }
  }

  private cleanup(clearState: boolean = true) {
    logger.log('[UltravoxSingleton] Cleaning up session', { clearState });
    this.session = null;
    this.isConnecting = false;
    
    if (clearState) {
      this.currentJoinUrl = null;
      this.currentCallId = null;
      this.sessionState = null;
      this.loggedTranscripts.clear();
      this.clearPersistenceTimer();
    }
  }

  getStatus(): string {
    return this.session?.status || 'disconnected';
  }

  isConnected(): boolean {
    return this.session !== null && this.session.status !== 'disconnected';
  }

  forceDisconnect() {
    logger.log('[UltravoxSingleton] Force disconnect requested');
    if (this.session) {
      try {
        // Force cleanup without waiting for endCall
        this.session.removeAllEventListeners();
      } catch (error) {
        logger.error('[UltravoxSingleton] Error removing event listeners:', error);
      }
    }
    this.stopHeartbeat();
    this.clearPersistenceTimer();
    this.cleanup();
    this.callbacks?.onStatusChange('disconnected');
  }

  // Reconnection logic
  async attemptReconnection(): Promise<boolean> {
    const config = getConfig();
    
    if (!config.enableAutoReconnect || !this.sessionState) {
      logger.log('[UltravoxSingleton] Reconnection not enabled or no session state');
      return false;
    }

    if (this.reconnectionState.attempts >= config.maxReconnectAttempts) {
      logger.error('[UltravoxSingleton] Max reconnection attempts reached');
      this.callbacks?.onError(new Error('Max reconnection attempts reached'), 'Reconnection');
      return false;
    }

    // Check if session is still valid (within persistence timeout)
    const timeSinceDisconnect = Date.now() - this.sessionState.timestamp;
    if (timeSinceDisconnect > config.sessionPersistenceTimeoutMs) {
      logger.error('[UltravoxSingleton] Session expired, cannot reconnect');
      this.sessionState = null;
      return false;
    }

    this.reconnectionState.isReconnecting = true;
    this.reconnectionState.attempts++;
    this.reconnectionState.lastAttemptTime = Date.now();

    // Calculate delay with exponential backoff
    const delay = config.reconnectDelayMs * Math.pow(config.reconnectBackoffMultiplier, this.reconnectionState.attempts - 1);
    
    logger.log('[UltravoxSingleton] Attempting reconnection', {
      attempt: this.reconnectionState.attempts,
      delay,
      sessionAge: timeSinceDisconnect
    });

    this.callbacks?.onStatusChange('reconnecting', { 
      attempt: this.reconnectionState.attempts,
      maxAttempts: config.maxReconnectAttempts 
    });

    return new Promise((resolve) => {
      this.reconnectionState.reconnectTimer = setTimeout(async () => {
        try {
          await this.connect(this.sessionState!.joinUrl, this.sessionState!.callId, true);
          
          // Restore transcripts
          if (this.sessionState?.transcripts) {
            this.callbacks?.onTranscriptUpdate(this.sessionState.transcripts);
          }
          
          logger.log('[UltravoxSingleton] Reconnection successful');
          this.reconnectionState.isReconnecting = false;
          resolve(true);
        } catch (error) {
          logger.error('[UltravoxSingleton] Reconnection attempt failed:', error);
          this.reconnectionState.isReconnecting = false;
          
          // Try again if we haven't exceeded max attempts
          if (this.reconnectionState.attempts < config.maxReconnectAttempts) {
            resolve(await this.attemptReconnection());
          } else {
            resolve(false);
          }
        }
      }, delay);
    });
  }

  private handleReconnectionFailure(error: any) {
    const config = getConfig();
    
    if (this.reconnectionState.attempts >= config.maxReconnectAttempts) {
      logger.error('[UltravoxSingleton] Reconnection failed after max attempts');
      this.callbacks?.onError(
        new Error(`Reconnection failed after ${config.maxReconnectAttempts} attempts`),
        'ReconnectionMaxAttempts'
      );
      this.cleanup();
    }
  }

  // Session state persistence
  private saveSessionState() {
    if (!this.session || !this.currentJoinUrl || !this.currentCallId) return;

    this.sessionState = {
      joinUrl: this.currentJoinUrl,
      callId: this.currentCallId,
      status: this.session.status || 'unknown',
      transcripts: this.session.transcripts || [],
      timestamp: Date.now()
    };

    logger.log('[UltravoxSingleton] Session state saved', {
      callId: this.sessionState.callId,
      transcriptCount: this.sessionState.transcripts.length
    });
  }

  private startPersistenceTimer() {
    const config = getConfig();
    
    this.clearPersistenceTimer();
    
    this.persistenceTimer = setTimeout(() => {
      logger.log('[UltravoxSingleton] Session persistence timeout reached');
      this.sessionState = null;
      this.currentJoinUrl = null;
      this.currentCallId = null;
    }, config.sessionPersistenceTimeoutMs);
  }

  private clearPersistenceTimer() {
    if (this.persistenceTimer) {
      clearTimeout(this.persistenceTimer);
      this.persistenceTimer = undefined;
    }
  }

  // Heartbeat monitoring
  private startHeartbeat() {
    const config = getConfig();
    
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, config.heartbeatIntervalMs);
    
    // Send initial heartbeat
    this.sendHeartbeat();
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = undefined;
    }
  }

  private sendHeartbeat() {
    if (!this.session || !this.isConnected()) return;
    
    const config = getConfig();
    this.lastHeartbeatTime = Date.now();
    
    // Check WebSocket state
    const socket = (this.session as any).socket;
    if (socket && socket.readyState === WebSocket.OPEN) {
      logger.debug('[UltravoxSingleton] Heartbeat sent');
      
      // Set timeout for heartbeat response
      this.heartbeatTimeout = setTimeout(() => {
        logger.warn('[UltravoxSingleton] Heartbeat timeout - connection may be lost');
        this.handleConnectionLoss();
      }, config.heartbeatTimeoutMs);
    } else {
      logger.warn('[UltravoxSingleton] WebSocket not open, cannot send heartbeat');
      this.handleConnectionLoss();
    }
  }

  private handleConnectionLoss() {
    logger.error('[UltravoxSingleton] Connection loss detected');
    
    // Notify callbacks
    this.callbacks?.onStatusChange('connection_lost');
    
    // Disconnect with preservation for reconnection
    this.disconnect(true).then(() => {
      // Attempt reconnection
      this.attemptReconnection();
    });
  }

  // Public methods for external control
  pauseSession() {
    logger.log('[UltravoxSingleton] Session paused');
    this.saveSessionState();
    this.stopHeartbeat();
  }

  resumeSession() {
    logger.log('[UltravoxSingleton] Session resumed');
    if (this.isConnected()) {
      this.startHeartbeat();
    }
  }

  getSessionState(): SessionState | null {
    return this.sessionState;
  }

  isReconnecting(): boolean {
    return this.reconnectionState.isReconnecting;
  }
}

export const ultravoxSingleton = UltravoxSingleton.getInstance();