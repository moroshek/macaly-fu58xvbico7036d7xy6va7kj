/**
 * Custom hook for managing Ultravox sessions
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { UltravoxSession } from 'ultravox-client';
import { useToast } from '@/hooks/use-toast';
import { ErrorHandler } from '@/lib/error-handler';
import { getConfig } from '@/lib/config';
import { testWebSocketConnection } from '@/lib/ultravox-debug';
import { Utterance } from '@/app/page';

interface UseUltravoxSessionProps {
  onTranscriptUpdate: (transcript: Utterance[]) => void;
  onStatusChange: (status: string) => void;
  onSessionEnd: () => void;
  onError: (error: Error) => void; // Changed to Error type
}

export function useUltravoxSession({
  onTranscriptUpdate,
  onStatusChange,
  onSessionEnd,
  onError,
}: UseUltravoxSessionProps) {
  const [session, setSession] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [callEndReason, setCallEndReason] = useState<string | null>(null);
  const sessionRef = useRef<any>(null);
  const prevStatusRef = useRef<string | null>(null); // Added prevStatusRef
  const hasReachedIdleStateRef = useRef<boolean>(false);
  const { toast } = useToast();
  const errorHandler = ErrorHandler.getInstance();
  const config = getConfig();

  /**
   * Initialize a new Ultravox session
   */
  const initializeSession = useCallback(async (joinUrl: string): Promise<boolean> => {
    try {
      console.log('[Ultravox] Starting initialization');
      setIsConnecting(true);

      // Check if UltravoxSession is available
      if (typeof UltravoxSession !== 'function') {
        throw new Error('UltravoxSession is not available - check import');
      }

      // Test WebSocket connectivity
      try {
        const wsTestResult = await testWebSocketConnection(joinUrl);
        if (!wsTestResult) {
          console.warn('[Ultravox] WebSocket connectivity test failed');
        }
      } catch (wsError) {
        console.warn('[Ultravox] WebSocket test failed but continuing:', wsError);
      }

      console.log('[Ultravox] Creating new session');
      const sessionOptions = { experimentalMessages: new Set() };
      console.log('[Debug] Initializing UltravoxSession with options (experimentalMessages set to new Set()):', { experimentalMessages: 'new Set()' });
      const newSession = new UltravoxSession(sessionOptions);
      sessionRef.current = newSession; // Assign to sessionRef early

      // Connection Diagnostics
      const diagnosticInfo = {
        joinUrl,
        protocol: new URL(joinUrl).protocol,
        hostname: new URL(joinUrl).hostname,
        params: Object.fromEntries(new URL(joinUrl).searchParams),
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : 'N/A',
      };
      console.log("[Ultravox] Connection Diagnostics:", diagnosticInfo);

      if (!joinUrl.startsWith('ws://') && !joinUrl.startsWith('wss://')) {
        const protocolError = new Error(`Invalid WebSocket URL protocol: ${diagnosticInfo.protocol}`);
        onError(protocolError);
        throw protocolError;
      }

      // Define ALL event handlers here, once, so they are in scope for add/remove.
      // NOTE: Event listener attachment is moved before joinCall as per requirements.
      const handleMicMuteChange = (muted: boolean) => {
        console.log(`[Ultravox] micMutedNotifier event: Microphone is now ${muted ? 'MUTED' : 'UNMUTED'}`);
      };

      const handleTranscript = () => {
        const currentSession = sessionRef.current;
        if (!currentSession) {
            console.log('[Ultravox] Transcript update but no current session in ref.');
            return;
        }
        try {
          console.log('[Ultravox] Transcript event. Current transcript count:', currentSession.transcripts?.length);
          if (currentSession.transcripts && Array.isArray(currentSession.transcripts)) {
            const validTranscripts = currentSession.transcripts
              .filter((transcript: any) => (
                  transcript &&
                  typeof transcript.text === 'string' &&
                  transcript.text.trim() !== '' &&
                  transcript.isFinal !== false 
              ))
              .map((transcript: any) => ({ 
                speaker: transcript.speaker === 'user' ? 'user' : 'agent',
                text: transcript.text.trim(),
              }));
            onTranscriptUpdate(validTranscripts);
          }
        } catch (err) {
          console.error('[Ultravox] Error processing transcript:', err);
        }
      };
     
      const handleError = (event: any) => {
        console.error('[Ultravox] SDK "error" event received:', event);
        const errorObj = event?.error || event;
        // console.error('[Ultravox] Error:', errorObj); // Optional: Keep if useful for debugging raw error object
        let extractedMessage = 'An unknown Ultravox error occurred.';
        if (errorObj instanceof Error) {
          extractedMessage = errorObj.message;
        } else if (typeof errorObj?.message === 'string') {
          extractedMessage = errorObj.message;
        } else if (typeof errorObj === 'string') {
          extractedMessage = errorObj;
        }
        onError(new Error("Ultravox SDK reported an error: " + extractedMessage));
      };

      let connectionTimeoutId: any = null;
      const clearConnectionTimeout = () => {
        if (connectionTimeoutId) {
          clearTimeout(connectionTimeoutId);
          connectionTimeoutId = null;
          console.log('[Ultravox] Connection timeout cleared.');
        }
      };

      const localHandleStatusUpdate = async (event: any) => {
        const currentSessionInstance = sessionRef.current;
        const currentStatus = event.target?.status;

        // Clear connection timeout if a terminal status is reached
        if (currentStatus === 'idle' || currentStatus === 'listening' || currentStatus === 'disconnected') {
          clearConnectionTimeout();
        }

        const eventTargetEndReason = event.target?.endReason;

        console.log(`[Ultravox] Status Event. Current: ${currentStatus}, Previous: ${prevStatusRef.current}, SDK Reason: ${eventTargetEndReason || 'N/A'}. Raw event:`, event);
        
        if (!currentSessionInstance && currentStatus !== 'disconnected') { // Allow disconnected to proceed for cleanup even if ref is somehow null
            console.warn('[Ultravox] Status update but no current session in ref and status is not disconnected. Ignoring event.');
            return;
        }

        onStatusChange(currentStatus || 'unknown'); // Call prop callback early

        switch (currentStatus) {
          case 'connecting':
            console.log('[Ultravox] Session status connecting. Waiting for idle...');
            setCallStatus('connecting');
            // Do not call setSession or onSessionEnd here.
            break;

          case 'idle':
            console.log('[Client] Ultravox session is now idle. Session instance:', currentSessionInstance);
            setSession(currentSessionInstance); // Provide session object to parent component
            setCallStatus('idle');
            hasReachedIdleStateRef.current = true; // Set the ref here
            
            console.log('[Client] Attempting to unmute microphone as session is idle.');
            if (currentSessionInstance && typeof currentSessionInstance.unmuteMic === 'function') {
              try {
                await currentSessionInstance.unmuteMic();
                console.log('[Client] Microphone unmuted successfully via unmuteMic().');
              } catch (error) {
                console.error('[Client] Error calling unmuteMic():', error);
                onError(error instanceof Error ? error : new Error(String(error)));
              }
            } else {
              console.warn('[Client] unmuteMic function not available on current session instance or instance is null.');
            }
            break;

          case 'listening':
            console.log('[Client] Ultravox session is now listening. Microphone is active.');
            setCallStatus('listening');
            // Fallback: if session is somehow not set by 'idle' but we reach 'listening'
            if (!session && currentSessionInstance) {
                console.warn("[Client] Session was not set by 'idle' status, setting it now due to 'listening' status.");
                setSession(currentSessionInstance);
            }
            if (!hasReachedIdleStateRef.current && currentSessionInstance) { // Also check here
                console.warn("[Client] Session was not set by 'idle' status but 'listening' was reached. Forcing idle reached true.");
                hasReachedIdleStateRef.current = true; 
            }
            break;

          case 'disconnected':
            const reason = currentSessionInstance?.endReason || eventTargetEndReason || 'unknown';
            console.log(`[Ultravox] Session disconnected. Reason: ${reason}, Previous status was: ${prevStatusRef.current}`);
            setCallEndReason(reason);
            setCallStatus('disconnected');

            // *** NEW LOGIC START ***
            const previousStatus = prevStatusRef.current;
            if (!hasReachedIdleStateRef.current || previousStatus === 'connecting') {
              const errorMessage = `Ultravox connection failed: Disconnected from '${previousStatus || 'initial'}' state before reaching 'idle'. Reason: ${reason}`;
              console.error(`[Ultravox] ${errorMessage}`);
              // Ensure onError is called. It should be available in the scope of useUltravoxSession.
              // onError is a prop passed to useUltravoxSession.
              if (typeof onError === 'function') {
                onError(new Error(errorMessage));
              } else {
                console.error('[Ultravox] onError callback is not available to report connection failure.');
              }
            }
            // *** NEW LOGIC END ***
            
            if (currentSessionInstance) {
              console.log('[Ultravox] Removing event listeners upon disconnect for session:', currentSessionInstance.id);
              // Ensure handlers are defined or passed in a way that they can be removed
              // Assuming handleTranscript, localHandleStatusUpdate, handleError, handleMicMuteChange are accessible
              currentSessionInstance.removeEventListener('transcripts', handleTranscript);
              currentSessionInstance.removeEventListener('status', localHandleStatusUpdate);
              currentSessionInstance.removeEventListener('error', handleError);
              if (currentSessionInstance.micMutedNotifier && typeof (currentSessionInstance.micMutedNotifier as any).removeListener === 'function') {
                (currentSessionInstance.micMutedNotifier as any).removeListener(handleMicMuteChange);
              }
            } else {
                console.warn('[Ultravox] No currentSessionInstance found in ref during disconnect to remove listeners from.');
            }
            
            // Call onSessionEnd - ensure currentSessionInstance might be null if never established
            if (onSessionEnd) {
                onSessionEnd(); // Simplified based on existing props, adjust if error needs to be passed
            }
            
            setSession(null); // Clear main session state from the hook's perspective
            if (sessionRef.current) { // Clear the ref only if it was the one being disconnected
                sessionRef.current = null;
            }
            hasReachedIdleStateRef.current = false; // Reset for potential future sessions
            break;
            
          default:
            console.warn(`[Ultravox] Unhandled status event: ${currentStatus}`);
            setCallStatus(currentStatus || 'unknown'); // Update with unknown status
            break;
        }
        prevStatusRef.current = currentStatus; // Update previous status
      };
      
      // Add event listeners using the handlers defined above
      console.log('[Ultravox] Adding event listeners for "transcripts", "status", "error", and "micMutedNotifier".');
      newSession.addEventListener('transcripts', handleTranscript);
      console.log('[Ultravox] Added event listener for "transcripts".');

      newSession.addEventListener('status', localHandleStatusUpdate);
      console.log('[Ultravox] Added event listener for "status".');

      newSession.addEventListener('error', handleError);
      console.log('[Ultravox] Added event listener for "error".');

      if (newSession.micMutedNotifier && typeof (newSession.micMutedNotifier as any).addListener === 'function') {
        console.log('[Ultravox] Adding micMutedNotifier event listener.');
        (newSession.micMutedNotifier as any).addListener(handleMicMuteChange);
        console.log('[Ultravox] Added event listener for "micMutedNotifier".');
      }

      // Note: WebSocket raw listeners are attached after joinCall, as socket is not available before.
      // This part of the logic remains, as it's conditional on newSession.socket.

      try {
        console.log('[Ultravox] Joining call...');
        console.log('[Debug] Calling Ultravox SDK joinCall with joinUrl:', joinUrl);

        // Set the connection timeout
        connectionTimeoutId = setTimeout(() => {
          // Check connectionTimeoutId to prevent action if already cleared by a status update
          if (sessionRef.current?.status === 'connecting' && connectionTimeoutId) {
            console.error('[Ultravox] Connection attempt timed out after 15s while status was still "connecting".');
            // Ensure onError is available in this scope (it's a prop of useUltravoxSession)
            onError(new Error('Ultravox connection attempt timed out.'));
            // Attempt to leave the call. This should trigger a 'disconnected' status,
            // which will then also call clearConnectionTimeout via localHandleStatusUpdate.
            sessionRef.current?.leaveCall().catch(e => console.warn('[Ultravox] Error leaving call on timeout:', e));
          }
          connectionTimeoutId = null; // Nullify after execution or if condition not met
        }, 15000); // 15 seconds

        await newSession.joinCall(joinUrl);
        console.log('[Ultravox] joinCall promise resolved. Waiting for status events to determine outcome and clear timeout.');
        // If joinCall resolves very quickly AND status becomes 'idle'/'listening'/'disconnected' immediately,
        // the status handler's clearConnectionTimeout should have already run.
        // If status is still 'connecting', the timeout is still active and relevant.
        
        // Attach raw WebSocket listeners if socket is available, after joinCall has resolved
        if (newSession.socket) {
            console.log('[WebSocket RAW] Socket object found after joinCall resolved. Attaching raw event listeners.', newSession.socket);
            const ws = newSession.socket;
            ws.onopen = (event) => console.log('[WebSocket RAW] Open:', event);
            ws.onmessage = (event) => console.log('[WebSocket RAW] Message:', event.data);
            ws.onerror = (event) => {
              console.error('[WebSocket RAW] Error Details:', {
                type: event.type,
                // target: event.target, // Comment out or remove if target causes circular JSON issues or is too verbose
                readyState: ws.readyState,
                url: ws.url,
                // protocol: ws.protocol, // Usually empty for 'error'
                // extensions: ws.extensions, // Usually empty for 'error'
              });
              onError(new Error(`WebSocket error: type ${event.type}, readyState ${ws.readyState}, url ${ws.url}`));
            };
            ws.onclose = (event) => {
              console.error('[WebSocket RAW] Close Details:', { // Changed to console.error for consistency with error conditions
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean,
                readyState: ws.readyState, // Added readyState
                url: ws.url, // Added URL
                // Common close codes:
                // 1006: Abnormal Closure (no close frame received) - This is the key one we're seeing
                // 1000: Normal closure
                // 1001: Going away
                // 1002: Protocol error
                // 1003: Unsupported data
              });
              if (!event.wasClean || event.code === 1006) { // Only call onError for abnormal closures
                onError(new Error(`WebSocket abnormal closure: Code ${event.code}, Reason: '${event.reason}', wasClean: ${event.wasClean}, url ${ws.url}`));
              }
            };
            // No need for a separate "Raw event listeners attached." log, the onopen/onclose will show activity.
        } else {
            console.warn('[WebSocket RAW] newSession.socket is not available immediately after joinCall resolved. Cannot attach raw listeners.');
        }

        setIsConnecting(false); // Still set isConnecting to false, but session state is handled by status updates
        return true; // Indicate joinCall was invoked successfully. Session establishment is async.
      } catch (error: any) {
        clearConnectionTimeout(); // Clear timeout immediately if joinCall itself fails
        console.error('[Ultravox] Error during newSession.joinCall() invocation:', error);
        setIsConnecting(false);

        let errorForCallback: Error;
        if (error instanceof Error) {
          errorForCallback = error;
        } else if (error && typeof error.message === 'string') {
          errorForCallback = new Error(error.message);
        } else {
          errorForCallback = new Error('Ultravox joinCall failed to invoke');
        }
        onError(errorForCallback); // Report specific joinCall invocation error

        const appError = errorHandler.handle(error, { source: 'ultravox_join_call_invocation' });
        toast({
          title: 'Connection Error',
          description: appError.userMessage || 'Could not initiate the connection to the interview service.',
          variant: 'destructive',
        });
        
        // Clean up listeners attached to newSession if joinCall itself fails
        // Note: sessionRef.current should be newSession here.
        const sessionToClean = sessionRef.current; 
        if (sessionToClean && typeof sessionToClean.removeEventListener === 'function') {
            console.log('[Ultravox] Cleaning up listeners due to joinCall invocation error on session instance:', sessionToClean.id);
            sessionToClean.removeEventListener('transcripts', handleTranscript);
            sessionToClean.removeEventListener('status', localHandleStatusUpdate);
            sessionToClean.removeEventListener('error', handleError);
            if (sessionToClean.micMutedNotifier && typeof (sessionToClean.micMutedNotifier as any).removeListener === 'function') {
                (sessionToClean.micMutedNotifier as any).removeListener(handleMicMuteChange);
            }
        }
        
        if (sessionRef.current) { 
            sessionRef.current = null;
        }
        // setSession(null); // Not strictly needed here as it wasn't set to newSession yet
        return false; // Indicate joinCall invocation failed
      }
    } catch (error: any) {
      console.error('[Ultravox] Error during session initialization:', error);
      setIsConnecting(false);

      let errorForCallback: Error;
      if (error instanceof Error) {
        errorForCallback = error;
      } else if (error && typeof error.message === 'string') {
        errorForCallback = new Error(error.message);
      } else {
        errorForCallback = new Error('Session initialization failed');
      }
      onError(errorForCallback);

      const appError = errorHandler.handle(error, { source: 'ultravox_session_init' });
      toast({
        title: 'Initialization Error',
        description: appError.userMessage || 'Could not initialize the interview session.',
        variant: 'destructive',
      });

      return false;
    }
  }, [
    onTranscriptUpdate,
    onStatusChange,
    onSessionEnd,
    onError,
    toast,
    errorHandler
  ]);

  /**
   * End the current session
   */
  const endSession = useCallback(async () => {
    console.log('[Ultravox] endSession CALLED. Call stack:'); // Added
    console.trace(); // Added
    const currentSession = sessionRef.current; // Capture current session from ref
    if (currentSession && typeof currentSession.leaveCall === 'function') {
      try {
        console.log('[Ultravox] endSession: Attempting to leave call...');
        await currentSession.leaveCall(); // This should trigger 'disconnected' status event
        console.log('[Ultravox] endSession: leaveCall promise resolved.');
      } catch (error) {
        console.error('[Ultravox] endSession: Error during leaveCall:', error);
        // Call onError prop, as this is an unexpected error during cleanup
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    } else {
      console.log('[Ultravox] endSession: No current session or leaveCall not available.');
    }
  }, [onError]); // Added onError as a dependency

  /**
   * Get current session transcripts
   */
  const getTranscripts = useCallback((): Utterance[] => {
    if (!sessionRef.current || !sessionRef.current.transcripts) {
      return [];
    }

    return sessionRef.current.transcripts
      .filter((t: any) => t && t.text && typeof t.text === 'string')
      .map((t: any) => ({
        speaker: t.speaker === 'user' ? 'user' : 'agent',
        text: t.text.trim(),
      }));
  }, []);

  /**
   * Check if microphone is muted
   */
  const isMicMuted = useCallback((): boolean => {
    if (sessionRef.current && typeof sessionRef.current.isMicMuted === 'function') {
      return sessionRef.current.isMicMuted();
    }
    return false;
  }, []);

  /**
   * Toggle microphone mute
   */
  const toggleMic = useCallback(() => {
    if (!sessionRef.current) return;

    if (isMicMuted()) {
      sessionRef.current.unmuteMic?.();
    } else {
      sessionRef.current.muteMic?.();
    }
  }, [isMicMuted]);

  // Cleanup on unmount
  useEffect(() => {
    // This effect runs once on mount to set up the cleanup
    return () => {
      // This cleanup runs ONLY on component unmount
      const sessionToClean = sessionRef.current;
      if (sessionToClean && typeof sessionToClean.leaveCall === 'function') {
        console.log('[Ultravox] useEffect unmount cleanup: Component is unmounting. Leaving call if session exists.');
        sessionToClean.leaveCall().catch((err: any) => { // Call leaveCall directly on the ref's value
          console.error('[Ultravox] Error in unmount cleanup (leaveCall):', err);
          // Potentially call onErrorCallback here if appropriate for unmount errors
          onError(err instanceof Error ? err : new Error(String(err))); // Pass the onError prop to the hook.
        });
      }
    };
  }, [onError]); // Added onError as dependency

  return {
    session,
    isConnecting,
    initializeSession,
    endSession,
    getTranscripts,
    isMicMuted,
    toggleMic,
    callStatus, // Added
    callEndReason, // Added
  };
}
