// components/UltravoxSessionManager.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useUltravoxSession } from '@/hooks/useUltravoxSession';
import { Utterance } from '@/lib/types';
import { logger } from '@/lib/logger';
import { checkBrowserCompatibility, checkMicrophonePermissions } from '@/lib/browser-compat';
import { testWebSocketConnection } from '@/lib/ultravox-debug';

interface UltravoxSessionManagerProps {
  joinUrl: string | null; 
  callId: string | null;  
  shouldConnect: boolean;
  onStatusChange: (status: string, details?: any) => void;
  onTranscriptUpdate: (transcripts: Utterance[]) => void;
  onSessionEnd: (details: { code?: number; reason?: string; error?: Error }) => void;
  onError: (error: Error, context?: string) => void;
  onExperimentalMessage?: (message: any) => void; // Added new optional prop
}

export function UltravoxSessionManager(props: UltravoxSessionManagerProps) {
  const { joinUrl, callId, shouldConnect, ...callbacks } = props;
  const ultravoxSession = useUltravoxSession(callbacks); // Callbacks are passed to the hook
  const hasAttemptedConnectionRef = useRef(false);
  const performingSessionManagementRef = useRef(false); // Renamed for clarity
  const hasEncounteredErrorRef = useRef(false);
  const prevJoinUrlRef = useRef<string | null>(null);
  const prevCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    const effectCallIdLog = callId || 'unknown-call-id'; // Use for logging current callId
    logger.log('[UltravoxSessionManager] Main effect triggered.', {
      shouldConnect,
      joinUrlProvided: !!joinUrl,
      callIdProvided: !!callId,
      hasAttempted: hasAttemptedConnectionRef.current,
      isManaging: performingSessionManagementRef.current,
      hasError: hasEncounteredErrorRef.current,
      prevCallId: prevCallIdRef.current,
      currentCallId: callId,
    });

    // Check if callId or joinUrl has changed, indicating a new session context
    if (joinUrl !== prevJoinUrlRef.current || callId !== prevCallIdRef.current) {
      logger.log(`[UltravoxSessionManager] Context change detected (joinUrl or callId changed). Old: ${prevCallIdRef.current}, New: ${effectCallIdLog}. Resetting flags.`, {
        oldJoinUrl: prevJoinUrlRef.current, newJoinUrl: joinUrl,
        oldCallId: prevCallIdRef.current, newCallId: callId
      });
      hasAttemptedConnectionRef.current = false;
      hasEncounteredErrorRef.current = false;
      // No need to reset performingSessionManagementRef here as it guards the async function itself.
      // Update prev refs to current values
      prevJoinUrlRef.current = joinUrl;
      prevCallIdRef.current = callId;
    }

    const performConnectionSequence = async () => {
      if (!joinUrl || !callId) {
        logger.warn('[UltravoxSessionManager] Critical: joinUrl or callId is missing post-check. This should not happen if initial checks are correct.');
        // This error should ideally be caught by earlier checks in the effect.
        // If it still happens, it's an unexpected state.
        if(shouldConnect) { // Only error if we actually intended to connect
            callbacks.onError(new Error('Connection cannot proceed: joinUrl or callId became null unexpectedly.'), 'PreCheck');
        }
        return; // Should not proceed.
      }

      // Guard against re-entrancy for the async operations
      if (performingSessionManagementRef.current) {
        logger.log('[UltravoxSessionManager] Session management (connection/disconnection) already in progress. Aborting this run.');
        return;
      }
      performingSessionManagementRef.current = true;
      logger.log(`[UltravoxSessionManager] Starting connection sequence for callId: ${effectCallIdLog}`);
      
      // Set hasAttemptedConnectionRef to true before starting SDK operations for this attempt.
      // This signifies that for the current callId/joinUrl, we are now making an attempt.
      hasAttemptedConnectionRef.current = true;
      logger.log(`[UltravoxSessionManager] Set hasAttemptedConnectionRef to true for callId: ${effectCallIdLog}`);

      try {
        logger.log('[UltravoxSessionManager] Running pre-flight checks...');
        const { compatible, issues } = checkBrowserCompatibility();
        if (!compatible) throw new Error(`Browser incompatible: ${issues.join(', ')}`);
        logger.log('[UltravoxSessionManager] Browser compatibility: OK');

        const micPerms = await checkMicrophonePermissions();
        if (!micPerms.granted) throw new Error(micPerms.error || 'Microphone permission denied');
        logger.log('[UltravoxSessionManager] Microphone permissions: OK');

        if (typeof WebSocket === 'undefined') throw new Error('WebSocket API not available');
        logger.log('[UltravoxSessionManager] WebSocket API: OK');

        const wsTestSuccess = await testWebSocketConnection(joinUrl);
        if (wsTestSuccess) logger.log('[UltravoxSessionManager] Preliminary WebSocket test: Successful');
        else logger.warn('[UltravoxSessionManager] Preliminary WebSocket test: Failed. Connection will still be attempted.');
        
        logger.log('[UltravoxSessionManager] All pre-flight checks completed.');

        await ultravoxSession.initializeSession();
        logger.log('[UltravoxSessionManager] ultravoxSession.initializeSession() succeeded.');
        
        // Check again if shouldConnect is still true after async initializeSession
        if (!shouldConnect) {
          logger.log('[UltravoxSessionManager] shouldConnect became false during initializeSession. Aborting connect.');
          // Session was initialized, so it might need to be ended.
          // endSession will be called by the main logic block when shouldConnect is false.
          throw new Error('Connection aborted as shouldConnect turned false during initialization.');
        }
        
        await ultravoxSession.connect(joinUrl);
        logger.log('[UltravoxSessionManager] ultravoxSession.connect() succeeded.');
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[UltravoxSessionManager] Error during connection sequence for callId ${effectCallIdLog}: ${errorMessage}`, error);
        
        hasEncounteredErrorRef.current = true; // Set error flag
        logger.log(`[UltravoxSessionManager] Set hasEncounteredErrorRef to true for callId: ${effectCallIdLog}`);
        callbacks.onError(error instanceof Error ? error : new Error(errorMessage), 'ConnectionSetup');
        // DO NOT reset hasAttemptedConnectionRef here. It signifies an attempt was made for this callId/joinUrl.
        // The hasEncounteredErrorRef will prevent immediate retries for this context.
      } finally {
        performingSessionManagementRef.current = false;
        logger.log(`[UltravoxSessionManager] Connection sequence finished for callId: ${effectCallIdLog}. performingSessionManagementRef set to false.`);
      }
    };

    // Main logic for connecting or disconnecting
    if (shouldConnect) {
      if (!joinUrl || !callId) {
        logger.warn('[UltravoxSessionManager] shouldConnect is true, but joinUrl or callId is missing. Waiting for valid props.');
        // Ensure performingSessionManagementRef is false if we bail out here, otherwise it might get stuck.
        if (performingSessionManagementRef.current) performingSessionManagementRef.current = false;
      } else if (!hasAttemptedConnectionRef.current && !hasEncounteredErrorRef.current) {
        logger.log(`[UltravoxSessionManager] Conditions met for new connection attempt for callId: ${effectCallIdLog}. Starting sequence.`);
        performConnectionSequence();
      } else if (hasAttemptedConnectionRef.current && hasEncounteredErrorRef.current) {
        logger.log(`[UltravoxSessionManager] Connection previously attempted for callId ${effectCallIdLog} but encountered an error. Not retrying automatically.`);
      } else if (hasAttemptedConnectionRef.current && !hasEncounteredErrorRef.current) {
        logger.log(`[UltravoxSessionManager] Connection already attempted/active for callId ${effectCallIdLog} and no error encountered. No action needed.`);
      } else {
         logger.log(`[UltravoxSessionManager] shouldConnect is true, but other conditions not met for callId ${effectCallIdLog}. No action.`, 
         { attempted: hasAttemptedConnectionRef.current, error: hasEncounteredErrorRef.current});
      }
    } else { // shouldConnect is false
      if (hasAttemptedConnectionRef.current || hasEncounteredErrorRef.current) { // If there was any attempt or error for the current/previous session context
        logger.log(`[UltravoxSessionManager] shouldConnect is false for callId ${effectCallIdLog}. Session was active, attempted, or had an error. Ending session and resetting flags.`);
        if (!performingSessionManagementRef.current) { // Ensure not to interfere with an ongoing sequence
            performingSessionManagementRef.current = true; // Guard this block
            ultravoxSession.endSession().finally(() => {
                performingSessionManagementRef.current = false;
                logger.log(`[UltravoxSessionManager] endSession call finished in shouldConnect=false block for ${effectCallIdLog}.`);
            });
        } else {
            logger.log(`[UltravoxSessionManager] endSession for ${effectCallIdLog} skipped as performSessionManagementRef is true.`);
        }
        hasAttemptedConnectionRef.current = false;
        hasEncounteredErrorRef.current = false; // Reset error flag when explicitly disconnected
        logger.log(`[UltravoxSessionManager] Reset hasAttemptedConnectionRef and hasEncounteredErrorRef for callId ${effectCallIdLog} due to shouldConnect being false.`);
      } else {
        logger.log(`[UltravoxSessionManager] shouldConnect is false for callId ${effectCallIdLog}, and no active/attempted session. No action needed.`);
      }
       // Safety reset for performingSessionManagementRef if it somehow got stuck true when shouldConnect is false
      if (performingSessionManagementRef.current && !shouldConnect) {
           performingSessionManagementRef.current = false;
           logger.warn('[UltravoxSessionManager] Reset performingSessionManagementRef as shouldConnect is false and it was still true.');
      }
    }
  }, [shouldConnect, joinUrl, callId, ultravoxSession, callbacks]);

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      const callIdLog = prevCallIdRef.current || callId || 'unknown-at-unmount';
      logger.log(`[UltravoxSessionManager] Unmounting (callId: ${callIdLog}). Ensuring session is properly ended and flags reset.`);
      // ultravoxSession.endSession() should be idempotent and handle if already disconnected.
      ultravoxSession.endSession();
      
      // Explicitly reset all relevant refs on unmount
      hasAttemptedConnectionRef.current = false;
      performingSessionManagementRef.current = false;
      hasEncounteredErrorRef.current = false;
      prevJoinUrlRef.current = null; // Clear previous context tracking
      prevCallIdRef.current = null;
      logger.log(`[UltravoxSessionManager] All refs reset during unmount for callId: ${callIdLog}.`);
    };
  }, [ultravoxSession, callId]); // Include callId to log the correct one on unmount if it was available. ultravoxSession is stable.

  return (
    <div style={{ display: 'none' }} data-testid="ultravox-manager">
      Ultravox Manager Status: {props.shouldConnect ? 'Attempting/Connected' : 'Idle/Disconnected'} | CallID: {props.callId || 'N/A'}
    </div>
  );
}

// Log creation/update and description
console.log('Overwritten components/UltravoxSessionManager.tsx: Manages Ultravox session lifecycle, performs pre-connection checks, and integrates with useUltravoxSession hook. Includes refined logic for refs and connection sequence.');
