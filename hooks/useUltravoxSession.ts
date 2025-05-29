/**
 * Custom hook for managing Ultravox sessions
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { UltravoxSession } from 'ultravox-client';
import { useToast } from '@/hooks/use-toast';
import { ErrorHandler } from '@/lib/error-handler';

// Enhanced WebSocket debugging function
const debugWebSocketConnection = (joinUrl: string) => {
  console.log('🔍 WebSocket Connection Debug Info:');
  console.log('URL:', joinUrl);
  console.log('Protocol:', new URL(joinUrl).protocol);
  console.log('Host:', new URL(joinUrl).host);
  console.log('Search Params:', Object.fromEntries(new URL(joinUrl).searchParams));
  
  // Browser environment checks
  console.log('Browser Info:', {
    userAgent: navigator.userAgent,
    onLine: navigator.onLine,
    cookieEnabled: navigator.cookieEnabled,
    language: navigator.language,
  });
  
  // Network timing
  console.log('Connection Timing:', new Date().toISOString());
  
  // Check for known problematic networks
  const hostname = window.location.hostname;
  console.log('Current hostname:', hostname);
  
  if (hostname === 'localhost' || hostname.includes('127.0.0.1')) {
    console.log('⚠️ Running on localhost - this could cause CORS issues with WebSocket');
  }
};

// Enhanced error analysis for 1006 codes
const analyzeWebSocket1006Error = (ws: WebSocket, url: string) => {
  console.error('🚨 WebSocket 1006 Analysis:');
  console.error('Common causes:');
  console.error('1. Server crashed or restarted');
  console.error('2. Network proxy/firewall blocked connection');
  console.error('3. Browser security policy blocked connection');
  console.error('4. CORS issues');
  console.error('5. Invalid WebSocket subprotocol');
  
  console.error('Connection details:');
  console.error('- URL:', url);
  console.error('- Ready State:', ws.readyState);
  console.error('- Protocol:', ws.protocol);
  console.error('- Extensions:', ws.extensions);
  
  // Network connectivity test
  fetch('https://www.google.com/favicon.ico', { method: 'HEAD', mode: 'no-cors' })
    .then(() => console.log('✅ Basic internet connectivity: OK'))
    .catch(() => console.error('❌ Basic internet connectivity: FAILED'));
    
  // Ultravox API connectivity test
  fetch('https://api.ultravox.ai', { method: 'HEAD', mode: 'no-cors' })
    .then(() => console.log('✅ Ultravox API reachable: OK'))
    .catch(() => console.error('❌ Ultravox API reachable: FAILED'));
};

// Test WebSocket with progressive fallbacks
const testWebSocketWithFallbacks = async (joinUrl: string) => {
  console.log('🧪 Testing WebSocket with progressive fallbacks...');
  
  // Test 1: Basic connection test
  try {
    const ws = new WebSocket(joinUrl);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000);
      
      ws.onopen = () => {
        clearTimeout(timeout);
        console.log('✅ Basic WebSocket test: SUCCESS');
        ws.close();
        resolve(true);
      };
      
      ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error('❌ Basic WebSocket test: FAILED', error);
        resolve(false);
      };
      
      ws.onclose = (event) => {
        clearTimeout(timeout);
        if (event.code === 1006) {
          console.error('❌ Basic WebSocket test: 1006 error during test');
          analyzeWebSocket1006Error(ws, joinUrl);
        }
        resolve(false);
      };
    });
  } catch (error) {
    console.error('❌ WebSocket constructor failed:', error);
    return false;
  }
};

// Potential workarounds for 1006 errors
const webSocket1006Workarounds = {
  // Workaround 1: Add connection delay
  async connectWithDelay(joinUrl: string, delayMs: number = 1000): Promise<WebSocket | null> {
    console.log(`⏳ Attempting connection with ${delayMs}ms delay...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
    
    try {
      return new WebSocket(joinUrl);
    } catch (error) {
      console.error('❌ Delayed connection failed:', error);
      return null;
    }
  },

  // Workaround 2: Retry with exponential backoff
  async connectWithRetry(joinUrl: string, maxRetries: number = 3): Promise<WebSocket | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`🔄 Connection attempt ${attempt}/${maxRetries}`);
      
      try {
        const ws = new WebSocket(joinUrl);
        
        // Test if connection succeeds
        const connected = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(false), 10000);
          
          ws.onopen = () => {
            clearTimeout(timeout);
            resolve(true);
          };
          
          ws.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };
          
          ws.onclose = (event) => {
            clearTimeout(timeout);
            if (event.code === 1006) {
              console.error(`❌ Attempt ${attempt}: 1006 error`);
            }
            resolve(false);
          };
        });
        
        if (connected) {
          console.log(`✅ Connection successful on attempt ${attempt}`);
          return ws;
        } else {
          ws.close();
        }
      } catch (error) {
        console.error(`❌ Attempt ${attempt} failed:`, error);
      }
      
      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.error('❌ All connection attempts failed');
    return null;
  },

  // Workaround 3: Check and modify URL parameters
  modifyUrlForCompatibility(joinUrl: string): string {
    const url = new URL(joinUrl);
    
    // Add some parameters that might help with compatibility
    url.searchParams.set('timestamp', Date.now().toString());
    url.searchParams.set('retryAttempt', '1');
    
    console.log('🔧 Modified URL for compatibility:', url.toString());
    return url.toString();
  }
};

// Main debugging function to call from your initializeSession
export const debugWebSocket1006Issue = async (joinUrl: string) => {
  console.log('🔍 Starting comprehensive WebSocket 1006 debugging...');
  
  debugWebSocketConnection(joinUrl);
  
  const basicTest = await testWebSocketWithFallbacks(joinUrl);
  if (!basicTest) {
    console.log('🔧 Basic test failed, trying workarounds...');
    
    // Try modified URL
    const modifiedUrl = webSocket1006Workarounds.modifyUrlForCompatibility(joinUrl);
    const modifiedTest = await testWebSocketWithFallbacks(modifiedUrl);
    
    if (modifiedTest) {
      console.log('✅ Modified URL worked! Consider using this approach.');
      return modifiedUrl;
    }
    
    // Try with retry
    const retryResult = await webSocket1006Workarounds.connectWithRetry(joinUrl);
    if (retryResult) {
      console.log('✅ Retry approach worked!');
      retryResult.close(); // Clean up test connection
      return joinUrl; // Original URL worked with retry
    }
  }
  
  return joinUrl; // Return original if all tests fail
};
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
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [callEndReason, setCallEndReason] = useState<string | null>(null);
  const sessionRef = useRef<any>(null);
  const prevStatusRef = useRef<string | null>(null);
  const hasReachedIdleStateRef = useRef<boolean>(false);
  const { toast } = useToast();
  const errorHandler = ErrorHandler.getInstance();
  const config = getConfig();
  const connectionTimeoutIdRef = useRef<any>(null); // Ref to store timeout ID

  // Define ALL event handlers here, once, so they are in scope for add/remove.
  const handleMicMuteChange = useCallback((muted: boolean) => {
    console.log(`[Ultravox] micMutedNotifier event: Microphone is now ${muted ? 'MUTED' : 'UNMUTED'}`);
  }, []);

  const handleTranscript = useCallback(() => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      console.log('[Ultravox] Transcript update but no current session in ref.');
      return;
    }
    try {
      console.log('[Ultravox] Transcript event. Current transcript count:', currentSession.transcripts?.length);
      if (currentSession.transcripts && Array.isArray(currentSession.transcripts)) {
        const validTranscripts = currentSession.transcripts
          .filter((transcript: any) => (
            transcript &&
            typeof transcript.text === 'string' &&
            transcript.text.trim() !== '' &&
            transcript.isFinal !== false
          ))
          .map((transcript: any) => ({
            speaker: transcript.speaker === 'user' ? 'user' : 'agent',
            text: transcript.text.trim(),
          }));
        onTranscriptUpdate(validTranscripts);
      }
    } catch (err) {
      console.error('[Ultravox] Error processing transcript:', err);
    }
  }, [onTranscriptUpdate]);

  const handleErrorEvent = useCallback((event: any) => { 
    console.error('[Ultravox] SDK "error" event received:', event);
    const errorObj = event?.error || event;
    let extractedMessage = 'An unknown Ultravox error occurred.';
    if (errorObj instanceof Error) {
      extractedMessage = errorObj.message;
    } else if (typeof errorObj?.message === 'string') {
      extractedMessage = errorObj.message;
    } else if (typeof errorObj === 'string') {
      extractedMessage = errorObj;
    }
    onError(new Error("Ultravox SDK reported an error: " + extractedMessage));
    setIsConnecting(false); 
    setCallStatus('error'); // Set callStatus to 'error' on SDK error event
  }, [onError]);


  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutIdRef.current) {
      clearTimeout(connectionTimeoutIdRef.current);
      connectionTimeoutIdRef.current = null;
      console.log('[Ultravox] Connection timeout cleared.');
    }
  }, []);

  const localHandleStatusUpdate = useCallback(async (event: any) => {
    const currentSessionInstance = sessionRef.current;
    const currentStatus = event.target?.status;

    if (currentStatus === 'idle' || currentStatus === 'listening' || currentStatus === 'disconnected' || currentStatus === 'error') {
      clearConnectionTimeout();
    }
    
    const eventTargetEndReason = event.target?.endReason;
    console.log(`[Ultravox] Status Event. Current: ${currentStatus}, Previous: ${prevStatusRef.current}, SDK Reason: ${eventTargetEndReason || 'N/A'}. Raw event:`, event);

    if (!currentSessionInstance && currentStatus !== 'disconnected') {
      console.warn('[Ultravox] Status update but no current session in ref and status is not disconnected. Ignoring event.');
      return;
    }

    onStatusChange(currentStatus || 'unknown');

    switch (currentStatus) {
      case 'connecting':
        console.log('[Ultravox] Session status connecting. Waiting for idle...');
        setCallStatus('connecting');
        // setIsConnecting(true) is handled by connect()
        break;

      case 'idle':
        console.log('[Client] Ultravox session is now idle. Session instance:', currentSessionInstance);
        setSession(currentSessionInstance);
        setCallStatus('idle');
        hasReachedIdleStateRef.current = true;
        setIsConnecting(false);

        console.log('[Client] Attempting to unmute microphone as session is idle.');
        if (currentSessionInstance && typeof currentSessionInstance.unmuteMic === 'function') {
          try {
            await currentSessionInstance.unmuteMic();
            console.log('[Client] Microphone unmuted successfully via unmuteMic().');
          } catch (error) {
            console.error('[Client] Error calling unmuteMic():', error);
            onError(error instanceof Error ? error : new Error(String(error)));
          }
        } else {
          console.warn('[Client] unmuteMic function not available on current session instance or instance is null.');
        }
        break;

      case 'listening':
        console.log('[Client] Ultravox session is now listening. Microphone is active.');
        setCallStatus('listening');
        if (!session && currentSessionInstance) {
          console.warn("[Client] Session was not set by 'idle' status, setting it now due to 'listening' status.");
          setSession(currentSessionInstance);
        }
        if (!hasReachedIdleStateRef.current && currentSessionInstance) {
          console.warn("[Client] Session was not set by 'idle' status but 'listening' was reached. Forcing idle reached true.");
          hasReachedIdleStateRef.current = true;
        }
        setIsConnecting(false);
        break;
      
      case 'error': 
        console.error(`[Ultravox] Session status changed to 'error'. SDK Reason: ${eventTargetEndReason || 'N/A'}`);
        setCallEndReason(eventTargetEndReason || 'error_status');
        setCallStatus('error');
        setIsConnecting(false);
        // The SDK 'error' event (handleErrorEvent) should call onError.
        // This ensures it's called if 'error' status occurs without a separate SDK 'error' event.
        if (typeof onError === 'function' && prevStatusRef.current !== 'error') { 
             onError(new Error(`Ultravox session entered 'error' state. Reason: ${eventTargetEndReason || 'N/A'}`));
        }
        break;

      case 'disconnected':
        const reason = currentSessionInstance?.endReason || eventTargetEndReason || 'unknown';
        console.log(`[Ultravox] Session disconnected. Reason: ${reason}, Previous status was: ${prevStatusRef.current}`);
        setCallEndReason(reason);
        setCallStatus('disconnected');
        setIsConnecting(false);

        const previousStatus = prevStatusRef.current;
        if (!hasReachedIdleStateRef.current || previousStatus === 'connecting') {
          const errorMessage = `Ultravox connection failed: Disconnected from '${previousStatus || 'initial'}' state before reaching 'idle'. Reason: ${reason}`;
          console.error(`[Ultravox] ${errorMessage}`);
          if (typeof onError === 'function') {
            onError(new Error(errorMessage));
          } else {
            console.error('[Ultravox] onError callback is not available to report connection failure.');
          }
        }

        if (currentSessionInstance) {
          console.log('[Ultravox] Removing event listeners upon disconnect for session:', currentSessionInstance.id);
          currentSessionInstance.removeEventListener('transcripts', handleTranscript);
          currentSessionInstance.removeEventListener('status', localHandleStatusUpdate);
          currentSessionInstance.removeEventListener('error', handleErrorEvent);
          if (currentSessionInstance.micMutedNotifier && typeof (currentSessionInstance.micMutedNotifier as any).removeListener === 'function') {
            (currentSessionInstance.micMutedNotifier as any).removeListener(handleMicMuteChange);
          }
        } else {
          console.warn('[Ultravox] No currentSessionInstance found in ref during disconnect to remove listeners from.');
        }

        if (onSessionEnd) {
          onSessionEnd();
        }

        setSession(null);
        if (sessionRef.current) { // Only nullify if it's the one being disconnected
          // Check if the session being disconnected is the one in the ref
          if (event?.target === sessionRef.current) {
             sessionRef.current = null;
          }
        }
        hasReachedIdleStateRef.current = false;
        break;

      default:
        console.warn(`[Ultravox] Unhandled status event: ${currentStatus}`);
        setCallStatus(currentStatus || 'unknown');
        break;
    }
    prevStatusRef.current = currentStatus;
  }, [
    session, 
    onStatusChange, 
    onError, 
    onSessionEnd, 
    handleTranscript, 
    handleErrorEvent, 
    handleMicMuteChange, 
    clearConnectionTimeout,
    // Not including setIsConnecting, setSession, setCallStatus, setCallEndReason as they are state setters
  ]);

  /**
   * Initialize a new Ultravox session object and set up listeners.
   * This function is synchronous and prepares for the connection.
   */
  const initializeSession = useCallback(() => {
    try {
      console.log('[Ultravox] Initializing session object and listeners.');

      if (typeof UltravoxSession !== 'function') {
        const initError = new Error('UltravoxSession is not available - check import');
        onError(initError); 
        throw initError; 
      }

      // If a session already exists, clean it up before creating a new one.
      if (sessionRef.current && typeof sessionRef.current.leaveCall === 'function') {
        console.log('[Ultravox] initializeSession: Existing session found. Cleaning it up before creating a new one.');
        sessionRef.current.leaveCall().catch((e: any) => console.warn('[Ultravox] Error leaving old call during re-initialization:', e));
        // Event listeners for the old session should be removed by its 'disconnected' status handler.
      }


      console.log('[Ultravox] Creating new session instance.');
      const sessionOptions = { experimentalMessages: new Set() };
      const newSession = new UltravoxSession(sessionOptions);
      sessionRef.current = newSession; 

      console.log('[Ultravox] Adding event listeners for "transcripts", "status", "error", and "micMutedNotifier".');
      newSession.addEventListener('transcripts', handleTranscript);
      newSession.addEventListener('status', localHandleStatusUpdate);
      newSession.addEventListener('error', handleErrorEvent); 
      if (newSession.micMutedNotifier && typeof (newSession.micMutedNotifier as any).addListener === 'function') {
        (newSession.micMutedNotifier as any).addListener(handleMicMuteChange);
      }
      console.log('[Ultravox] Session object created and listeners attached. Ready to connect.');
      // This function itself doesn't return; the hook returns it.
    } catch (error: any) {
      console.error('[Ultravox] Critical error during session object initialization (before connect):', error);
      if (!(error instanceof Error) && typeof onError === 'function') {
         onError(new Error('Session initialization failed: ' + String(error.message || error)));
      } else if (error instanceof Error && typeof onError === 'function') {
         onError(error);
      }
    }
  }, [onError, handleTranscript, localHandleStatusUpdate, handleErrorEvent, handleMicMuteChange]);


  /**
   * Connect to the Ultravox session using the provided joinUrl.
   * This function is asynchronous and handles the joinCall process.
   */
  const connect = useCallback(async (joinUrl: string): Promise<boolean> => {
    if (!sessionRef.current) {
      const connectError = new Error('SDK Error: connect called before session initialized or after session ended.');
      onError(connectError);
      // errorHandler.handle(connectError, { source: 'ultravox_connect_pre_init' }); // Toast is handled by SessionManager
      // toast({
      //   title: 'Connection Error',
      //   description: 'Session not ready. Please try again.',
      //   variant: 'destructive',
      // });
      return false;
    }

    console.log('[Ultravox] Attempting to connect with URL:', joinUrl);
    setIsConnecting(true);
    hasReachedIdleStateRef.current = false; 
    prevStatusRef.current = null; 
    setCallStatus('connecting'); 


    try {
      console.log('[Ultravox] Performing connection diagnostics for URL:', joinUrl);
      const diagnosticInfo = {
        joinUrl,
        protocol: new URL(joinUrl).protocol,
        hostname: new URL(joinUrl).hostname,
        params: Object.fromEntries(new URL(joinUrl).searchParams),
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : 'N/A',
      };
      console.log("[Ultravox] Connection Diagnostics:", diagnosticInfo);

      if (!joinUrl.startsWith('ws://') && !joinUrl.startsWith('wss://')) {
        const protocolError = new Error(`Invalid WebSocket URL protocol: ${diagnosticInfo.protocol}. URL must start with ws:// or wss://.`);
        throw protocolError; 
      }
      
      // Optional: WebSocket connectivity test before joinCall
      // const wsTestResult = await testWebSocketConnection(joinUrl); // `testWebSocketConnection` is from ultravox-debug
      // if (!wsTestResult) {
      //   console.warn('[Ultravox] WebSocket connectivity test failed prior to joinCall.');
      //   // Consider if this should be a hard failure or just a warning.
      //   // throw new Error('WebSocket pre-connection test failed.'); 
      // }

    } catch (validationError: any) {
      console.error('[Ultravox] URL validation or pre-connection test failed:', validationError);
      setIsConnecting(false);
      setCallStatus('failed_validation'); 
      onError(validationError instanceof Error ? validationError : new Error(String(validationError.message || 'URL validation failed')));
      // errorHandler.handle(validationError, { source: 'ultravox_connect_validation' }); // Toast handled by SessionManager
      // toast({
      //   title: 'Connection Error',
      //   description: appError.userMessage || 'Invalid connection URL provided.',
      //   variant: 'destructive',
      // });
      return false;
    }
    
    try {
      console.log('[Debug] Calling Ultravox SDK joinCall with joinUrl:', joinUrl);

      clearConnectionTimeout(); 
      connectionTimeoutIdRef.current = setTimeout(() => {
        // Check connectionTimeoutIdRef to ensure timeout is still relevant
        if (sessionRef.current?.status === 'connecting' && connectionTimeoutIdRef.current) {
          console.error('[Ultravox] Connection attempt timed out after 15s while status was still "connecting".');
          const timeoutError = new Error('Ultravox connection attempt timed out.');
          onError(timeoutError);
          // Attempt to leave the call. This should trigger a 'disconnected' status.
          sessionRef.current?.leaveCall().catch((e: any) => console.warn('[Ultravox] Error leaving call on timeout:', e));
          setIsConnecting(false); 
          setCallStatus('timeout');
        }
        connectionTimeoutIdRef.current = null; 
      }, 15000); 

      await sessionRef.current.joinCall(joinUrl);
      console.log('[Ultravox] joinCall promise resolved. Waiting for status events to determine outcome and clear timeout.');
      // isConnecting will be set to false by status handlers ('idle', 'listening', 'disconnected', 'error')

      if (sessionRef.current && sessionRef.current.socket) {
        console.log('[WebSocket RAW] Socket object found after joinCall resolved. Attaching raw event listeners.', sessionRef.current.socket);
        const ws = sessionRef.current.socket;
        ws.onopen = (event: any) => console.log('[WebSocket RAW] Open:', event);
        ws.onmessage = (event: any) => console.log('[WebSocket RAW] Message:', event.data); // Usually contains JSON string
        ws.onerror = (event: any) => {
          console.error('[WebSocket RAW] Error Details:', { type: event.type, readyState: ws.readyState, url: ws.url });
          onError(new Error(`WebSocket error: type ${event.type}, readyState ${ws.readyState}, url ${ws.url}`));
        };
        ws.onclose = (event: any) => {
          console.error('[WebSocket RAW] Close Details:', { code: event.code, reason: event.reason, wasClean: event.wasClean, readyState: ws.readyState, url: ws.url });
          if (!event.wasClean || event.code === 1006) { // 1006 is abnormal closure
            onError(new Error(`WebSocket abnormal closure: Code ${event.code}, Reason: '${event.reason}', wasClean: ${event.wasClean}, url ${ws.url}`));
          }
        };
      } else {
        console.warn('[WebSocket RAW] sessionRef.current.socket is not available immediately after joinCall resolved. Cannot attach raw listeners.');
      }
      return true; 

    } catch (error: any) {
      clearConnectionTimeout();
      console.error('[Ultravox] Error during sessionRef.current.joinCall() invocation:', error);
      setIsConnecting(false);
      setCallStatus('join_failed'); 

      let errorForCallback: Error;
      if (error instanceof Error) {
        errorForCallback = error;
      } else if (error && typeof error.message === 'string') {
        errorForCallback = new Error(error.message);
      } else {
        errorForCallback = new Error('Ultravox joinCall failed to invoke');
      }
      onError(errorForCallback);

      // errorHandler.handle(error, { source: 'ultravox_join_call_invocation' }); // Toast handled by SessionManager
      // toast({
      //   title: 'Connection Error',
      //   description: appError.userMessage || 'Could not initiate the connection to the interview service.',
      //   variant: 'destructive',
      // });
      
      // No need to manually clean up listeners here if joinCall fails,
      // as they are attached to sessionRef.current. If sessionRef.current is valid,
      // an eventual 'disconnected' status (e.g., from leaveCall in timeout/unmount) or
      // re-initialization (via initializeSession) should handle listener cleanup.
      return false;
    }
  }, [
    onError, 
    // toast, // Toasts are now expected to be handled by the UI component (UltravoxSessionManager)
    // errorHandler, // Same for error handler
    // config is not used in connect directly
    clearConnectionTimeout, // Dependency for timeout logic
    // No need for handleTranscript, localHandleStatusUpdate, etc. here as they are called by SDK events
  ]);


  /**
   * End the current session
   */
  const endSession = useCallback(async () => {
    console.log('[Ultravox] endSession CALLED. Call stack:');
    console.trace();
    const currentSession = sessionRef.current;
    if (currentSession && typeof currentSession.leaveCall === 'function') {
      try {
        console.log('[Ultravox] endSession: Attempting to leave call...');
        // No need to setIsConnecting(true) here, 'disconnected' status will handle state.
        await currentSession.leaveCall();
        console.log('[Ultravox] endSession: leaveCall promise resolved. "disconnected" status should follow.');
        // The 'disconnected' status handler will set isConnecting to false, setSession to null etc.
      } catch (error) {
        console.error('[Ultravox] endSession: Error during leaveCall:', error);
        onError(error instanceof Error ? error : new Error(String(error)));
        // Ensure state reflects that connection is over even if leaveCall fails and 'disconnected' doesn't fire
        setIsConnecting(false);
        setCallStatus('error_leaving');
        setSession(null); // Explicitly clear session here if leaveCall errors out
        sessionRef.current = null; // And the ref
        hasReachedIdleStateRef.current = false;
      }
    } else {
      console.log('[Ultravox] endSession: No current session or leaveCall not available. Already disconnected or not initialized.');
      // Ensure states are reset if endSession is called without an active session
      setIsConnecting(false);
      setSession(null);
      setCallStatus('disconnected'); // Reflect that the intention was to end.
      if (sessionRef.current) sessionRef.current = null; // Clear ref if somehow still set
      hasReachedIdleStateRef.current = false;
    }
  }, [onError]); // onError is the main prop dependency. State setters are not dependencies.

  /**
   * Get current session transcripts
   */
  const getTranscripts = useCallback((): Utterance[] => {
    const currentSession = sessionRef.current;
    if (!currentSession || !currentSession.transcripts) {
      return [];
    }

    return currentSession.transcripts
      .filter((t: any) => t && t.text && typeof t.text === 'string' && t.isFinal !== false) 
      .map((t: any) => ({
        speaker: t.speaker === 'user' ? 'user' : 'agent',
        text: t.text.trim(),
      }));
  }, []); 

  /**
   * Check if microphone is muted
   */
  const isMicMuted = useCallback((): boolean => {
    const currentSession = sessionRef.current;
    if (currentSession && typeof currentSession.isMicMuted === 'function') {
      return currentSession.isMicMuted();
    }
    return true; // Default to muted if no session or function not available
  }, []); 

  /**
   * Toggle microphone mute
   */
  const toggleMic = useCallback(() => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    // isMicMuted itself uses sessionRef.current
    if (isMicMuted()) { 
      currentSession.unmuteMic?.();
    } else {
      currentSession.muteMic?.();
    }
  }, [isMicMuted]); 

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[Ultravox] Unmount effect running.');
      clearConnectionTimeout(); // Clear any pending connection timeout

      const sessionToClean = sessionRef.current;
      if (sessionToClean && typeof sessionToClean.leaveCall === 'function') {
        console.log('[Ultravox] useEffect unmount cleanup: Component is unmounting. Leaving call for session:', sessionToClean.id);
        sessionToClean.leaveCall().catch((err: any) => {
          console.error('[Ultravox] Error in unmount cleanup (leaveCall):', err);
          // onError is a dependency, so it's safe to call
          onError(err instanceof Error ? err : new Error(String(err)));
        });
        
        // Manually remove listeners here as a safeguard,
        // especially if the component unmounts before 'disconnected' status is processed.
        console.log('[Ultravox] Unmount: Removing event listeners for session:', sessionToClean.id);
        sessionToClean.removeEventListener('transcripts', handleTranscript);
        sessionToClean.removeEventListener('status', localHandleStatusUpdate);
        sessionToClean.removeEventListener('error', handleErrorEvent);
        if (sessionToClean.micMutedNotifier && typeof (sessionToClean.micMutedNotifier as any).removeListener === 'function') {
            (sessionToClean.micMutedNotifier as any).removeListener(handleMicMuteChange);
        }
        sessionRef.current = null; // Ensure ref is cleared on unmount
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onError, clearConnectionTimeout, handleTranscript, localHandleStatusUpdate, handleErrorEvent, handleMicMuteChange]); 


  return {
    session, 
    isConnecting, 
    initializeSession, // Setup function
    connect,           // Connection function
    endSession,
    getTranscripts,
    isMicMuted,
    toggleMic,
    callStatus, 
    callEndReason, 
    sessionRef, // Exposing sessionRef can be useful for direct interaction or debugging
  };
}
