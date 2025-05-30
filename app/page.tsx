// app/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useAppState } from '@/store/useAppState';
import { Utterance } from '@/lib/types';
import { BackendService } from '@/lib/backend-service'; 
import { ErrorOverlay } from '@/components/ErrorOverlay';
import { logger } from '@/lib/logger';

const UltravoxSessionManager = dynamic(
  () => import('@/components/UltravoxSessionManager').then(mod => mod.UltravoxSessionManager || mod.default),
  {
    ssr: false,
    loading: () => <div data-testid="ultravox-loading" style={{ padding: '20px', textAlign: 'center', color: '#555' }}>Initializing audio systems... Please wait.</div>,
  }
);

export default function HomePage() {
  // State from Zustand store
  const uiState = useAppState(state => state.uiState);
  const uvClientStatus = useAppState(state => state.uvClientStatus);
  const appCallId = useAppState(state => state.appCallId);
  const appJoinUrl = useAppState(state => state.appJoinUrl);
  const appErrorMessage = useAppState(state => state.appErrorMessage);
  const currentTranscript = useAppState(state => state.currentTranscript);
  
  const setUiState = useAppState(state => state.setUiState);
  const setUvClientStatus = useAppState(state => state.setUvClientStatus);
  const setAppCallId = useAppState(state => state.setAppCallId);
  const setAppJoinUrl = useAppState(state => state.setAppJoinUrl);
  const setAppErrorMessage = useAppState(state => state.setAppErrorMessage);
  const setCurrentTranscript = useAppState(state => state.setCurrentTranscript);
  const resetState = useAppState(state => state.resetState);

  const [shouldConnectUltravox, setShouldConnectUltravox] = useState(false);

  useEffect(() => {
    logger.log('[Page] Component Mounted.');
    // Ensure initial UI state is idle on mount, in case of hot-reloads or strange cached state
    if (uiState !== 'idle') {
       // setUiState('idle'); // This might be too aggressive if state is intentionally preserved
    }
    return () => {
      logger.log('[Page] Component Unmounted.');
      // Optional: Tell manager to disconnect if unmounting while active.
      // However, manager's own cleanup should handle this.
      // setShouldConnectUltravox(false); 
    };
  }, []); // Removed setUiState from deps to avoid loop if it was included

  useEffect(() => {
    logger.log('[Page] Relevant state change detected:', { uiState, uvClientStatus, appCallIdProvided: !!appCallId, shouldConnectUltravox, errorMsgPresent: !!appErrorMessage });
  }, [uiState, uvClientStatus, appCallId, shouldConnectUltravox, appErrorMessage]);

  const handleStartInterviewClick = useCallback(async () => {
    logger.log('[Page] Start Interview button clicked.');
    setUiState('fetchingCallDetails');
    setAppErrorMessage(null);
    setCurrentTranscript([]); 
    setAppCallId(null); // Clear previous details
    setAppJoinUrl(null);
    setShouldConnectUltravox(false); // Ensure it's false before trying to set true

    try {
      const details = await BackendService.getInstance().getCallDetails();
      if (details && details.callId && details.joinUrl) {
        logger.log('[Page] Call details fetched successfully:', details);
        setAppCallId(details.callId);
        setAppJoinUrl(details.joinUrl);
        setShouldConnectUltravox(true); // This will trigger the manager
        setUiState('connecting'); 
      } else {
        // This case includes details being null or parts of details being null/undefined
        throw new Error('Incomplete call details received from backend.');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error during call setup.';
      logger.error('[Page] Failed to get call details or critical error:', errMsg, error);
      setAppErrorMessage(`Setup failed: ${errMsg}`);
      setUiState('error');
      setShouldConnectUltravox(false);
      setAppCallId(null); // Ensure cleared on error
      setAppJoinUrl(null);
    }
  }, [setUiState, setAppErrorMessage, setCurrentTranscript, setAppCallId, setAppJoinUrl, setShouldConnectUltravox]);

  const handleEndInterviewClick = useCallback(() => {
    logger.log('[Page] End Interview button clicked.');
    // Primary action is to tell manager to disconnect.
    // Manager's onSessionEnd will handle UI state changes related to session closing.
    setShouldConnectUltravox(false); 
    setUiState('processing'); // Indicate something is happening post-call.
    logger.log('[Page] Ending interview process initiated. Manager will handle actual session termination.');
  }, [setShouldConnectUltravox, setUiState]);

  const handleManagerStatusChange = useCallback((status: string, details?: any) => {
    logger.log('[Page] Manager Status Change received:', { status, details });
    setUvClientStatus(status);

    switch (status) {
      case 'listening':
        setUiState('interviewing');
        setAppErrorMessage(null); // Clear any previous non-critical errors
        break;
      case 'failed':
      case 'error': // General error from manager/SDK
        setAppErrorMessage(details?.error?.message || details?.reason || 'Ultravox connection problem.');
        setUiState('error');
        setShouldConnectUltravox(false); // Stop trying to connect
        break;
      // 'closed' or 'ended' are better handled by onSessionEnd
      // 'connecting', 'initialized' etc. are intermediate, usually no UI change needed from here
    }
  }, [setUvClientStatus, setUiState, setAppErrorMessage, setShouldConnectUltravox]);

  const handleManagerTranscriptUpdate = useCallback((transcripts: Utterance[]) => {
    // logger.log('[Page] Manager Transcript Update. Count:', transcripts.length); // Can be very noisy
    setCurrentTranscript(transcripts);
  }, [setCurrentTranscript]);

  const handleManagerSessionEnd = useCallback((details: { code?: number; reason?: string; error?: Error }) => {
    logger.log('[Page] Manager Session End event received:', details);
    
    setShouldConnectUltravox(false); // Crucial: ensure manager is flagged to be disconnected
    setUvClientStatus('closed');

    const isAbnormalOrError = details.error || (details.code && ![1000, 1005].includes(details.code)); // 1000 normal, 1005 no status

    if (isAbnormalOrError) {
      const reason = details.reason || details.error?.message || 'Unknown session error';
      const codeSuffix = details.code ? ` (Code: ${details.code})` : '';
      logger.error('[Page] Session ended abnormally or with an error:', { reason, code: details.code });
      setAppErrorMessage(`Session ended unexpectedly: ${reason}${codeSuffix}`);
      setUiState('error');
    } else {
      logger.log('[Page] Session ended normally.');
      // Decide what state to go to: 'callEnded' for review, or 'idle' to allow new call.
      setUiState('callEnded'); 
    }
  }, [setShouldConnectUltravox, setUvClientStatus, setAppErrorMessage, setUiState]);

  const handleManagerError = useCallback((error: Error, context?: string) => {
    // This is for errors reported by the manager not covered by specific status changes or sessionEnd
    const ctxMsg = context ? ` (${context})` : '';
    logger.error(`[Page] Manager reported an Error${ctxMsg}:`, error.message, error);
    
    setAppErrorMessage(`An error occurred${ctxMsg}: ${error.message}`);
    setUiState('error');
    setShouldConnectUltravox(false); // Stop connection attempts
  }, [setAppErrorMessage, setUiState, setShouldConnectUltravox]);

  const handleRetryFromError = useCallback(() => {
    logger.log('[Page] Retry button clicked from error state.');
    // Reset all relevant states to allow a fresh start
    setAppErrorMessage(null);
    setAppCallId(null); 
    setAppJoinUrl(null);
    setCurrentTranscript([]);
    setUvClientStatus('disconnected');
    setShouldConnectUltravox(false); 
    setUiState('idle'); 
    logger.log('[Page] State reset for retry. User can click "Start Interview".');
  }, [setAppErrorMessage, setAppCallId, setAppJoinUrl, setCurrentTranscript, setUvClientStatus, setUiState, setShouldConnectUltravox]);

  const handleFullReset = useCallback(() => {
    logger.log('[Page] Full Reset button clicked.');
    resetState(); // Resets Zustand store (uiState will become 'idle')
    setShouldConnectUltravox(false); // Reset local component state
    // No need to manually set other states as resetState handles store properties.
    logger.log('[Page] Application state fully reset.');
  }, [resetState]);
  
  // --- Basic Styling (can be moved to a CSS module) ---
  const pageStyle: React.CSSProperties = { fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '800px', margin: '40px auto', background: '#f4f7f6', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' };
  const headerStyle: React.CSSProperties = { textAlign: 'center', color: '#333', marginBottom: '30px' };
  const statusBoxStyle: React.CSSProperties = { background: '#fff', padding: '15px', borderRadius: '5px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '20px' };
  const controlsStyle: React.CSSProperties = { display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' };
  const buttonStyle: React.CSSProperties = { padding: '12px 20px', fontSize: '1rem', cursor: 'pointer', border: 'none', borderRadius: '5px', transition: 'background-color 0.2s ease' };
  const startButtonStyle: React.CSSProperties = { ...buttonStyle, backgroundColor: '#28a745', color: 'white' };
  const endButtonStyle: React.CSSProperties = { ...buttonStyle, backgroundColor: '#dc3545', color: 'white' };
  const disabledButtonStyle: React.CSSProperties = { ...buttonStyle, backgroundColor: '#6c757d', color: '#ccc' };
  const transcriptAreaStyle: React.CSSProperties = { border: '1px solid #e0e0e0', padding: '15px', minHeight: '150px', maxHeight: '400px', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '5px' };
  const loadingStyle: React.CSSProperties = { padding: '20px', textAlign: 'center', color: '#555', fontSize: '1.1rem' };
  const transcriptEntryStyle: React.CSSProperties = { marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px dashed #eee' };

  return (
    <div style={pageStyle}>
      <header style={headerStyle}><h1>AI Interview Platform</h1></header>

      <div style={statusBoxStyle}>
        <p><strong>Application Status:</strong> <span data-testid="ui-state" style={{fontWeight: 'bold', color: uiState === 'error' ? 'red' : 'green'}}>{uiState}</span></p>
        <p><strong>Connection Status:</strong> <span data-testid="uv-client-status">{uvClientStatus}</span></p>
        {appCallId && <p><strong>Current Call ID:</strong> {appCallId}</p>}
      </div>

      <div style={controlsStyle}>
        <button 
          onClick={handleStartInterviewClick} 
          disabled={!['idle', 'error', 'callEnded'].includes(uiState)}
          style={!['idle', 'error', 'callEnded'].includes(uiState) ? disabledButtonStyle : startButtonStyle}
          data-testid="start-interview-button"
        >
          Start New Interview
        </button>
        <button 
          onClick={handleEndInterviewClick} 
          disabled={uiState !== 'interviewing'}
          style={uiState !== 'interviewing' ? disabledButtonStyle : endButtonStyle}
          data-testid="end-interview-button"
        >
          End Current Interview
        </button>
      </div>

      {['fetchingCallDetails', 'connecting'].includes(uiState) && (
        <div data-testid="loading-indicator" style={loadingStyle}>Loading: {uiState}... Please wait.</div>
      )}

      {/* UltravoxSessionManager is mounted when we have details and shouldConnect is true */}
      {appJoinUrl && appCallId && ( /* Only attempt to render manager if essential props are present */
        <UltravoxSessionManager
          joinUrl={appJoinUrl}
          callId={appCallId}
          shouldConnect={shouldConnectUltravox} // This flag gates connection attempts within manager
          onStatusChange={handleManagerStatusChange}
          onTranscriptUpdate={handleManagerTranscriptUpdate}
          onSessionEnd={handleManagerSessionEnd}
          onError={handleManagerError}
        />
      )}

      <h3>Live Transcript:</h3>
      <div style={transcriptAreaStyle} data-testid="transcript-area">
        {currentTranscript.length === 0 && <p>No speech detected yet...</p>}
        {currentTranscript.map((utt, i) => (
          <p key={`${utt.speaker}-${utt.timestamp}-${i}`} style={transcriptEntryStyle}> 
            <strong style={{color: utt.speaker === 'Bot' ? '#007bff' : '#28a745'}}>{utt.speaker}:</strong> {utt.transcript} 
            <span style={{fontSize: '0.8em', color: '#777', marginLeft: '10px'}}>({new Date(utt.timestamp).toLocaleTimeString()})</span>
          </p>
        ))}
      </div>

      {uiState === 'error' && appErrorMessage && (
        <ErrorOverlay 
          message={appErrorMessage} 
          onRetry={handleRetryFromError} 
          onReset={handleFullReset} 
        />
      )}
    </div>
  );
}
