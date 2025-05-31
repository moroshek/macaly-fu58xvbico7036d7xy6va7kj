// lib/ultravox-singleton.ts
import { UltravoxSession } from 'ultravox-client';
import { Utterance } from '@/lib/types';
import { logger } from '@/lib/logger';

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
      if (this.session.status !== 'disconnected') {
        await this.session.endCall();
      }
    } catch (error) {
      logger.error('[UltravoxSingleton] Error during disconnect:', error);
    } finally {
      this.cleanup();
    }
  }

  private setupEventListeners() {
    if (!this.session || !this.callbacks) return;

    this.session.addEventListener('status', (event) => {
      logger.log('[UltravoxSingleton] Status event:', event);
      this.callbacks?.onStatusChange(this.session?.status || 'unknown', event);
    });

    this.session.addEventListener('transcripts', (event) => {
      const transcripts = this.session?.transcripts || [];
      this.callbacks?.onTranscriptUpdate(transcripts as Utterance[]);
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
  }

  getStatus(): string {
    return this.session?.status || 'disconnected';
  }

  isConnected(): boolean {
    return this.session !== null && this.session.status !== 'disconnected';
  }
}

export const ultravoxSingleton = UltravoxSingleton.getInstance();