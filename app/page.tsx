// app/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppState } from '@/store/useAppState';
import { Utterance } from '@/lib/types';
import { BackendService } from '@/lib/backend-service'; 
import { ErrorOverlay } from '@/components/ErrorOverlay';
import { UltravoxSessionManager } from '@/components/UltravoxSessionManager';
import { logger } from '@/lib/logger';

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
  const [summaryData, setSummaryData] = useState<any>(null);
  const [analysisData, setAnalysisData] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    logger.log('[Page] Component Mounted.');
    return () => {
      logger.log('[Page] Component Unmounted.');
    };
  }, []);

  useEffect(() => {
    logger.log('[Page] Relevant state change detected:', { 
      uiState, 
      uvClientStatus, 
      appCallIdProvided: !!appCallId, 
      shouldConnectUltravox, 
      errorMsgPresent: !!appErrorMessage 
    });
  }, [uiState, uvClientStatus, appCallId, shouldConnectUltravox, appErrorMessage]);

  const handleStartInterviewClick = useCallback(async () => {
    logger.log('[Page] Start Interview button clicked.');
    setUiState('fetchingCallDetails');
    setAppErrorMessage(null);
    setCurrentTranscript([]); 
    setAppCallId(null);
    setAppJoinUrl(null);
    setShouldConnectUltravox(false);
    setSummaryData(null);
    setAnalysisData(null);

    try {
      const details = await BackendService.getInstance().initiateIntake();
      if (details && details.callId && details.joinUrl) {
        logger.log('[Page] Call details fetched successfully:', details);
        setAppCallId(details.callId);
        setAppJoinUrl(details.joinUrl);
        setShouldConnectUltravox(true);
        setUiState('connecting'); 
      } else {
        throw new Error('Incomplete call details received from backend.');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error during call setup.';
      logger.error('[Page] Failed to initiate intake:', errMsg, error);
      setAppErrorMessage(`Setup failed: ${errMsg}`);
      setUiState('error');
      setShouldConnectUltravox(false);
      setAppCallId(null);
      setAppJoinUrl(null);
    }
  }, [setUiState, setAppErrorMessage, setCurrentTranscript, setAppCallId, setAppJoinUrl]);

  const handleEndInterviewClick = useCallback(async () => {
    logger.log('[Page] End Interview button clicked.');
    setShouldConnectUltravox(false); 
    setUiState('processing');
    setIsProcessing(true);

    // Submit transcript to backend
    if (currentTranscript.length > 0 && appCallId) {
      try {
        const transcriptText = currentTranscript
          .map(utt => `${utt.speaker}: ${utt.transcript}`)
          .join('\n');
        
        logger.log('[Page] Submitting transcript to backend...');
        const response = await BackendService.getInstance().submitTranscript(appCallId, transcriptText);
        
        if (response.summary) {
          setSummaryData(response.summary);
          logger.log('[Page] Summary received:', response.summary);
        }
        
        if (response.analysis) {
          setAnalysisData(response.analysis);
          logger.log('[Page] Analysis received:', response.analysis);
        }
        
        setUiState('completed');
        setIsProcessing(false);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error during transcript submission.';
        logger.error('[Page] Failed to submit transcript:', errMsg, error);
        setAppErrorMessage(`Processing failed: ${errMsg}`);
        setUiState('error');
        setIsProcessing(false);
      }
    } else {
      logger.warn('[Page] No transcript to submit or missing call ID.');
      setUiState('idle');
      setIsProcessing(false);
    }
  }, [currentTranscript, appCallId, setShouldConnectUltravox, setUiState, setAppErrorMessage]);

  const handleManagerStatusChange = useCallback((status: string, details?: any) => {
    // Use refs to get current values to avoid stale closure
    const currentUIState = useAppState.getState().uiState;
    const currentUVStatus = useAppState.getState().uvClientStatus;
    
    logger.log('[Page] Manager Status Change received:', { status, details, currentUIState, currentUVStatus });
    
    // Only update UV client status if it's actually different
    if (currentUVStatus !== status) {
      setUvClientStatus(status);
    }

    switch (status) {
      case 'connecting':
        // Only update UI state if we're not already connecting to prevent unmount cycles
        if (currentUIState !== 'connecting') {
          setUiState('connecting');
        }
        setAppErrorMessage(null);
        break;
      case 'idle':
        // Session connected and media ready, but microphone still muted
        if (currentUIState !== 'connecting') {
          setUiState('connecting');
        }
        setAppErrorMessage(null);
        break;
      case 'listening':
        // Microphone unmuted and ready for conversation
        setUiState('interviewing');
        setAppErrorMessage(null);
        break;
      case 'thinking':
      case 'speaking':
        // Keep in interviewing state during conversation
        if (currentUIState !== 'interviewing') {
          setUiState('interviewing');
        }
        break;
      case 'disconnected':
        // Natural session end
        setShouldConnectUltravox(false);
        break;
      case 'failed':
      case 'error':
        setAppErrorMessage(details?.error?.message || details?.reason || 'Ultravox connection problem.');
        setUiState('error');
        setShouldConnectUltravox(false);
        break;
    }
  }, []); // Remove ALL dependencies to make callback truly stable

  const handleManagerTranscriptUpdate = useCallback((transcripts: Utterance[]) => {
    setCurrentTranscript(transcripts);
  }, []);

  const handleManagerSessionEnd = useCallback((details: { code?: number; reason?: string; error?: Error }) => {
    logger.log('[Page] Manager Session End event received:', details);
    
    setShouldConnectUltravox(false);
    setUvClientStatus('closed');

    const isAbnormalOrError = details.error || (details.code && ![1000, 1005].includes(details.code));

    if (isAbnormalOrError) {
      const reason = details.reason || details.error?.message || 'Unknown session error';
      const codeSuffix = details.code ? ` (Code: ${details.code})` : '';
      logger.error('[Page] Session ended abnormally:', { reason, code: details.code });
      
      // Special handling for 4409 Conflict errors
      if (details.code === 4409 && details.reason === 'Conflict') {
        setAppErrorMessage('Voice service conflict detected - this may be a temporary server-side issue. Please try again in a moment.');
      } else {
        setAppErrorMessage(`Session ended unexpectedly: ${reason}${codeSuffix}`);
      }
      setUiState('error');
    } else {
      logger.log('[Page] Session ended normally.');
      setUiState('callEnded'); 
    }
  }, []);

  const handleManagerError = useCallback((error: Error, context?: string) => {
    const ctxMsg = context ? ` (${context})` : '';
    logger.error(`[Page] Manager reported an Error${ctxMsg}:`, error.message, error);
    
    // Don't treat unmount-related race conditions as fatal errors
    if (context === 'ConnectSessionChangedDuringJoin' || context === 'ConnectSessionChangedBeforeJoin') {
      logger.log('[Page] Ignoring unmount-related race condition, will retry on next render.');
      return; // Don't change state, let the component retry naturally
    }
    
    setAppErrorMessage(`An error occurred${ctxMsg}: ${error.message}`);
    setUiState('error');
    setShouldConnectUltravox(false);
  }, []);

  const handleRetryFromError = useCallback(() => {
    logger.log('[Page] Retry button clicked from error state.');
    setAppErrorMessage(null);
    setAppCallId(null); 
    setAppJoinUrl(null);
    setCurrentTranscript([]);
    setUvClientStatus('disconnected');
    setShouldConnectUltravox(false); 
    setUiState('idle');
    setSummaryData(null);
    setAnalysisData(null);
  }, []);

  const handleFullReset = useCallback(() => {
    logger.log('[Page] Full Reset button clicked.');
    resetState();
    setShouldConnectUltravox(false);
    setSummaryData(null);
    setAnalysisData(null);
    setIsProcessing(false);
  }, []);

  const handleManagerExperimentalMessage = useCallback((message: any) => {
    logger.log('[Page] Manager Experimental Message:', message);
  }, []);

  // Memoize the entire UltravoxSessionManager component to prevent re-renders
  const memoizedSessionManager = useMemo(() => (
    <UltravoxSessionManager
      joinUrl={appJoinUrl}
      callId={appCallId}
      shouldConnect={shouldConnectUltravox && !!(appJoinUrl && appCallId)}
      onStatusChange={handleManagerStatusChange}
      onTranscriptUpdate={handleManagerTranscriptUpdate}
      onSessionEnd={handleManagerSessionEnd}
      onError={handleManagerError}
      onExperimentalMessage={handleManagerExperimentalMessage}
    />
  ), [
    appJoinUrl,
    appCallId, 
    shouldConnectUltravox,
    handleManagerStatusChange,
    handleManagerTranscriptUpdate,
    handleManagerSessionEnd,
    handleManagerError,
    handleManagerExperimentalMessage
  ]);

  // Styles
  const containerStyle: React.CSSProperties = {
    fontFamily: 'system-ui, sans-serif',
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
    background: '#f5f5f5',
    minHeight: '100vh'
  };

  const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    color: '#333',
    marginBottom: '30px',
    padding: '20px',
    background: 'white',
    borderRadius: '10px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: 'auto auto',
    gap: '20px',
    marginTop: '20px'
  };

  const area1Style: React.CSSProperties = {
    gridColumn: '1 / 3',
    background: 'white',
    padding: '20px',
    borderRadius: '10px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    minHeight: '300px'
  };

  const area2Style: React.CSSProperties = {
    background: 'white',
    padding: '20px',
    borderRadius: '10px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    minHeight: '250px'
  };

  const area3Style: React.CSSProperties = {
    background: 'white',
    padding: '20px',
    borderRadius: '10px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    minHeight: '250px'
  };

  const buttonStyle: React.CSSProperties = {
    padding: '12px 24px',
    fontSize: '16px',
    cursor: 'pointer',
    border: 'none',
    borderRadius: '5px',
    transition: 'background-color 0.2s ease',
    marginRight: '10px'
  };

  const startButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#28a745',
    color: 'white'
  };

  const endButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#dc3545',
    color: 'white'
  };

  const disabledButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#6c757d',
    color: '#ccc',
    cursor: 'not-allowed'
  };

  const transcriptStyle: React.CSSProperties = {
    border: '1px solid #e0e0e0',
    padding: '15px',
    height: '200px',
    overflowY: 'auto',
    backgroundColor: '#f9f9f9',
    borderRadius: '5px',
    marginTop: '10px'
  };

  const summaryStyle: React.CSSProperties = {
    backgroundColor: '#f0f8ff',
    padding: '15px',
    borderRadius: '5px',
    fontSize: '14px',
    lineHeight: '1.6',
    maxHeight: '200px',
    overflowY: 'auto'
  };

  const analysisStyle: React.CSSProperties = {
    backgroundColor: '#f0fff0',
    padding: '15px',
    borderRadius: '5px',
    fontSize: '14px',
    lineHeight: '1.6',
    maxHeight: '200px',
    overflowY: 'auto'
  };

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <h1>MedIntake - AI Medical Interview System</h1>
        <p style={{ color: '#666', marginTop: '10px' }}>
          Status: <strong>{uiState}</strong> | Connection: <strong>{uvClientStatus}</strong>
        </p>
      </header>

      <div style={gridStyle}>
        {/* Area 1: Audio Interaction */}
        <div style={area1Style}>
          <h2>Audio Interview Control</h2>
          
          <div style={{ marginBottom: '20px' }}>
            <button 
              onClick={handleStartInterviewClick} 
              disabled={!['idle', 'error', 'callEnded', 'completed'].includes(uiState)}
              style={!['idle', 'error', 'callEnded', 'completed'].includes(uiState) ? disabledButtonStyle : startButtonStyle}
              data-testid="start-interview-button"
            >
              Start Interview
            </button>
            <button 
              onClick={handleEndInterviewClick} 
              disabled={uiState !== 'interviewing'}
              style={uiState !== 'interviewing' ? disabledButtonStyle : endButtonStyle}
              data-testid="end-interview-button"
            >
              End Interview
            </button>
          </div>

          {['fetchingCallDetails', 'connecting'].includes(uiState) && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#007bff' }}>
              <div>⏳ {uiState === 'fetchingCallDetails' ? 'Getting interview details...' : 'Connecting to AI assistant...'}</div>
            </div>
          )}

          {isProcessing && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#28a745' }}>
              <div>⏳ Processing your interview data...</div>
            </div>
          )}

          {memoizedSessionManager}

          <h3>Live Transcript</h3>
          <div style={transcriptStyle} data-testid="transcript-area">
            {currentTranscript.length === 0 ? (
              <p style={{ color: '#999', textAlign: 'center' }}>Conversation will appear here...</p>
            ) : (
              currentTranscript.map((utt, i) => (
                <div key={`${utt.speaker}-${utt.timestamp}-${i}`} style={{ marginBottom: '10px' }}>
                  <strong style={{ color: utt.speaker === 'agent' ? '#007bff' : '#28a745' }}>
                    {utt.speaker === 'agent' ? 'AI Assistant' : 'Patient'}:
                  </strong> {utt.transcript}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Area 2: Intake Summary */}
        <div style={area2Style}>
          <h2>Intake Summary (JSON)</h2>
          <div style={summaryStyle}>
            {summaryData ? (
              <pre style={{ margin: 0, fontFamily: 'monospace' }}>
                {JSON.stringify(summaryData, null, 2)}
              </pre>
            ) : (
              <p style={{ color: '#999', textAlign: 'center' }}>
                Summary will appear here after interview completion
              </p>
            )}
          </div>
        </div>

        {/* Area 3: Clinical Insights */}
        <div style={area3Style}>
          <h2>Clinical Insights</h2>
          <div style={analysisStyle}>
            {analysisData ? (
              <div style={{ whiteSpace: 'pre-wrap' }}>{analysisData}</div>
            ) : (
              <p style={{ color: '#999', textAlign: 'center' }}>
                Clinical analysis will appear here after interview completion
              </p>
            )}
          </div>
        </div>
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
