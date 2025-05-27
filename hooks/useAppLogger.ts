/**
 * Custom hook for application logging
 */

import { useRef, useCallback } from 'react';

export interface ClientEvent {
  timestamp: string;
  message: string;
}

export interface BackendComm {
  timestamp: string;
  serviceTarget: string;
  method: string;
  outcome: string;
  statusCode?: number;
}

export function useAppLogger() {
  const clientEventsLog = useRef<ClientEvent[]>([]);
  const backendCommsLog = useRef<BackendComm[]>([]);

  /**
   * Log a client event
   */
  const logClientEvent = useCallback((event: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry: ClientEvent = {
      timestamp,
      message: event,
    };

    console.log(`[Client] ${timestamp}: ${event}`);

    clientEventsLog.current.unshift(logEntry);
    if (clientEventsLog.current.length > 50) {
      clientEventsLog.current.pop();
    }
  }, []);

  /**
   * Log an API call
   */
  const logApiCall = useCallback(
    (target: string, method: string, outcome: string, statusCode?: number) => {
      const timestamp = new Date().toLocaleTimeString();
      const logEntry: BackendComm = {
        timestamp,
        serviceTarget: target,
        method,
        outcome,
        statusCode,
      };

      backendCommsLog.current.unshift(logEntry);
      if (backendCommsLog.current.length > 20) {
        backendCommsLog.current.pop();
      }

      console.log(
        `[API] ${target} ${method} - ${outcome}${statusCode ? ` (${statusCode})` : ''}`
      );
    },
    []
  );

  /**
   * Log Ultravox event
   */
  const logUltravoxEvent = useCallback((event: string, data?: any) => {
    console.log(`[Ultravox] ${event}`, data || '');
    logClientEvent(`Ultravox: ${event}`);
  }, [logClientEvent]);

  /**
   * Log error event
   */
  const logError = useCallback((source: string, error: any) => {
    console.error(`[Error] ${source}:`, error);
    logClientEvent(`Error in ${source}: ${error.message || 'Unknown error'}`);
  }, [logClientEvent]);

  /**
   * Get client events log
   */
  const getClientEvents = useCallback((): ClientEvent[] => {
    return [...clientEventsLog.current];
  }, []);

  /**
   * Get backend communications log
   */
  const getBackendComms = useCallback((): BackendComm[] => {
    return [...backendCommsLog.current];
  }, []);

  /**
   * Clear all logs
   */
  const clearLogs = useCallback(() => {
    clientEventsLog.current = [];
    backendCommsLog.current = [];
    console.log('[Logger] All logs cleared');
  }, []);

  return {
    logClientEvent,
    logApiCall,
    logUltravoxEvent,
    logError,
    getClientEvents,
    getBackendComms,
    clearLogs,
  };
}