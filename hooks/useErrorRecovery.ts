"use client";

import { useState, useCallback } from 'react';

const useErrorRecovery = () => {
  const [errorHistory, setErrorHistory] = useState<Array<{
    timestamp: number;
    type: string;
    message: string;
    recovered: boolean;
  }>>([]);

  const recordError = useCallback((type: string, message: string) => {
    const error = {
      timestamp: Date.now(),
      type,
      message,
      recovered: false
    };
    
    setErrorHistory(prev => [...prev.slice(-9), error]); // Keep last 10 errors
    console.error(`[Error Recovery] Recorded error: ${type} - ${message}`);
  }, []);

  const markRecovered = useCallback((errorIndex: number) => {
    setErrorHistory(prev => 
      prev.map((error, index) => 
        index === errorIndex ? { ...error, recovered: true } : error
      )
    );
  }, []);

  // Auto-recovery strategies
  const attemptRecovery = useCallback(async (errorType: string) => {
    console.log(`[Error Recovery] Attempting recovery for: ${errorType}`);
    
    switch (errorType) {
      case 'microphone_error':
        // Try to re-request microphone permission
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
          return true;
        } catch {
          return false;
        }
      
      case 'network_error':
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 3000));
        return true;
      
      case 'session_error':
        // Try to create a new session
        // Implementation depends on your session management
        return false;
      
      default:
        return false;
    }
  }, []);

  return {
    errorHistory,
    recordError,
    markRecovered,
    attemptRecovery
  };
};

export default useErrorRecovery;