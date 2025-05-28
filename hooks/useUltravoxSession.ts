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

      // Define ALL event handlers here, once, so they are in scope for add/remove.
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
        const errorObj = event?.error || event;
        console.error('[Ultravox] Error:', errorObj);
        let errorToReport: Error;
        if (errorObj instanceof Error) {
          errorToReport = errorObj;
        } else if (typeof errorObj?.message === 'string') {
          errorToReport = new Error(errorObj.message);
        } else if (typeof errorObj === 'string') {
          errorToReport = new Error(errorObj);
        } else {
          errorToReport = new Error('An unknown Ultravox error occurred.');
        }
        onError(errorToReport);
      };

      const localHandleStatusUpdate = async (event: any) => {
        console.log('[Ultravox] Raw status event object:', event);

        const currentSessionInstance = sessionRef.current; // Use sessionRef consistently
        if (!currentSessionInstance) {
            console.warn('[Ultravox] Status update but no current session in ref.');
            return;
        }

        // Changed parsing from event.detail to event.target
        const currentStatus = event.target?.status;
        const previousStatus = event.target?.previousStatus; // Parsed, though not used in current logic flow
        const eventTargetEndReason = event.target?.endReason;

        console.log(`[Ultravox] Parsed Status from event.target: ${currentStatus}, Prev: ${previousStatus || 'N/A'}, Reason from event.target: ${eventTargetEndReason || 'N/A'}`);
        setCallStatus(currentStatus || null);
        onStatusChange(currentStatus || 'unknown'); // Call prop callback

        if (currentStatus === 'idle') {
          console.log(`[Ultravox] In 'idle' state. Current session.micMuted: ${currentSessionInstance.micMuted}`);
          if (currentSessionInstance.micMuted) {
            console.log('[Ultravox] Session is idle, attempting to unmute microphone...');
            try {
              await currentSessionInstance.unmuteMic();
              console.log('[Ultravox] Microphone unmuted successfully.');
            } catch (unmuteError) {
              console.error('[Ultravox] Error unmuting microphone when idle:', unmuteError);
              onError(unmuteError instanceof Error ? unmuteError : new Error(String(unmuteError)));
            }
          } else {
            console.log('[Ultravox] Session is idle, microphone is already unmuted.');
          }
        } else if (currentStatus === 'listening') {
          console.log('[Ultravox] Session is listening (mic should be active).');
        } else if (currentStatus === 'disconnected') {
          // Prioritize session instance's endReason, then event.target's endReason
          const finalReason = currentSessionInstance.endReason || eventTargetEndReason || 'unknown';
          console.log(`[Ultravox] Session disconnected. Reason: ${finalReason}`);
          setCallEndReason(finalReason);
          onSessionEnd(); // Call prop callback

          console.log('[Ultravox] Removing event listeners upon disconnect for session.');
          currentSessionInstance.removeEventListener('transcripts', handleTranscript);
          currentSessionInstance.removeEventListener('status', localHandleStatusUpdate);
          currentSessionInstance.removeEventListener('error', handleError);
          // Note: handleMicMuteChange removal is now correctly scoped
          if (currentSessionInstance.micMutedNotifier && typeof (currentSessionInstance.micMutedNotifier as any).removeListener === 'function') {
            (currentSessionInstance.micMutedNotifier as any).removeListener(handleMicMuteChange);
          }

          if (sessionRef.current === currentSessionInstance) {
            sessionRef.current = null;
          }
          setSession(null); // Clear main session state
        }
      };
      
      // Add event listeners using the handlers defined above
      newSession.addEventListener('transcripts', handleTranscript);
      console.log('[Ultravox] Added event listener for "transcripts".');

      newSession.addEventListener('status', localHandleStatusUpdate); 
      console.log('[Ultravox] Added event listener for "status".');
      
      newSession.addEventListener('error', handleError);
      console.log('[Ultravox] Added event listener for "error".');
      
      if (newSession.micMutedNotifier && typeof (newSession.micMutedNotifier as any).addListener === 'function') {
        console.log('[Ultravox] Adding micMutedNotifier event listener.'); // Log for adding
        (newSession.micMutedNotifier as any).addListener(handleMicMuteChange);
        console.log('[Ultravox] Added event listener for "micMutedNotifier".'); // Confirmation log
      }

      console.log('[Ultravox] Joining call...');
      console.log('[Debug] Calling Ultravox SDK joinCall with joinUrl:', joinUrl);
      await newSession.joinCall(joinUrl);
      console.log('[Ultravox] Successfully joined call');
      
      setSession(newSession); 
      setIsConnecting(false);
      return true;
    } catch (error: any) {
      console.error('[Ultravox] Error initializing session:', error);
      setIsConnecting(false);

      const appError = errorHandler.handle(error, { source: 'ultravox_init' });
      onError(new Error(appError.userMessage || appError.message));

      toast({
        title: 'Connection Error',
        description: appError.userMessage || 'Could not connect to the interview service.',
        variant: 'destructive',
      });
      
      const sessionToClean = sessionRef.current; // Use the instance from the ref for cleanup
      if (sessionToClean && typeof sessionToClean.removeEventListener === 'function') {
        console.log('[Ultravox] Cleaning up listeners due to join call error on session instance from ref:', sessionToClean.id);
        sessionToClean.removeEventListener('transcripts', handleTranscript); // handleTranscript is in scope
        sessionToClean.removeEventListener('status', localHandleStatusUpdate); // localHandleStatusUpdate is in scope
        sessionToClean.removeEventListener('error', handleError); // handleError is in scope
        if (sessionToClean.micMutedNotifier && typeof (sessionToClean.micMutedNotifier as any).removeListener === 'function') {
            console.log('[Ultravox] Removing micMutedNotifier listener due to join call error.');
            (sessionToClean.micMutedNotifier as any).removeListener(handleMicMuteChange); // handleMicMuteChange is in scope
        }
      }
      
      if (sessionRef.current) { 
        sessionRef.current = null;
      }
      setSession(null); 
      return false;
    }
  }, [
      onTranscriptUpdate, 
      onStatusChange, 
      onSessionEnd, 
      onError, 
      toast, 
      errorHandler, 
      // config variable is not directly used in useCallback, UltravoxSession might use env vars via process.env
      setCallStatus, 
      setCallEndReason
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
  }, []); // EMPTY DEPENDENCY ARRAY ensures this cleanup only runs on unmount

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