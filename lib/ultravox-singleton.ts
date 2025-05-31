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

class UltravoxSingleton {
  private static instance: UltravoxSingleton;
  private session: UltravoxSession | null = null;
  private currentJoinUrl: string | null = null;
  private currentCallId: string | null = null;
  private isConnecting: boolean = false;
  private callbacks: SessionCallbacks | null = null;
  private loggedTranscripts: Set<string> = new Set();

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

  async connect(joinUrl: string, callId: string): Promise<void> {
    logger.log('[UltravoxSingleton] Connect requested', { joinUrl: joinUrl.substring(0, 50), callId });

    // Prevent duplicate connections
    if (this.isConnecting) {
      logger.warn('[UltravoxSingleton] Already connecting, ignoring duplicate request');
      return;
    }

    // Check if already connected to this URL
    if (this.currentJoinUrl === joinUrl && this.session) {
      logger.log('[UltravoxSingleton] Already connected to this URL');
      return;
    }

    // Disconnect if connected to a different URL
    if (this.session && this.currentJoinUrl !== joinUrl) {
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

      this.callbacks?.onStatusChange('connected');
    } catch (error) {
      logger.error('[UltravoxSingleton] Connection failed:', error);
      this.callbacks?.onError(error instanceof Error ? error : new Error(String(error)), 'Connection');
      this.cleanup();
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect(): Promise<void> {
    logger.log('[UltravoxSingleton] Disconnect requested');
    
    if (!this.session) {
      logger.log('[UltravoxSingleton] No active session to disconnect');
      return;
    }

    try {
      // First notify callbacks that we're disconnecting
      this.callbacks?.onStatusChange('disconnecting');
      
      if (this.session.status !== 'disconnected') {
        logger.log('[UltravoxSingleton] Calling endCall()...');
        await this.session.endCall();
        logger.log('[UltravoxSingleton] endCall() completed');
      }
    } catch (error) {
      logger.error('[UltravoxSingleton] Error during disconnect:', error);
    } finally {
      this.cleanup();
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
      this.cleanup();
    });

    if (this.callbacks.onExperimentalMessage) {
      this.session.addEventListener('experimental_message', (event) => {
        this.callbacks?.onExperimentalMessage?.(event);
      });
    }
  }

  private cleanup() {
    logger.log('[UltravoxSingleton] Cleaning up session');
    this.session = null;
    this.currentJoinUrl = null;
    this.currentCallId = null;
    this.isConnecting = false;
    this.loggedTranscripts.clear();
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
    this.cleanup();
    this.callbacks?.onStatusChange('disconnected');
  }
}

export const ultravoxSingleton = UltravoxSingleton.getInstance();