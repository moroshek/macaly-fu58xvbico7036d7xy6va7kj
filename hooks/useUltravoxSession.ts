// hooks/useUltravoxSession.ts
import { useRef, useEffect, useCallback } from 'react';
import { UltravoxSession } from 'ultravox-client';
import { Utterance } from '@/lib/types';
import { logger } from '@/lib/logger';

interface UseUltravoxSessionProps {
  onStatusChange: (status: string, details?: any) => void;
  onTranscriptUpdate: (transcripts: Utterance[]) => void;
  onSessionEnd: (details: { code?: number; reason?: string; error?: Error }) => void;
  onError: (error: Error, context?: string) => void;
}

const CONNECTION_TIMEOUT_MS = 15000;

export function useUltravoxSession(props: UseUltravoxSessionProps) {
  const sessionRef = useRef<UltravoxSession | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSessionActiveRef = useRef<boolean>(false);

  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  const endSession = useCallback(async (isCleanupCall: boolean = false): Promise<void> => {
    logger.log('[useUltravoxSession] endSession called.', { isCleanupCall, sessionActive: isSessionActiveRef.current });

    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
      logger.log('[useUltravoxSession] Cleared connection timeout.');
    }

    if (socketRef.current) {
      logger.log('[useUltravoxSession] Cleaning up WebSocket.');
      socketRef.current.onopen = null;
      socketRef.current.onmessage = null;
      socketRef.current.onerror = null;
      socketRef.current.onclose = null;
      if (socketRef.current.readyState !== WebSocket.CLOSING && socketRef.current.readyState !== WebSocket.CLOSED) {
        socketRef.current.close();
        logger.log('[useUltravoxSession] WebSocket.close() called.');
      }
      socketRef.current = null;
    }

    if (sessionRef.current) {
      logger.log('[useUltravoxSession] Cleaning up UltravoxSession.');
      sessionRef.current.off('status');
      sessionRef.current.off('transcripts');
      sessionRef.current.off('error');
      sessionRef.current.off('close');
      
      try {
        if (typeof sessionRef.current.endCall === 'function') {
          await sessionRef.current.endCall();
          logger.log('[useUltravoxSession] UltravoxSession.endCall() succeeded.');
        }
      } catch (e) {
        logger.error('[useUltravoxSession] Error during SDK endCall:', e);
        // Avoid double-reporting if this endSession is already part of an error flow
        if (!isCleanupCall) {
            propsRef.current.onError(e instanceof Error ? e : new Error(String(e)), 'EndSession SDK');
        }
      }
      sessionRef.current = null;
    }

    if (isSessionActiveRef.current) {
      logger.log('[useUltravoxSession] Session was active, invoking onSessionEnd.');
      // isCleanupCall helps determine if this is a "natural" end or part of an error/close event chain.
      // If called directly by user (not as cleanup from an event), details might be empty.
      // If called from an event handler (SDK close, socket close), details should have been passed to that handler.
      // This specific call to onSessionEnd from endSession itself often means a direct user action or timeout.
      if (!isCleanupCall) { // Only call if this isn't a followup from an event that already called it.
        propsRef.current.onSessionEnd({}); // Provide generic/empty details
      }
      isSessionActiveRef.current = false;
    }
    logger.log('[useUltravoxSession] endSession finished.');
  }, []); // Empty dependency array: propsRef handles prop updates.

  const initializeSession = useCallback(async (): Promise<void> => {
    logger.log('[useUltravoxSession] initializeSession called.');
    if (sessionRef.current) {
      logger.warn('[useUltravoxSession] Session already initialized.');
      return;
    }

    try {
      sessionRef.current = new UltravoxSession({ experimentalMessages: new Set() });
      logger.log('[useUltravoxSession] UltravoxSession created.');

      sessionRef.current.on('status', (status, details) => {
        logger.log('[useUltravoxSession] SDK Status:', status, details);
        propsRef.current.onStatusChange(status, details);
      });

      sessionRef.current.on('transcripts', (transcripts) => {
        logger.log('[useUltravoxSession] SDK Transcripts count:', transcripts.length);
        propsRef.current.onTranscriptUpdate(transcripts as Utterance[]);
      });

      sessionRef.current.on('error', (error) => {
        logger.error('[useUltravoxSession] SDK Error:', error);
        propsRef.current.onError(error, 'UltravoxSDK');
        // SDK errors can be session-ending.
        endSession(true); // Mark as cleanup call
      });

      sessionRef.current.on('close', (details: { code?: number; reason?: string; error?: Error }) => {
        logger.log('[useUltravoxSession] SDK Close event:', details);
        if (isSessionActiveRef.current) {
          propsRef.current.onSessionEnd(details);
          // isSessionActiveRef.current = false; // This is now handled by endSession
        }
        endSession(true); // Mark as cleanup call
      });
      
      isSessionActiveRef.current = false; // Initialized, but not "active" (i.e. connected)
      logger.log('[useUltravoxSession] Session initialized and listeners attached.');
    } catch (error) {
      logger.error('[useUltravoxSession] Failed to initialize session:', error);
      propsRef.current.onError(error instanceof Error ? error : new Error(String(error)), 'InitializeError');
      sessionRef.current = null;
    }
  }, [endSession]);

  const connect = useCallback(async (joinUrl: string): Promise<void> => {
    logger.log('[useUltravoxSession] connect called with URL:', joinUrl);
    if (!sessionRef.current) {
      const err = new Error('Session not initialized before connect');
      logger.error('[useUltravoxSession] Connect Error:', err.message);
      propsRef.current.onError(err, 'ConnectError');
      return;
    }
    if (isSessionActiveRef.current) {
      logger.warn('[useUltravoxSession] Already connected or connecting, connect call ignored.');
      return;
    }

    propsRef.current.onStatusChange('connecting');

    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = setTimeout(() => {
      const err = new Error(`Connection timed out after ${CONNECTION_TIMEOUT_MS / 1000}s`);
      logger.error('[useUltravoxSession] Connection Timeout:', err.message);
      propsRef.current.onError(err, 'ConnectionTimeout');
      propsRef.current.onStatusChange('disconnected', { error: 'timeout' });
      endSession(true); // Mark as cleanup call
    }, CONNECTION_TIMEOUT_MS);

    try {
      await sessionRef.current.joinCall(joinUrl);
      logger.log('[useUltravoxSession] joinCall resolved.');
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;

      socketRef.current = sessionRef.current.socket;

      if (socketRef.current) {
        isSessionActiveRef.current = true; // Mark session as active
        propsRef.current.onStatusChange('connected');
        logger.log('[useUltravoxSession] Raw WebSocket listeners being attached.');

        socketRef.current.onopen = () => {
          logger.log('[useUltravoxSession] Raw WebSocket: Opened');
        };
        socketRef.current.onmessage = (event) => {
          logger.log('[useUltravoxSession] Raw WebSocket: Message received'); // Data not logged by default
        };
        socketRef.current.onerror = (event) => { // This event is Event, not Error
          logger.error('[useUltravoxSession] Raw WebSocket: Error event:', event);
          propsRef.current.onError(new Error(`WebSocket error: ${event.type || 'Unknown'}`), 'WebSocket');
          // Don't necessarily endSession here, SDK might handle recovery or specific close event.
        };
        socketRef.current.onclose = (event: CloseEvent) => {
          logger.log('[useUltravoxSession] Raw WebSocket: Closed', { code: event.code, reason: event.reason, wasClean: event.wasClean });
          // This is a definitive end from the transport layer.
          if (isSessionActiveRef.current) { // Check if it was considered active
             propsRef.current.onSessionEnd({ code: event.code, reason: event.reason });
             // isSessionActiveRef.current = false; // Handled by endSession
          }
          propsRef.current.onStatusChange('disconnected', { code: event.code, reason: event.reason});
          endSession(true); // Mark as cleanup call
        };
      } else {
        const err = new Error('SDK socket not available after joinCall');
        logger.error('[useUltravoxSession] Connect Error:', err.message);
        propsRef.current.onError(err, 'ConnectNoSocket');
        propsRef.current.onStatusChange('disconnected', { error: 'sdk_socket_missing' });
        // clearTimeout already handled if joinCall succeeded
        endSession(true); // Mark as cleanup call
      }
    } catch (error) {
      logger.error('[useUltravoxSession] Error during joinCall:', error);
      propsRef.current.onError(error instanceof Error ? error : new Error(String(error)), 'JoinCallError');
      propsRef.current.onStatusChange('disconnected', { error: error instanceof Error ? error.message : 'join_call_exception' });
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
      endSession(true); // Mark as cleanup call
    }
  }, [endSession]);

  const getTranscripts = useCallback((): Utterance[] => {
    return (sessionRef.current?.transcripts as Utterance[]) || [];
  }, []);

  useEffect(() => {
    return () => {
      logger.log('[useUltravoxSession] Component unmounting. Ensuring session is ended.');
      endSession(true); // Perform full cleanup, marked as a cleanup call.
    };
  }, [endSession]); // endSession is stable.

  return { initializeSession, connect, endSession, getTranscripts };
}

// Log creation/update and description
console.log('Overwritten hooks/useUltravoxSession.ts: Custom React hook for managing Ultravox client sessions, including initialization, connection, transcript handling, error reporting, and robust cleanup logic.');
