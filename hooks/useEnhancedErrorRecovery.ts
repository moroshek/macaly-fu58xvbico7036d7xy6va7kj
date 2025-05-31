// hooks/useEnhancedErrorRecovery.ts
import { useRef, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { getConfig } from '@/lib/config';
import { ultravoxSingleton } from '@/lib/ultravox-singleton';

interface ErrorContext {
  error: Error;
  errorCode?: number;
  errorType: string;
  timestamp: number;
  recoveryAttempts: number;
}

interface RecoveryStrategy {
  shouldRecover: (context: ErrorContext) => boolean;
  recover: (context: ErrorContext) => Promise<boolean>;
  maxAttempts: number;
}

export function useEnhancedErrorRecovery() {
  const errorHistoryRef = useRef<ErrorContext[]>([]);
  const recoveryInProgressRef = useRef<boolean>(false);

  // Define recovery strategies for different error types
  const recoveryStrategies: Record<string, RecoveryStrategy> = {
    // WebSocket connection errors
    WebSocketError: {
      shouldRecover: (context) => {
        // Recover from non-critical WebSocket errors
        return context.errorCode !== 1000 && // Normal closure
               context.errorCode !== 1001 && // Going away
               context.recoveryAttempts < 3;
      },
      recover: async (context) => {
        logger.log('[ErrorRecovery] Attempting WebSocket recovery', context);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return ultravoxSingleton.attemptReconnection();
      },
      maxAttempts: 3
    },

    // 4409 Conflict errors (transient server issues)
    ConflictError: {
      shouldRecover: (context) => {
        return context.errorCode === 4409 && context.recoveryAttempts < 5;
      },
      recover: async (context) => {
        logger.log('[ErrorRecovery] Handling 4409 Conflict error', context);
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        const delay = Math.min(2000 * Math.pow(2, context.recoveryAttempts), 32000);
        await new Promise(resolve => setTimeout(resolve, delay));
        return ultravoxSingleton.attemptReconnection();
      },
      maxAttempts: 5
    },

    // Network connectivity errors
    NetworkError: {
      shouldRecover: (context) => {
        return navigator.onLine && context.recoveryAttempts < 3;
      },
      recover: async (context) => {
        logger.log('[ErrorRecovery] Attempting network recovery', context);
        
        // Wait for network to stabilize
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check if network is back
        if (!navigator.onLine) {
          logger.warn('[ErrorRecovery] Still offline, cannot recover');
          return false;
        }
        
        return ultravoxSingleton.attemptReconnection();
      },
      maxAttempts: 3
    },

    // Session timeout errors
    SessionTimeout: {
      shouldRecover: (context) => {
        const sessionState = ultravoxSingleton.getSessionState();
        if (!sessionState) return false;
        
        const sessionAge = Date.now() - sessionState.timestamp;
        const config = getConfig();
        
        return sessionAge < config.sessionPersistenceTimeoutMs && 
               context.recoveryAttempts < 1;
      },
      recover: async (context) => {
        logger.log('[ErrorRecovery] Attempting session timeout recovery', context);
        return ultravoxSingleton.attemptReconnection();
      },
      maxAttempts: 1
    },

    // Generic connection lost
    ConnectionLost: {
      shouldRecover: (context) => {
        return context.recoveryAttempts < 3;
      },
      recover: async (context) => {
        logger.log('[ErrorRecovery] Attempting connection recovery', context);
        
        // Progressive delay: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, context.recoveryAttempts);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return ultravoxSingleton.attemptReconnection();
      },
      maxAttempts: 3
    }
  };

  const handleError = useCallback(async (
    error: Error,
    errorType: string,
    errorCode?: number
  ): Promise<boolean> => {
    if (recoveryInProgressRef.current) {
      logger.log('[ErrorRecovery] Recovery already in progress, skipping');
      return false;
    }

    // Create error context
    const context: ErrorContext = {
      error,
      errorCode,
      errorType,
      timestamp: Date.now(),
      recoveryAttempts: 0
    };

    // Check error history for repeated errors
    const recentErrors = errorHistoryRef.current.filter(
      e => Date.now() - e.timestamp < 60000 // Last minute
    );
    
    const similarErrors = recentErrors.filter(
      e => e.errorType === errorType && e.errorCode === errorCode
    );
    
    if (similarErrors.length >= 5) {
      logger.error('[ErrorRecovery] Too many similar errors, giving up', {
        errorType,
        errorCode,
        count: similarErrors.length
      });
      return false;
    }

    // Add to history
    errorHistoryRef.current.push(context);
    if (errorHistoryRef.current.length > 20) {
      errorHistoryRef.current = errorHistoryRef.current.slice(-20);
    }

    // Find appropriate recovery strategy
    const strategy = recoveryStrategies[errorType];
    if (!strategy) {
      logger.warn('[ErrorRecovery] No recovery strategy for error type:', errorType);
      return false;
    }

    // Check if we should attempt recovery
    if (!strategy.shouldRecover(context)) {
      logger.log('[ErrorRecovery] Recovery not appropriate for this error', context);
      return false;
    }

    // Attempt recovery
    recoveryInProgressRef.current = true;
    let recovered = false;

    try {
      while (context.recoveryAttempts < strategy.maxAttempts) {
        logger.log(`[ErrorRecovery] Recovery attempt ${context.recoveryAttempts + 1}/${strategy.maxAttempts}`);
        
        context.recoveryAttempts++;
        recovered = await strategy.recover(context);
        
        if (recovered) {
          logger.log('[ErrorRecovery] Recovery successful!');
          break;
        }
        
        logger.warn(`[ErrorRecovery] Recovery attempt ${context.recoveryAttempts} failed`);
      }
    } catch (recoveryError) {
      logger.error('[ErrorRecovery] Recovery process failed:', recoveryError);
    } finally {
      recoveryInProgressRef.current = false;
    }

    return recovered;
  }, []);

  const isRecovering = useCallback(() => {
    return recoveryInProgressRef.current;
  }, []);

  const getErrorHistory = useCallback(() => {
    return [...errorHistoryRef.current];
  }, []);

  const clearErrorHistory = useCallback(() => {
    errorHistoryRef.current = [];
  }, []);

  // Monitor network status changes
  const handleNetworkChange = useCallback(() => {
    if (navigator.onLine) {
      logger.log('[ErrorRecovery] Network back online');
      
      // Check if we have a disconnected session that could be recovered
      if (!ultravoxSingleton.isConnected() && ultravoxSingleton.getSessionState()) {
        handleError(new Error('Network restored'), 'NetworkError');
      }
    } else {
      logger.warn('[ErrorRecovery] Network went offline');
    }
  }, [handleError]);

  // Set up network monitoring
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);
  }

  return {
    handleError,
    isRecovering,
    getErrorHistory,
    clearErrorHistory
  };
}