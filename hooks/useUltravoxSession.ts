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
      const sessionOptions = {}; // Removed experimentalMessages
      console.log('[Debug] Initializing UltravoxSession with options (experimentalMessages removed):', sessionOptions);
      const newSession = new UltravoxSession(sessionOptions);

      // Enhanced transcript handler
      const handleTranscript = (event: any) => {
        try {
          console.log('[Ultravox] Transcript event received:', event);

          if (newSession.transcripts && Array.isArray(newSession.transcripts)) {
            const validTranscripts = newSession.transcripts
              .filter((transcript: any) => {
                return (
                  transcript &&
                  typeof transcript.text === 'string' &&
                  transcript.text.trim() !== '' &&
                  transcript.isFinal !== false
                );
              })
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

      // Status change handler
      const handleStatusChange = (eventOrStatus: any) => {
        console.log('[Ultravox] Raw status update event:', eventOrStatus); // Log raw event as requested

        let currentStatus: string | undefined;
        let reason: string | undefined;

        // Attempt to parse status and reason from the event structure
        if (typeof eventOrStatus === 'string') {
          currentStatus = eventOrStatus;
        } else if (eventOrStatus && typeof eventOrStatus.detail !== 'undefined') { // Check eventOrStatus.detail presence
          if (typeof eventOrStatus.detail === 'string') {
            currentStatus = eventOrStatus.detail;
          } else if (eventOrStatus.detail && typeof eventOrStatus.detail.status === 'string') { // Check eventOrStatus.detail.status
            currentStatus = eventOrStatus.detail.status;
            reason = eventOrStatus.detail.reason;
          }
        }
       
        // Fallback to session properties if not found in event, or if event is just a simple string
        // Ensure newSession is the session instance that these listeners are attached to.
        if (!currentStatus && newSession && typeof newSession.status === 'string') {
          currentStatus = newSession.status;
        }
        if (!reason && newSession && typeof newSession.endReason === 'string') { // Assuming endReason exists
          reason = newSession.endReason;
        }

        // Default to 'unknown' if status could not be determined
        currentStatus = currentStatus || 'unknown';

        console.log(`[Ultravox] Processed status: ${currentStatus}, Reason: ${reason || 'not provided'}`);
       
        // Call the external onStatusChange callback
        onStatusChange(currentStatus);

        if (currentStatus === 'disconnected') {
          console.log('[Ultravox] Session disconnected. Reason:', reason || 'unknown');
          onSessionEnd(); // Call the external onSessionEnd callback

          // Clean up listeners on this specific session instance
          // Ensure newSession, handleTranscript, this handleStatusChange, and handleError are in scope
          if (newSession) {
            console.log('[Ultravox] Removing event listeners from disconnected session.');
            newSession.removeEventListener('transcripts', handleTranscript);
            newSession.removeEventListener('status', handleStatusChange); // Pass the function itself
            newSession.removeEventListener('error', handleError);
          }
        }
        // N.B. User example had 'connected' status handling, but current hook only calls onStatusChange.
        // This is fine, as onStatusChange will receive 'connected'.
      };

      // Error handler
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

      // Add event listeners
      newSession.addEventListener('transcripts', handleTranscript);
      newSession.addEventListener('status', handleStatusChange);
      newSession.addEventListener('error', handleError);

      console.log('[Ultravox] Joining call...');
      console.log('[Debug] Calling Ultravox SDK joinCall with joinUrl:', joinUrl);
      await newSession.joinCall(joinUrl);
      console.log('[Ultravox] Successfully joined call');

      // Unmute microphone
      try {
        if (typeof newSession.unmuteMic === 'function') {
          console.log('[Ultravox] Attempting to unmute microphone (SDK call)...'); // Added
          newSession.unmuteMic();
          console.log('[Ultravox] Microphone unmuted');
        }
      } catch (micError) {
        console.error('[Ultravox] Error unmuting microphone:', micError);
      }

      sessionRef.current = newSession;
      setSession(newSession);
      setIsConnecting(false);

      return true;
    } catch (error: any) {
      console.error('[Ultravox] Error initializing session:', error);
      setIsConnecting(false);

      const appError = errorHandler.handle(error, { source: 'ultravox_init' });
      // appError itself is an Error object, so it can be passed directly if its structure is suitable,
      // or wrap its message in a new Error.
      // Given appError has userMessage, it's better to pass a new Error with that message.
      onError(new Error(appError.userMessage || appError.message));

      toast({
        title: 'Connection Error',
        description: appError.userMessage || 'Could not connect to the interview service.',
        variant: 'destructive',
      });

      if (newSession && typeof newSession.removeEventListener === 'function') {
        console.log('[Ultravox] Cleaning up listeners due to join call error.');
        newSession.removeEventListener('transcripts', handleTranscript);
        newSession.removeEventListener('status', handleStatusChange);
        newSession.removeEventListener('error', handleError);
      }
      return false;
    }
  }, [onTranscriptUpdate, onStatusChange, onSessionEnd, onError, toast, errorHandler]);

  /**
   * End the current session
   */
  const endSession = useCallback(async () => {
    if (sessionRef.current && typeof sessionRef.current.leaveCall === 'function') {
      try {
        console.log('[Ultravox] Leaving call...');
        await sessionRef.current.leaveCall();
        console.log('[Ultravox] Successfully left call');
      } catch (error) {
        console.error('[Ultravox] Error leaving call:', error);
      }
    }

    sessionRef.current = null;
    setSession(null);
  }, []);

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
    return () => {
      if (sessionRef.current) {
        endSession();
      }
    };
  }, [endSession]);

  return {
    session,
    isConnecting,
    initializeSession,
    endSession,
    getTranscripts,
    isMicMuted,
    toggleMic,
  };
}