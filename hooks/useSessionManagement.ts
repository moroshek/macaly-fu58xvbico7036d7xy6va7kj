"use client";

import { useState, useCallback, useEffect } from 'react';

interface SessionState {
  callId: string | null;
  sessionStatus: string;
  startTime: number | null;
  lastActivity: number;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

const useSessionManagement = () => {
  const [sessionState, setSessionState] = useState<SessionState>({
    callId: null,
    sessionStatus: 'disconnected',
    startTime: null,
    lastActivity: Date.now(),
    reconnectAttempts: 0,
    maxReconnectAttempts: 3
  });

  // Auto-recovery for connection issues
  const handleConnectionLoss = useCallback(async (uvSession: any) => {
    console.log('[Session Management] Connection lost, attempting recovery...');
    
    setSessionState(prev => ({
      ...prev,
      reconnectAttempts: prev.reconnectAttempts + 1
    }));

    if (sessionState.reconnectAttempts < sessionState.maxReconnectAttempts) {
      try {
        // Wait a bit before reconnecting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // For actual reconnection logic, this would integrate with your
        // handleStartInterview or similar function
        console.log('[Session Management] Would attempt reconnection here');
      } catch (error) {
        console.error('[Session Management] Recovery failed:', error);
      }
    } else {
      console.error('[Session Management] Max reconnection attempts reached');
      // Show user-friendly error and option to start over
    }
  }, [sessionState.reconnectAttempts, sessionState.maxReconnectAttempts]);

  // Session timeout handler
  useEffect(() => {
    const timeoutCheck = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - sessionState.lastActivity;
      const maxInactiveTime = 10 * 60 * 1000; // 10 minutes

      if (sessionState.sessionStatus !== 'disconnected' && timeSinceActivity > maxInactiveTime) {
        console.log('[Session Management] Session timeout due to inactivity');
        // Auto-end session after 10 minutes of inactivity
        handleSessionTimeout();
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(timeoutCheck);
  }, [sessionState.lastActivity, sessionState.sessionStatus]);

  const updateActivity = useCallback(() => {
    setSessionState(prev => ({
      ...prev,
      lastActivity: Date.now()
    }));
  }, []);

  const handleSessionTimeout = useCallback(() => {
    console.log('[Session Management] Session timed out');
    // In a real implementation, this would trigger handleEndInterview
    setSessionState(prev => ({
      ...prev,
      sessionStatus: 'disconnected'
    }));
  }, []);

  return {
    sessionState,
    setSessionState,
    handleConnectionLoss,
    updateActivity
  };
};

export default useSessionManagement;