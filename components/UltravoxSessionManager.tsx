'use client';

import React, { useEffect, useState, useRef } from 'react'; // Added useRef
import { useUltravoxSession } from '@/hooks/useUltravoxSession';
// Assuming Utterance type is available, adjust path if necessary
// If not available, this might cause an error during generation/compilation by the worker.
// Fallback for worker: import type { Utterance } from './temp-types'; or use any[]
import type { Utterance } from '@/lib/types'; 

export interface UltravoxManagerProps {
  joinUrl: string;
  callId?: string; // Optional, as per issue description
  onTranscriptUpdate: (transcript: Utterance[]) => void; // Corrected type
  onStatusChange: (status: string) => void; 
  onSessionEnd: () => void;
  onError: (error: Error) => void;
  // Add any other necessary props based on useUltravoxSession needs
}

const UltravoxSessionManager: React.FC<UltravoxManagerProps> = (props) => {
  const {
    joinUrl,
    callId,
    onTranscriptUpdate,
    onStatusChange,
    onSessionEnd,
    onError,
  } = props;

  // Renamed to avoid conflict if hook returns 'isConnecting'
  const [isConnectingState, setIsConnectingState] = useState(true); 
  const [initializationError, setInitializationError] = useState<string | null>(null);

  // Destructure new methods and states from the hook
  const { 
    initializeSession, 
    connect, 
    endSession, 
    sessionRef, // To check if session exists for cleanup
    isConnecting: isUltravoxConnecting, // Hook's own connecting state
    callStatus 
  } = useUltravoxSession({
    onTranscriptUpdate,
    onStatusChange: (status) => {
      if (isMounted.current) { // Check if component is still mounted
        onStatusChange(status);
        // This component's connecting state is now primarily driven by isUltravoxConnecting or callStatus changes
        // but can also be set directly on terminal statuses if needed.
        if (status === 'idle' || status === 'disconnected' || status === 'error') {
          setIsConnectingState(false);
        }
        if (status === 'error' && !initializationError) { // If status is error, ensure error message is shown
            // This might be redundant if onError callback is always reliably called by the hook
            // setInitializationError("Session entered an error state."); 
        }
      }
    },
    onSessionEnd: () => {
      if (isMounted.current) {
        onSessionEnd();
        setIsConnectingState(false);
      }
    },
    onError: (error) => {
      if (isMounted.current) {
        onError(error);
        setIsConnectingState(false);
        setInitializationError(error.message || "An unknown error occurred.");
      }
    },
  });

  // Use a ref to track if component is mounted to avoid state updates on unmounted component
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    console.log('[UltravoxSessionManager] Main useEffect triggered. joinUrl:', joinUrl, 'callId:', callId);
    if (isMounted.current) {
        setInitializationError(null);
    }
    

    // 1. Perform pre-checks
    if (typeof window === 'undefined') {
      console.error('[UltravoxSessionManager] Pre-check failed: window is undefined.');
      onError(new Error('SDK Error: Critical pre-check failed (window undefined).'));
      if (isMounted.current) {
        setInitializationError('Critical pre-check failed: Browser environment not available.');
        setIsConnectingState(false);
      }
      return;
    }
    if (!window.WebSocket) {
      console.error('[UltravoxSessionManager] Pre-check failed: window.WebSocket is not available.');
      onError(new Error('SDK Error: WebSocket not supported.'));
      if (isMounted.current) {
        setInitializationError('Browser feature missing: WebSocket not supported.');
        setIsConnectingState(false);
      }
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('[UltravoxSessionManager] Pre-check failed: navigator.mediaDevices.getUserMedia is not available.');
      onError(new Error('SDK Error: MediaDevices API (getUserMedia) not supported.'));
      if (isMounted.current) {
        setInitializationError('Browser feature missing: MediaDevices API not supported.');
        setIsConnectingState(false);
      }
      return;
    }
    console.log('[UltravoxSessionManager] Pre-checks passed.');

    // Call the synchronous initializeSession first
    // Ensure initializeSession is stable or correctly memoized in useUltravoxSession
    initializeSession(); 
    console.log('[UltravoxSessionManager] initializeSession called. sessionRef should be populated now or soon.');

    const performConnect = async () => {
      if (!joinUrl) {
        console.warn('[UltravoxSessionManager] No joinUrl provided, skipping connection.');
        if (isMounted.current) {
            setIsConnectingState(false);
        }
        return;
      }
      
      // Set connecting true before async call, hook's isUltravoxConnecting will confirm
      if (isMounted.current) {
          setIsConnectingState(true); 
      }
      try {
        console.log('[UltravoxSessionManager] Calling connect(joinUrl)...');
        // `connect` is from the hook, ensure it's stable or correctly memoized
        const connected = await connect(joinUrl); 
        console.log('[UltravoxSessionManager] connect(joinUrl) completed. Result:', connected);
        if (!connected && isMounted.current) {
          // If connect returns false, it means joinCall wasn't invoked or failed early.
          // The onError callback within the hook should have been called.
          // If not, we might need to set an error here.
          // For now, assume hook's onError is reliable.
          // setInitializationError('Failed to initiate connection to Ultravox session.');
          // setIsConnectingState(false); // Should be handled by onError or status change
        }
      } catch (error: any) {
        console.error('[UltravoxSessionManager] Error during connect(joinUrl) call itself:', error);
        if (isMounted.current) {
          // This catch block handles errors from the connect() call itself,
          // not from the async process within connect (which uses onError prop).
          // However, a well-behaved connect() should propagate errors via its own onError.
          onError(error); // Propagate error
          setInitializationError(error.message || 'An unexpected error occurred during the connection attempt.');
          setIsConnectingState(false);
        }
      }
      // Final connection state (isConnectingState) should be managed by onStatusChange or onError callbacks from the hook
    };

    performConnect();

    return () => {
      console.log('[UltravoxSessionManager] Cleanup: Component unmounting or deps changed. Current joinUrl:', joinUrl);
      // Check if session exists using sessionRef before calling endSession
      // `endSession` from the hook should be safe to call even if session is already null/disconnected
      if (sessionRef.current) {
         console.log('[UltravoxSessionManager] Active session found (sessionRef.current exists). Calling endSession() during cleanup.');
         endSession?.(); 
      } else {
         console.log('[UltravoxSessionManager] No active session (sessionRef.current is null). Skipping endSession() during cleanup.');
      }
      // No need to set isMounted.current to false here, that's handled by its own effect.
      // Resetting component-specific state on unmount or dep change might be needed if not handled by hook.
      // setIsConnectingState(false); // This might be too aggressive if deps change but component stays mounted for a reconnect.
                                 // The hook's state (isUltravoxConnecting) is the source of truth.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinUrl, callId, initializeSession, connect, endSession, sessionRef, onTranscriptUpdate, onStatusChange, onSessionEnd, onError]);

  // Update local connecting state based on hook's connecting state
  useEffect(() => {
    if (isMounted.current) {
        // Only update if different to avoid potential loops if not careful, though useState handles this.
        if (isConnectingState !== isUltravoxConnecting) {
            setIsConnectingState(isUltravoxConnecting);
        }
    }
  }, [isUltravoxConnecting, isConnectingState]); // Added isConnectingState to dependencies for safety, though a bit redundant

  if (initializationError) {
    return (
      <div style={{ padding: '20px', color: 'red', border: '1px solid red', margin: '10px' }}>
        <p><strong>Ultravox Session Manager Error:</strong></p>
        <p>{initializationError}</p>
        <p>Status: {callStatus || 'N/A'}</p>
      </div>
    );
  }
  
  // This component might render a loading indicator based on its own or the hook's connecting state
  // Example:
  // if (isConnectingState) { 
  //   return <p>Loading Audio Session Manager... (Status: {callStatus || 'Initializing'})</p>;
  // }

  return null; // This component primarily manages the session, doesn't render UI itself beyond errors
};

export default UltravoxSessionManager;
