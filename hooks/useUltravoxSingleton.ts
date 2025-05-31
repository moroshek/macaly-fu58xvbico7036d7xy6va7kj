// hooks/useUltravoxSingleton.ts
import { useEffect, useRef } from 'react';
import { ultravoxSingleton } from '@/lib/ultravox-singleton';
import { logger } from '@/lib/logger';
import { checkBrowserCompatibility, checkMicrophonePermissions } from '@/lib/browser-compat';
import { useVisibilityState } from './useVisibilityState';

interface UseUltravoxSingletonProps {
  joinUrl: string | null;
  callId: string | null;
  shouldConnect: boolean;
  onStatusChange: (status: string, details?: any) => void;
  onTranscriptUpdate: (transcripts: any[]) => void;
  onSessionEnd: (details: { code?: number; reason?: string; error?: Error }) => void;
  onError: (error: Error, context?: string) => void;
  onExperimentalMessage?: (message: any) => void;
}

export function useUltravoxSingleton(props: UseUltravoxSingletonProps) {
  const { joinUrl, callId, shouldConnect, ...callbacks } = props;
  const hasConnectedRef = useRef(false);
  const isHandlingVisibilityChangeRef = useRef(false);

  // Set up visibility state handling
  const { getHiddenDuration, isCurrentlyVisible } = useVisibilityState({
    onVisible: () => {
      logger.log('[useUltravoxSingleton] Page became visible');
      
      if (isHandlingVisibilityChangeRef.current) {
        logger.log('[useUltravoxSingleton] Already handling visibility change, skipping');
        return;
      }
      
      isHandlingVisibilityChangeRef.current = true;
      
      // Check if we should attempt reconnection
      const hiddenDuration = getHiddenDuration();
      logger.log('[useUltravoxSingleton] Hidden duration:', hiddenDuration);
      
      if (shouldConnect && hasConnectedRef.current && hiddenDuration !== null) {
        // Check if session is still valid (within 60 seconds)
        if (hiddenDuration < 60000) {
          logger.log('[useUltravoxSingleton] Attempting to resume session after visibility restore');
          
          // Resume session and check if reconnection is needed
          ultravoxSingleton.resumeSession();
          
          // If not connected, attempt reconnection
          if (!ultravoxSingleton.isConnected() && !ultravoxSingleton.isReconnecting()) {
            logger.log('[useUltravoxSingleton] Session disconnected during hidden period, attempting reconnection');
            ultravoxSingleton.attemptReconnection().then((success) => {
              if (success) {
                logger.log('[useUltravoxSingleton] Reconnection successful after visibility restore');
              } else {
                logger.error('[useUltravoxSingleton] Reconnection failed after visibility restore');
                callbacks.onError(new Error('Failed to reconnect after screen restore'), 'VisibilityReconnection');
              }
            });
          }
        } else {
          logger.log('[useUltravoxSingleton] Session expired during hidden period, cannot reconnect');
          callbacks.onError(
            new Error(`Session expired after ${Math.round(hiddenDuration / 1000)} seconds`),
            'SessionExpired'
          );
        }
      }
      
      setTimeout(() => {
        isHandlingVisibilityChangeRef.current = false;
      }, 1000);
    },
    onHidden: () => {
      logger.log('[useUltravoxSingleton] Page became hidden (screen off or app backgrounded)');
      
      // Pause the session to preserve state
      if (ultravoxSingleton.isConnected()) {
        logger.log('[useUltravoxSingleton] Pausing session due to visibility change');
        ultravoxSingleton.pauseSession();
      }
    },
    onVisibilityChange: (isVisible: boolean) => {
      logger.log('[useUltravoxSingleton] Visibility changed:', isVisible ? 'visible' : 'hidden');
    }
  });

  useEffect(() => {
    // Set callbacks on the singleton
    ultravoxSingleton.setCallbacks(callbacks);
  }, [
    callbacks.onStatusChange,
    callbacks.onTranscriptUpdate,
    callbacks.onSessionEnd,
    callbacks.onError,
    callbacks.onExperimentalMessage
  ]);

  useEffect(() => {
    logger.log('[useUltravoxSingleton] Effect triggered', { 
      shouldConnect, 
      joinUrl: !!joinUrl, 
      callId,
      hasConnected: hasConnectedRef.current,
      isVisible: isCurrentlyVisible()
    });

    const connectAsync = async () => {
      if (!shouldConnect || !joinUrl || !callId) {
        logger.log('[useUltravoxSingleton] Not connecting - missing requirements');
        return;
      }

      // Don't connect if page is not visible
      if (!isCurrentlyVisible()) {
        logger.log('[useUltravoxSingleton] Page not visible, deferring connection');
        return;
      }

      // Prevent duplicate connections for the same URL
      if (hasConnectedRef.current && ultravoxSingleton.isConnected()) {
        logger.log('[useUltravoxSingleton] Already connected, skipping');
        return;
      }

      // Check if we're already reconnecting
      if (ultravoxSingleton.isReconnecting()) {
        logger.log('[useUltravoxSingleton] Already reconnecting, skipping');
        return;
      }

      try {
        // Pre-flight checks
        const { compatible, issues } = checkBrowserCompatibility();
        if (!compatible) {
          throw new Error(`Browser incompatible: ${issues.join(', ')}`);
        }

        const micPerms = await checkMicrophonePermissions();
        if (!micPerms.granted) {
          throw new Error(micPerms.error || 'Microphone permission denied');
        }

        // Connect using singleton
        logger.log('[useUltravoxSingleton] Starting connection...');
        await ultravoxSingleton.connect(joinUrl, callId);
        hasConnectedRef.current = true;
        logger.log('[useUltravoxSingleton] Connection successful');
      } catch (error) {
        logger.error('[useUltravoxSingleton] Connection error:', error);
        callbacks.onError(error instanceof Error ? error : new Error(String(error)), 'Connection');
      }
    };

    if (shouldConnect) {
      // Add a small delay to let React settle
      const timer = setTimeout(connectAsync, 150);
      return () => clearTimeout(timer);
    } else if (!shouldConnect && hasConnectedRef.current) {
      // Disconnect when shouldConnect becomes false
      logger.log('[useUltravoxSingleton] Disconnecting...');
      const disconnectAsync = async () => {
        await ultravoxSingleton.disconnect();
        hasConnectedRef.current = false;
      };
      disconnectAsync();
    }
  }, [shouldConnect, joinUrl, callId, isCurrentlyVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hasConnectedRef.current) {
        logger.log('[useUltravoxSingleton] Component unmounting, disconnecting...');
        ultravoxSingleton.disconnect();
      }
    };
  }, []);
}