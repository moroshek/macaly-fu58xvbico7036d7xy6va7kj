// hooks/useUltravoxSingleton.ts
import { useEffect, useRef } from 'react';
import { ultravoxSingleton } from '@/lib/ultravox-singleton';
import { logger } from '@/lib/logger';
import { checkBrowserCompatibility, checkMicrophonePermissions } from '@/lib/browser-compat';

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
      hasConnected: hasConnectedRef.current 
    });

    const connectAsync = async () => {
      if (!shouldConnect || !joinUrl || !callId) {
        logger.log('[useUltravoxSingleton] Not connecting - missing requirements');
        return;
      }

      // Prevent duplicate connections for the same URL
      if (hasConnectedRef.current && ultravoxSingleton.isConnected()) {
        logger.log('[useUltravoxSingleton] Already connected, skipping');
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
  }, [shouldConnect, joinUrl, callId]);

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