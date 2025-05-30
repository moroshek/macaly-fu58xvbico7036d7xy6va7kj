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
  onExperimentalMessage?: (message: any) => void; // Added new optional prop
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

  // Forward declaration for endSession to be used by handlers.
  // Actual implementation of endSession will be defined later.
  // This requires endSession to be available in the scope of handlers.
  // We will define endSession properly and pass it as a dependency.
  // To handle the circular dependency for useCallback (endSession needs handlers, error/close handlers need endSession):
  // One common pattern is to use a ref for the function that might change, or ensure stable identity.
  // For this refactoring, we will define handlers that call a stable reference to endSession.
  // And endSession itself will reference these stable handlers.

  const endSessionRef = useRef<((isCleanupCall?: boolean) => Promise<void>) | null>(null);

  // Handle status events following SDK documentation patterns
  const handleStatus = useCallback((event: Event) => {
    logger.log('[useUltravoxSession] SDK Status Event received');
    
    // SDK uses notification-based events - access status from session.status, not event object
    if (!sessionRef.current) {
      logger.warn('[useUltravoxSession] Status event received but session is null');
      return;
    }

    const statusString = sessionRef.current.status || 'unknown_status';
    logger.log(`[useUltravoxSession] Current session status: "${statusString}"`);

    // Always report the status change first
    propsRef.current.onStatusChange(statusString, { timestamp: Date.now() });

    // Handle microphone management based on SDK best practices
    // Only unmute after reporting the idle status
    if (statusString === 'idle' && sessionRef.current) {
      logger.log('[useUltravoxSession] Session reached idle state, attempting to unmute microphone');
      sessionRef.current.unmuteMic()
        .then(() => {
          logger.log('[useUltravoxSession] Microphone unmuted successfully');
          // Status should automatically change to 'listening' and trigger another status event
        })
        .catch((error) => {
          logger.error('[useUltravoxSession] Failed to unmute microphone:', error);
          propsRef.current.onStatusChange('error', { error });
        });
    }
  }, []); // propsRef is stable

  const handleTranscripts = useCallback((event: Event) => {
    // SDK uses notification-based events - access transcripts from session.transcripts, not event object
    if (!sessionRef.current) {
      logger.warn('[useUltravoxSession] Transcript event received but session is null');
      return;
    }

    const transcripts = sessionRef.current.transcripts || [];
    logger.log('[useUltravoxSession] SDK Transcripts count:', transcripts.length);
    propsRef.current.onTranscriptUpdate(transcripts as Utterance[]);
  }, []); // propsRef is stable

  const handleError = useCallback((error: Error) => {
    logger.error('[useUltravoxSession] SDK Error:', error);
    propsRef.current.onError(error, 'UltravoxSDK');
    if (endSessionRef.current) {
      endSessionRef.current(true); // Mark as cleanup call
    }
  }, []); // propsRef is stable, endSessionRef.current is stable within a render

  const handleClose = useCallback((details: { code?: number; reason?: string; error?: Error }) => {
    logger.log('[useUltravoxSession] SDK Close event:', details);
    if (isSessionActiveRef.current) {
      propsRef.current.onSessionEnd(details);
    }
    if (endSessionRef.current) {
      endSessionRef.current(true); // Mark as cleanup call
    }
  }, []); // propsRef and isSessionActiveRef are stable

  const handleExperimentalMessage = useCallback((message: any) => {
    logger.log('[useUltravoxSession] SDK Experimental Message:', message);
    if (propsRef.current.onExperimentalMessage) {
      propsRef.current.onExperimentalMessage(message);
    }
  }, []); // propsRef is stable


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
      if (typeof sessionRef.current.removeEventListener === 'function') {
        sessionRef.current.removeEventListener('status', handleStatus);
        sessionRef.current.removeEventListener('transcripts', handleTranscripts);
        sessionRef.current.removeEventListener('error', handleError);
        sessionRef.current.removeEventListener('close', handleClose);
        sessionRef.current.removeEventListener('experimental_message', handleExperimentalMessage);
        logger.log('[useUltravoxSession] Event listeners removed via removeEventListener.');
      } else {
        logger.warn('[useUltravoxSession] sessionRef.current.removeEventListener is not a function. Attempting .off() as fallback.');
        // Fallback for environments where removeEventListener might not be available on this object
        if (typeof (sessionRef.current as any).off === 'function') {
          (sessionRef.current as any).off('status');
          (sessionRef.current as any).off('transcripts');
          (sessionRef.current as any).off('error');
          (sessionRef.current as any).off('close');
          (sessionRef.current as any).off('experimental_message');
        }
      }
      
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
  }, [handleStatus, handleTranscripts, handleError, handleClose, handleExperimentalMessage]); // Dependencies for endSession

  // Assign the main endSession to the ref so handlers can call it without circular useCallback deps.
  useEffect(() => {
    endSessionRef.current = endSession;
  }, [endSession]);

  const initializeSession = useCallback(async (): Promise<void> => {
    logger.log('[useUltravoxSession] initializeSession called.');
    if (sessionRef.current) {
      logger.warn('[useUltravoxSession] Session already initialized.');
      return;
    }

    try {
      // Initialize with proper configuration following SDK best practices
      sessionRef.current = new UltravoxSession({
        experimentalMessages: ["debug"]
      });
      
      // Add Debug Logging
      console.log('[useUltravoxSession] DEBUG: UltravoxSession instance created. sessionRef.current:', sessionRef.current);
      console.log('[useUltravoxSession] DEBUG: typeof sessionRef.current.addEventListener:', typeof sessionRef.current?.addEventListener);
      if (sessionRef.current && typeof sessionRef.current.addEventListener !== 'function') {
        console.log('[useUltravoxSession] DEBUG: Available keys on sessionRef.current:', Object.keys(sessionRef.current));
      }

      // Implement Robust Check
      if (sessionRef.current && typeof sessionRef.current.addEventListener === 'function') {
        sessionRef.current.addEventListener('status', handleStatus);
        sessionRef.current.addEventListener('transcripts', handleTranscripts);
        sessionRef.current.addEventListener('error', handleError);
        sessionRef.current.addEventListener('close', handleClose);
        sessionRef.current.addEventListener('experimental_message', handleExperimentalMessage);
        
        isSessionActiveRef.current = false; 
        logger.log('[useUltravoxSession] Session initialized and listeners attached via addEventListener.');
      } else {
        const errorMessage = '[useUltravoxSession] CRITICAL ERROR: UltravoxSession instance does not have an .addEventListener method or sessionRef.current is null.';
        console.error(errorMessage, sessionRef.current);
        if (propsRef.current.onError) {
          propsRef.current.onError(new Error('SDK Error: session object invalid or .addEventListener method missing.'), 'SDKInitialization');
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error('[useUltravoxSession] Failed to initialize session:', error);
      // Check if it's the custom error to avoid double reporting under a generic category
      if (error instanceof Error && error.message.includes('CRITICAL ERROR: UltravoxSession instance does not have an .addEventListener method')) {
         propsRef.current.onError(error, 'SDKInitializationCritical');
      } else {
         propsRef.current.onError(error instanceof Error ? error : new Error(String(error)), 'InitializeError');
      }
      sessionRef.current = null;
    }
  }, [endSession, handleStatus, handleTranscripts, handleError, handleClose, handleExperimentalMessage]); // Added handlers to dependencies

  const connect = useCallback(async (joinUrl: string): Promise<void> => {
    logger.log('[useUltravoxSession] connect called with URL:', joinUrl);
    
    // Store session reference at start to detect if it changes during async operations
    const initialSession = sessionRef.current;
    
    if (!initialSession) {
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
      // Check if session was cleared before we start
      if (sessionRef.current !== initialSession) {
        logger.error('[useUltravoxSession] Session reference changed before joinCall. Likely unmounted during initialization.');
        if (propsRef.current.onError) {
            propsRef.current.onError(new Error("Session was cleared before joinCall - component likely unmounted"), "ConnectSessionChangedBeforeJoin");
        }
        if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
        }
        propsRef.current.onStatusChange('disconnected', { error: 'session_cleared_before_join' });
        return;
      }

      await initialSession.joinCall(joinUrl);
      logger.log('[useUltravoxSession] joinCall resolved.');
      
      // Check if session was cleared during the async joinCall operation
      if (sessionRef.current !== initialSession) {
        logger.error('[useUltravoxSession] Session reference changed during joinCall. Component likely unmounted.');
        if (propsRef.current.onError) {
            propsRef.current.onError(new Error("Session was cleared during joinCall - component likely unmounted"), "ConnectSessionChangedDuringJoin");
        }
        if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
        }
        propsRef.current.onStatusChange('disconnected', { error: 'session_cleared_during_join' });
        return; 
      }

      // Ensure session is still the one we started with
      if (!sessionRef.current) {
        logger.error('[useUltravoxSession] SessionRef became null after joinCall resolved.');
        if (propsRef.current.onError) {
            propsRef.current.onError(new Error("Session instance was unexpectedly cleared after joinCall resolved."), "ConnectPostJoinCallNullSession");
        }
        if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
        }
        propsRef.current.onStatusChange('disconnected', { error: 'session_null_post_join' });
        return; 
      }

      // Successfully called joinCall and sessionRef.current is still valid.
      // Now, clear the connection timeout.
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      socketRef.current = sessionRef.current.socket;

      // Check if socket is available on sessionRef.current
      if (!socketRef.current) {
        logger.error('[useUltravoxSession] sessionRef.current.socket is null/undefined after joinCall resolved.');
        const err = new Error('Socket not available on session after joinCall.');
        if (propsRef.current.onError) {
            propsRef.current.onError(err, "ConnectPostJoinCallNullSocket");
        }
        propsRef.current.onStatusChange('disconnected', { error: 'sdk_socket_missing_post_join_check' });
        // Even if joinCall succeeded, if socket isn't there, we can't proceed.
        // endSession will also try to clean up sessionRef.current, which is fine.
        endSession(true); // Mark as cleanup call, this will also handle sessionRef.current = null
        return;
      }
      
      // Socket obtained, proceed
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
      // The following 'else' block was orphaned due to the 'if (!socketRef.current) { ... return; }' check above.
      // Removing the orphaned 'else' block. The logic for a null socket is already handled.
    } catch (error) {
      logger.error('[useUltravoxSession] Error during joinCall or its immediate aftermath:', error);
      // Ensure timeout is cleared on any error during this try block
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      propsRef.current.onError(error instanceof Error ? error : new Error(String(error)), 'JoinCallCatchAll');
      propsRef.current.onStatusChange('disconnected', { error: error instanceof Error ? error.message : 'join_call_exception' });
      endSession(true); // Mark as cleanup call
    }
  }, [endSession]);

  const getTranscripts = useCallback((): Utterance[] => {
    if (!sessionRef.current) {
      return [];
    }
    return (sessionRef.current.transcripts as Utterance[]) || [];
  }, []);

  useEffect(() => {
    return () => {
      logger.log('[useUltravoxSession] Component unmounting. Ensuring session is ended.');
      // endSession is already stable due to useCallback and its own dependencies.
      // The ref pattern ensures that if handleError/handleClose call endSession, they get the correct one.
      if (endSessionRef.current) {
        endSessionRef.current(true); // Perform full cleanup
      }
    };
  }, []); // This useEffect should run once to set up the unmount cleanup.
          // It correctly uses endSessionRef.current for the cleanup call.

  return { initializeSession, connect, endSession, getTranscripts };
}

// Log creation/update and description
console.log('Overwritten hooks/useUltravoxSession.ts: Custom React hook for managing Ultravox client sessions, including initialization, connection, transcript handling, error reporting, and robust cleanup logic.');
