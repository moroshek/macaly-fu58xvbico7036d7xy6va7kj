/**
 * React hook for Ultravox debugging
 * 
 * This hook provides debugging utilities specifically for Ultravox integration,
 * including state tracking, logging, and error handling.
 */

"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { UltravoxDebugState } from '@/lib/debug-types';
import { checkBrowserCompatibility } from '@/lib/browser-compat';
import { testNetworkConnectivity } from '@/utils/network-utils';

/**
 * Hook for Ultravox session debugging functionality
 */
export default function useUltravoxDebug() {
  // Debug state object
  const [debugInfo, setDebugInfo] = useState<UltravoxDebugInfo | null>(null);
  
  // Debug event logs
  const eventLog = useRef<Array<{
    timestamp: number;
    type: string;
    message: string;
    data?: any;
  }>>([]);
  
  // Flag to control whether debug mode is enabled
  const [debugModeEnabled, setDebugModeEnabled] = useState<boolean>(
    process.env.NODE_ENV === 'development' || 
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')
  );
  
  /**
   * Log a debug event with optional data
   */
  const logEvent = useCallback((type: string, message: string, data?: any) => {
    if (!debugModeEnabled) return;
    
    const event = {
      timestamp: Date.now(),
      type,
      message,
      data
    };
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[UltravoxDebug] ${type}: ${message}`, data || '');
    }
    
    // Add to log
    eventLog.current = [event, ...eventLog.current.slice(0, 99)];
  }, [debugModeEnabled]);
  
  /**
   * Update the debug info state with current session information
   */
  const updateDebugInfo = useCallback((info: Partial<UltravoxDebugInfo>) => {
    if (!debugModeEnabled) return;
    
    setDebugInfo(prev => ({
      ...(prev || {
        hasSession: false,
        status: 'unknown',
        isActive: false,
        micPermission: null,
        uiState: 'idle',
        transcriptLength: 0,
        callId: null,
        isOnline: true,
        errorMessage: null
      }),
      ...info
    }));
  }, [debugModeEnabled]);
  
  /**
   * Run a complete diagnostic check of the Ultravox environment
   */
  const runDiagnostics = useCallback(async () => {
    if (!debugModeEnabled) return null;
    
    logEvent('diagnostics', 'Starting Ultravox diagnostics');
    
    // Check browser compatibility
    const compatResult = checkBrowserCompatibility();
    logEvent('compatibility', `Browser compatibility: ${compatResult.compatible ? 'OK' : 'Issues found'}`, compatResult);
    
    // Check network connectivity
    const networkResult = await testNetworkConnectivity();
    logEvent('network', `Network connectivity: ${networkResult ? 'OK' : 'Issues found'}`);
    
    return {
      timestamp: Date.now(),
      compatibility: compatResult,
      network: networkResult,
      eventLog: eventLog.current
    };
  }, [debugModeEnabled, logEvent]);
  
  /**
   * Toggle debug mode on/off
   */
  const toggleDebugMode = useCallback(() => {
    setDebugModeEnabled(prev => !prev);
  }, []);
  
  /**
   * Get the current event log
   */
  const getEventLog = useCallback(() => {
    return eventLog.current;
  }, []);
  
  /**
   * Clear the event log
   */
  const clearEventLog = useCallback(() => {
    eventLog.current = [];
    logEvent('system', 'Event log cleared');
  }, [logEvent]);
  
  // Only activate in development or when debug parameter is present
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('debug')) {
        setDebugModeEnabled(true);
        logEvent('system', 'Debug mode activated via URL parameter');
      }
    }
  }, [logEvent]);
  
  return {
    debugInfo,
    updateDebugInfo,
    logEvent,
    runDiagnostics,
    debugModeEnabled,
    toggleDebugMode,
    getEventLog,
    clearEventLog
  };
}
