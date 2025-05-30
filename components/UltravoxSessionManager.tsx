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
  const performingPreChecksRef = useRef(false);

  useEffect(() => {
    const effectCallId = callId || 'unknown-call-id'; // Use for logging
    logger.log('[UltravoxSessionManager] Main effect triggered.', { 
      shouldConnect, 
      joinUrlProvided: !!joinUrl, 
      callIdProvided: !!callId, 
      hasAttempted: hasAttemptedConnectionRef.current, 
      isPerformingPreChecks: performingPreChecksRef.current 
    });

    const performConnectionSequence = async () => {
      if (!joinUrl || !callId) {
        logger.warn('[UltravoxSessionManager] joinUrl or callId is missing. Cannot connect.');
        if(shouldConnect) { // Only error if we actually intended to connect
            callbacks.onError(new Error('Connection cannot proceed: joinUrl or callId is missing.'), 'PreCheck');
        }
        return;
      }

      if (performingPreChecksRef.current) {
        logger.log('[UltravoxSessionManager] Pre-checks or connection sequence already in progress. Aborting this run.');
        return;
      }
      performingPreChecksRef.current = true;
      logger.log(`[UltravoxSessionManager] Starting connection sequence for callId: ${effectCallId}`);

      try {
        // 1. Pre-flight checks
        logger.log('[UltravoxSessionManager] Running pre-flight checks...');
        const { compatible, issues } = checkBrowserCompatibility();
        if (!compatible) {
          throw new Error(`Browser incompatible: ${issues.join(', ')}`);
        }
        logger.log('[UltravoxSessionManager] Browser compatibility: OK');

        const micPerms = await checkMicrophonePermissions();
        if (!micPerms.granted) {
          throw new Error(micPerms.error || 'Microphone permission denied');
        }
        logger.log('[UltravoxSessionManager] Microphone permissions: OK');

        if (typeof WebSocket === 'undefined') {
          throw new Error('WebSocket API not available in this browser');
        }
        logger.log('[UltravoxSessionManager] WebSocket API: OK');

        // Optional: Test WebSocket connection (non-blocking for actual attempt)
        const wsTestSuccess = await testWebSocketConnection(joinUrl);
        if (wsTestSuccess) {
          logger.log('[UltravoxSessionManager] Preliminary WebSocket test: Successful');
        } else {
          logger.warn('[UltravoxSessionManager] Preliminary WebSocket test: Failed. Connection will still be attempted.');
        }
        logger.log('[UltravoxSessionManager] All pre-flight checks completed.');

        // 2. Initialize and Connect
        // Mark that we are about to attempt the actual connection via the hook
        // This ref ensures we don't try to connect multiple times if shouldConnect remains true
        hasAttemptedConnectionRef.current = true; 
        
        await ultravoxSession.initializeSession();
        logger.log('[UltravoxSessionManager] ultravoxSession.initializeSession() called.');
        
        await ultravoxSession.connect(joinUrl);
        logger.log('[UltravoxSessionManager] ultravoxSession.connect() called.');
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[UltravoxSessionManager] Error during connection sequence for callId ${effectCallId}: ${errorMessage}`, error);
        callbacks.onError(error instanceof Error ? error : new Error(errorMessage), 'ConnectionSetup');
        // If pre-checks or connection fails, allow for a new attempt if props change
        hasAttemptedConnectionRef.current = false; 
      } finally {
        performingPreChecksRef.current = false;
        logger.log(`[UltravoxSessionManager] Connection sequence finished for callId: ${effectCallId}. performingPreChecksRef set to false.`);
      }
    };

    if (shouldConnect && !hasAttemptedConnectionRef.current) {
      if (!joinUrl || !callId) {
        logger.warn('[UltravoxSessionManager] shouldConnect is true, but joinUrl or callId is missing. Waiting for valid props.');
         if (performingPreChecksRef.current) performingPreChecksRef.current = false; // Reset if stuck
      } else {
        performConnectionSequence();
      }
    } else if (!shouldConnect && hasAttemptedConnectionRef.current) {
      logger.log(`[UltravoxSessionManager] shouldConnect is false and connection was active/attempted for callId ${effectCallId}. Ending session.`);
      ultravoxSession.endSession();
      hasAttemptedConnectionRef.current = false; // Reset, allowing re-connection if shouldConnect becomes true again.
      if (performingPreChecksRef.current) performingPreChecksRef.current = false; // Reset if stuck
    } else {
      logger.log('[UltravoxSessionManager] No action taken by main effect (conditions not met or already handled).', { 
         shouldConnect, hasAttempted: hasAttemptedConnectionRef.current, performingPreChecks: performingPreChecksRef.current 
      });
       if (performingPreChecksRef.current && !shouldConnect) { // Safety net: if prechecks were running but shouldConnect became false
           performingPreChecksRef.current = false;
           logger.warn('[UltravoxSessionManager] Reset performingPreChecksRef due to shouldConnect becoming false during prechecks.');
       }
    }
  // Key dependencies:
  // - shouldConnect: Primary driver for starting/stopping.
  // - joinUrl, callId: If these change, a new session might be needed. Resetting hasAttemptedConnectionRef when shouldConnect is false allows this.
  // - ultravoxSession: Provides stable methods from the hook.
  // - callbacks: The hook itself manages callback stability with propsRef.
  }, [shouldConnect, joinUrl, callId, ultravoxSession, callbacks]);

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      logger.log('[UltravoxSessionManager] Unmounting. Ensuring session is properly ended.');
      ultravoxSession.endSession();
      // Explicitly reset refs on unmount to clear state for any potential remounts.
      hasAttemptedConnectionRef.current = false;
      performingPreChecksRef.current = false;
    };
  }, [ultravoxSession]); // ultravoxSession object itself is stable

  return (
    <div style={{ display: 'none' }} data-testid="ultravox-manager">
      Ultravox Manager Status: {props.shouldConnect ? 'Attempting/Connected' : 'Idle/Disconnected'} | CallID: {props.callId || 'N/A'}
    </div>
  );
}

// Log creation/update and description
console.log('Overwritten components/UltravoxSessionManager.tsx: Manages Ultravox session lifecycle, performs pre-connection checks, and integrates with useUltravoxSession hook. Includes refined logic for refs and connection sequence.');
