// app/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAppState } from '@/store/useAppState';
import { Utterance } from '@/lib/types';
import { BackendService } from '@/lib/backend-service'; 
import { ErrorOverlay } from '@/components/ErrorOverlay';
import { useUltravoxSingleton } from '@/hooks/useUltravoxSingleton';
import { logger } from '@/lib/logger';
import { getConfig } from '@/lib/config';
import FunLoadingAnimation from '@/components/FunLoadingAnimation';
import { transcriptPersistence } from '@/lib/transcript-persistence';

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
  const [isManualEnd, setIsManualEnd] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [maxRetryAttempts, setMaxRetryAttempts] = useState(0);

  useEffect(() => {
    logger.log('[Page] Component Mounted.');
    
    // Warm up the backend service to prevent cold start 503 errors
    BackendService.getInstance().checkHealth()
      .then(isHealthy => {
        if (isHealthy) {
          logger.log('[Page] Backend service is healthy and warmed up.');
        } else {
          logger.warn('[Page] Backend service health check failed.');
        }
      })
      .catch(err => {
        logger.warn('[Page] Backend service warm-up failed:', err.message);
      });
    
    return () => {
      logger.log('[Page] Component Unmounted.');
    };
  }, []);

  useEffect(() => {
    const config = getConfig();
    if (config.enableDebugLogging) {
      logger.debug('[Page] Relevant state change detected:', { 
        uiState, 
        uvClientStatus, 
        appCallIdProvided: !!appCallId, 
        shouldConnectUltravox, 
        errorMsgPresent: !!appErrorMessage 
      });
    }
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
    setIsManualEnd(false); // Reset manual end flag for new interview

    try {
      const details = await BackendService.getInstance().initiateIntake();
      if (details && details.callId && details.joinUrl) {
        logger.log('[Page] Call details fetched successfully:', { 
          callId: details.callId, 
          joinUrlPreview: details.joinUrl.substring(0, 50) + '...',
          timestamp: new Date().toISOString(),
          action: 'NEW_INTERVIEW_START'
        });
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

  const submitTranscriptWithRetry = useCallback(async (
    callId: string,
    transcriptText: string,
    transcript: Utterance[]
  ) => {
    try {
      // Save transcript to localStorage before submission
      transcriptPersistence.saveTranscript(callId, transcript, transcriptText);
      
      const response = await BackendService.getInstance().submitTranscript(
        callId, 
        transcriptText,
        0,
        (attempt, totalAttempts) => {
          setRetryAttempt(attempt);
          setMaxRetryAttempts(totalAttempts);
          logger.log(`[Page] Retry progress: ${attempt}/${totalAttempts}`);
        }
      );
      
      // Clear retry state on success
      setRetryAttempt(0);
      setMaxRetryAttempts(0);
      
      // Clear persisted transcript on success
      transcriptPersistence.clearTranscript();
      
      if (response.summary) {
        setSummaryData(response.summary);
        logger.log('[Page] Summary received:', response.summary);
      }
      
      if (response.analysis) {
        logger.log('[Page] Analysis received - Debug info:', {
          analysisType: typeof response.analysis,
          analysisLength: response.analysis.length,
          analysisPreview: response.analysis.substring(0, 100) + '...',
          analysisFullContent: response.analysis,
          responseKeys: Object.keys(response)
        });
        setAnalysisData(response.analysis);
        logger.log('[Page] Analysis received:', response.analysis);
      }
      
      setUiState('completed');
      setIsProcessing(false);
    } catch (error) {
      logger.error('[Page] Failed to submit transcript:', error);
      
      // Clear retry state on error
      setRetryAttempt(0);
      setMaxRetryAttempts(0);
      
      // Use the user message from AppError if available
      let userMessage: string;
      if (error && typeof error === 'object' && 'userMessage' in error && error.userMessage) {
        userMessage = error.userMessage as string;
      } else {
        // Fallback to basic error handling
        const errMsg = error instanceof Error ? error.message : 'Unknown error during transcript submission.';
        if (errMsg.includes('503') || errMsg.includes('SERVICE_UNAVAILABLE')) {
          userMessage = 'The processing service is warming up. Your transcript has been saved and will be processed automatically. Please wait a moment.';
        } else if (errMsg.includes('timeout')) {
          userMessage = 'The processing service took too long to respond. Your transcript has been saved. Please try again.';
        } else if (errMsg.includes('network')) {
          userMessage = 'Unable to connect to the processing service. Your transcript has been saved. Please check your internet connection and try again.';
        } else {
          userMessage = `Processing failed: ${errMsg}. Your transcript has been saved.`;
        }
      }
      
      setAppErrorMessage(userMessage);
      setUiState('error');
      setIsProcessing(false);
    }
  }, [setSummaryData, setAnalysisData, setUiState, setAppErrorMessage]);

  const handleEndInterviewClick = useCallback(async () => {
    logger.log('[Page] End Interview button clicked.');
    
    // Set manual end flag to prevent duplicate submission
    setIsManualEnd(true);
    
    // Immediately disconnect the Ultravox session
    setShouldConnectUltravox(false);
    
    // Force immediate disconnect to stop audio
    const { ultravoxSingleton } = await import('@/lib/ultravox-singleton');
    await ultravoxSingleton.disconnect();
    
    setUiState('processing');
    setIsProcessing(true);

    // Submit transcript to backend
    if (currentTranscript.length > 0 && appCallId) {
      // Filter out empty transcripts and format properly
      const transcriptText = transcriptPersistence.formatTranscriptText(currentTranscript);
      
      logger.log('[Page] Manual end - transcript before filtering:', {
        rawTranscript: currentTranscript,
        rawLength: currentTranscript.length
      });
      
      if (!transcriptText || transcriptText.trim().length === 0) {
        logger.warn('[Page] No valid transcript content to submit after filtering.');
        setUiState('idle');
        setIsProcessing(false);
        return;
      }
      
      logger.log('[Page] Submitting transcript to backend...', {
        callId: appCallId,
        transcriptLength: transcriptText.length,
        utteranceCount: currentTranscript.length,
        sampleText: transcriptText.substring(0, 100) + '...'
      });
      
      await submitTranscriptWithRetry(appCallId, transcriptText, currentTranscript);
    } else {
      logger.warn('[Page] No transcript to submit or missing call ID.');
      setUiState('idle');
      setIsProcessing(false);
    }
  }, [currentTranscript, appCallId, setShouldConnectUltravox, setUiState, submitTranscriptWithRetry]);

  const handleManagerStatusChange = useCallback((status: string, details?: any) => {
    // Use refs to get current values to avoid stale closure
    const currentUIState = useAppState.getState().uiState;
    const currentUVStatus = useAppState.getState().uvClientStatus;
    
    const config = getConfig();
    if (config.enableDebugLogging) {
      logger.debug('[Page] Manager Status Change received:', { status, details, currentUIState, currentUVStatus });
    }
    
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
        
        // Check if we were in an active interview and not manual end
        if (currentUIState === 'interviewing' && !isManualEnd) {
          // Trigger transcript processing
          logger.log('[Page] Interview ended naturally, processing transcript...');
          
          // Get the current transcript and callId from the store
          const state = useAppState.getState();
          let transcript = state.currentTranscript;
          const callId = state.appCallId;
          
          // Fallback to window backup if store is empty
          if ((!transcript || transcript.length === 0) && (window as any).__latestTranscript) {
            logger.log('[Page] Using backup transcript from window');
            transcript = (window as any).__latestTranscript;
          }
          
          logger.log('[Page] Natural end - getting transcript from store:', {
            transcriptFromStore: transcript,
            transcriptLength: transcript?.length || 0,
            callIdFromStore: callId,
            hasBackup: !!(window as any).__latestTranscript
          });
          
          if (transcript.length > 0 && callId) {
            setUiState('processing');
            setIsProcessing(true);
            
            // Process transcript asynchronously
            (async () => {
              // Filter out empty transcripts and format properly
              const transcriptText = transcriptPersistence.formatTranscriptText(transcript);
              
              logger.log('[Page] Transcript before filtering:', {
                rawTranscript: transcript,
                rawLength: transcript.length
              });
              
              if (!transcriptText || transcriptText.trim().length === 0) {
                logger.warn('[Page] No valid transcript content to submit after filtering.');
                setUiState('completed');
                setIsProcessing(false);
                return;
              }
              
              logger.log('[Page] Submitting transcript to backend...', {
                callId,
                transcriptLength: transcriptText.length,
                utteranceCount: transcript.length,
                sampleText: transcriptText.substring(0, 100) + '...'
              });
              
              await submitTranscriptWithRetry(callId, transcriptText, transcript);
            })();
          } else {
            logger.warn('[Page] No transcript to submit or missing call ID.');
            setUiState('idle');
          }
        }
        break;
      case 'failed':
      case 'error':
        setAppErrorMessage(details?.error?.message || details?.reason || 'Ultravox connection problem.');
        setUiState('error');
        setShouldConnectUltravox(false);
        break;
    }
  }, [isManualEnd, submitTranscriptWithRetry]); // Add submitTranscriptWithRetry to dependencies

  const handleManagerTranscriptUpdate = useCallback((transcripts: Utterance[]) => {
    const config = getConfig();
    
    // Only log verbose transcript details if enabled
    if (config.enableVerboseTranscriptLogging) {
      logger.debug('[Page] Transcript update received:', {
        count: transcripts.length,
        transcripts: transcripts,
        firstTranscript: transcripts[0],
        lastTranscript: transcripts[transcripts.length - 1]
      });
    }
    
    setCurrentTranscript(transcripts);
    
    // Also store in a ref to ensure we have it when disconnect happens
    if (transcripts.length > 0) {
      (window as any).__latestTranscript = transcripts;
    }
  }, []); // Remove ALL dependencies

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
  }, []); // Remove ALL dependencies

  const handleManagerError = useCallback((error: Error, context?: string) => {
    const ctxMsg = context ? ` (${context})` : '';
    logger.error(`[Page] Manager reported an Error${ctxMsg}:`, error.message, error);
    
    // Don't treat unmount-related race conditions as fatal errors
    if (context === 'ConnectSessionChangedDuringJoin' || context === 'ConnectSessionChangedBeforeJoin') {
      logger.log('[Page] Ignoring unmount-related race condition, will retry on next render.');
      return; // Don't change state, let the component retry naturally
    }
    
    // Check if this is a join URL reuse error (4409 conflict or similar)
    if (error.message.includes('reuse') || error.message.includes('Conflict') || error.message.includes('4409')) {
      logger.log('[Page] Detected join URL reuse error - will need fresh URL on retry');
      setAppErrorMessage('Voice service conflict detected - this may be a temporary server-side issue. Please try again in a moment.');
    } else {
      setAppErrorMessage(`An error occurred${ctxMsg}: ${error.message}`);
    }
    
    setUiState('error');
    setShouldConnectUltravox(false);
  }, []); // Remove ALL dependencies

  const handleRetryFromError = useCallback(async () => {
    logger.log('[Page] Retry button clicked from error state.');
    
    // Check if we have a saved transcript we can retry with
    const savedTranscript = transcriptPersistence.getTranscript();
    
    if (savedTranscript && savedTranscript.callId && savedTranscript.transcript.length > 0) {
      logger.log('[Page] Found saved transcript, retrying submission...', {
        callId: savedTranscript.callId,
        utteranceCount: savedTranscript.transcript.length
      });
      
      // Clear error and show processing
      setAppErrorMessage(null);
      setUiState('processing');
      setIsProcessing(true);
      
      // Format transcript text
      const transcriptText = savedTranscript.transcriptText || 
        transcriptPersistence.formatTranscriptText(savedTranscript.transcript);
      
      // Retry submission with saved transcript
      await submitTranscriptWithRetry(
        savedTranscript.callId, 
        transcriptText, 
        savedTranscript.transcript
      );
    } else {
      // No saved transcript, start fresh interview
      logger.log('[Page] No saved transcript, starting new interview.');
      
      // Clear all state completely
      setAppErrorMessage(null);
      setAppCallId(null); 
      setAppJoinUrl(null);
      setCurrentTranscript([]);
      setUvClientStatus('disconnected');
      setShouldConnectUltravox(false); 
      setSummaryData(null);
      setAnalysisData(null);
      
      // Start fresh interview with new call creation
      setUiState('fetchingCallDetails');
      
      try {
        const details = await BackendService.getInstance().initiateIntake();
        if (details && details.callId && details.joinUrl) {
          logger.log('[Page] NEW Call details fetched for retry:', { 
            callId: details.callId, 
            joinUrlPreview: details.joinUrl.substring(0, 50) + '...',
            timestamp: new Date().toISOString(),
            action: 'RETRY_AFTER_ERROR'
          });
          setAppCallId(details.callId);
          setAppJoinUrl(details.joinUrl);
          setShouldConnectUltravox(true);
          setUiState('connecting'); 
        } else {
          throw new Error('Incomplete call details received from backend on retry.');
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error during retry call setup.';
        logger.error('[Page] Failed to initiate intake on retry:', errMsg, error);
        setAppErrorMessage(`Retry failed: ${errMsg}`);
        setUiState('error');
        setShouldConnectUltravox(false);
        setAppCallId(null);
        setAppJoinUrl(null);
      }
    }
  }, [setUiState, setAppErrorMessage, setCurrentTranscript, setAppCallId, setAppJoinUrl, submitTranscriptWithRetry]);

  const handleFullReset = useCallback(() => {
    logger.log('[Page] Full Reset button clicked.');
    resetState();
    setShouldConnectUltravox(false);
    setSummaryData(null);
    setAnalysisData(null);
    setIsProcessing(false);
  }, []);

  const handleManagerExperimentalMessage = useCallback((message: any) => {
    const config = getConfig();
    if (config.enableDebugLogging) {
      logger.debug('[Page] Manager Experimental Message:', message);
    }
  }, []);

  // Animation states
  const [isVisible, setIsVisible] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  

  useEffect(() => {
    setIsVisible(true);
    
    const handleScroll = () => {
      setHeaderScrolled(window.scrollY > 50);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Demo simulation functions
  const simulateIntakeDemo = useCallback(async () => {
    logger.log('[Demo] Simulating intake demo...');
    
    // Show loading state briefly
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Simulate demo completion with sample data
    setSummaryData({
      chiefComplaint: "Patient reports persistent headache for 3 days",
      symptoms: ["Headache", "Mild nausea", "Light sensitivity"],
      duration: "3 days",
      severity: "Moderate (6/10)"
    });
    
    setAnalysisData(
      "**Clinical Analysis Complete**\n\n" +
      "**Chief Complaint:** Patient reports persistent headache for 3 days\n\n" +
      "**Key Findings:** No red flags identified. Symptoms consistent with tension-type headache.\n\n" +
      "**Recommendations:** Consider standard analgesics and stress management techniques."
    );
  }, []);

  // Use the singleton-based Ultravox connection
  useUltravoxSingleton({
    joinUrl: appJoinUrl,
    callId: appCallId,
    shouldConnect: shouldConnectUltravox && !!(appJoinUrl && appCallId),
    onStatusChange: handleManagerStatusChange,
    onTranscriptUpdate: handleManagerTranscriptUpdate,
    onSessionEnd: handleManagerSessionEnd,
    onError: handleManagerError,
    onExperimentalMessage: handleManagerExperimentalMessage
  });


  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Fixed Header */}
        <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${headerScrolled ? 'py-3 shadow-md' : 'py-4 shadow-sm'} bg-white/98 backdrop-blur-sm`}>
        <div className="max-w-6xl mx-auto px-8 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer transition-transform hover:-translate-y-0.5">
            <div className="relative w-10 h-10 bg-gradient-to-br from-blue-400 to-teal-500 rounded-full flex items-center justify-center overflow-hidden shadow-lg">
              <span className="text-white font-bold text-sm relative z-10">AI</span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
            </div>
            <span className="text-xl font-bold text-gray-900">Med Intake</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-20 pb-8 px-8 max-w-6xl mx-auto">
        <div className={`transition-all duration-800 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-4">
            <span className="bg-gradient-to-r from-gray-900 via-teal-600 to-gray-900 bg-clip-text text-transparent animate-gradient">
              Intelligent, Faster Medical<br />Intake
            </span>
          </h1>
          
          <p className="text-xl text-gray-600 mb-8 max-w-2xl">
            Patient speaks to friendly AI agent. Intake summary provided instantly.<br />
            State of the art medical model provides insights to the provider.
          </p>

          {/* Compliance Tags */}
          <div className="flex gap-4 mb-8 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 rounded-full font-medium text-sm hover:-translate-y-1 transition-all duration-300 hover:shadow-lg cursor-default">
              <div className="w-4 h-4 bg-teal-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">✓</span>
              </div>
              HIPAA Compliant
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 rounded-full font-medium text-sm hover:-translate-y-1 transition-all duration-300 hover:shadow-lg cursor-default">
              <div className="w-4 h-4 bg-teal-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">✓</span>
              </div>
              Secure Encryption
            </div>
          </div>

          {/* Language Selection */}
          <div className="mb-8">
            <p className="text-sm text-gray-500 mb-2">Available in English</p>
            <div className="flex gap-3 flex-wrap">
              <button className="px-5 py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-all duration-300">
                English
              </button>
              <button className="px-5 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm font-medium hover:border-teal-500 hover:text-teal-600 transition-all duration-300 relative overflow-hidden group cursor-not-allowed">
                <span className="relative z-10">Spanish - Coming Soon</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-teal-50 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Multi-language support powered by our advanced AI technology</p>
          </div>
        </div>

        {/* Demo Interface */}
        <div className={`bg-gray-50 rounded-2xl overflow-hidden shadow-2xl transition-all duration-1000 delay-300 relative max-w-5xl mx-auto ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Animated top border */}
          <div className="h-1 bg-gradient-to-r from-teal-500 via-teal-600 to-teal-500 bg-size-200 animate-gradient-move"></div>
          
          {/* Demo Header */}
          <div className="bg-white px-8 py-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Live AI Medical Intake Demo</h3>
            <p className="text-sm text-gray-600">This is beta software. Do not use this as medical advice, it is for informational purposes only.</p>
            {(uiState !== 'idle' && uiState !== 'error' && uiState !== 'completed') && (
              <div className="mt-2 text-xs text-gray-500">
                Status: <span className="font-medium">{uiState}</span> | Connection: <span className="font-medium">{uvClientStatus}</span>
              </div>
            )}
          </div>

          {/* Three separate sections in a grid */}
          <div className="grid md:grid-cols-3 gap-6 p-6">
            {/* Box 1: Audio Interview Control */}
            <div className="bg-white p-6 rounded-lg border border-gray-100">
              <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-6 flex items-center gap-2">
                <div className="w-1 h-4 bg-teal-500 rounded-full"></div>
                Audio Interview
              </h4>
              
              <div className="text-center py-6">
                <div className="relative w-24 h-24 mx-auto mb-6">
                  {/* Ripple effect background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-50 to-teal-100/50 rounded-full animate-pulse-ring"></div>
                  
                  {/* Main avatar */}
                  <div className={`relative w-24 h-24 bg-gradient-to-br rounded-full flex items-center justify-center ${
                    uiState === 'completed' ? 'from-green-50 to-green-100' : 'from-teal-50 to-teal-100 animate-pulse-slow'
                  }`}>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg relative overflow-hidden ${
                      uiState === 'completed' ? 'bg-green-500' : 'bg-teal-500'
                    }`}>
                      {uiState === 'completed' ? (
                        <svg className="w-6 h-6 text-white relative z-10" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-white relative z-10" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 1a11 11 0 0 0-11 11v3c0 1.66 1.34 3 3 3h.5a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 4.5 9H4v-1a8 8 0 1 1 16 0v1h-.5A1.5 1.5 0 0 0 18 10.5v6a1.5 1.5 0 0 0 1.5 1.5H20a3 3 0 0 0 3-3v-3A11 11 0 0 0 12 1z"/>
                        </svg>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                    </div>
                  </div>
                </div>
                
                <p className="text-xs text-gray-600 mb-4">
                  {['fetchingCallDetails', 'connecting'].includes(uiState) ? 
                    (uiState === 'fetchingCallDetails' ? 'Getting details...' : 'Connecting...') :
                    uiState === 'processing' ? 'Processing transcript...' :
                    uiState === 'completed' ? 'Interview completed ✓' :
                    uiState === 'interviewing' ? 'Interview in progress...' :
                    'Ready to start'
                  }
                </p>
                
                <button 
                  onClick={uiState === 'idle' ? handleStartInterviewClick : undefined}
                  disabled={!['idle', 'error', 'callEnded', 'completed'].includes(uiState)}
                  className={`w-full px-4 py-2 text-sm rounded-lg font-medium transition-all duration-300 relative overflow-hidden group ${
                    !['idle', 'error', 'callEnded', 'completed'].includes(uiState) 
                      ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                      : 'bg-teal-500 text-white hover:bg-teal-600 hover:-translate-y-1 hover:shadow-lg'
                  }`}
                  data-testid="start-interview-button"
                >
                  <span className="relative z-10">
                    {uiState === 'interviewing' ? 'In Progress...' :
                     ['fetchingCallDetails', 'connecting'].includes(uiState) ? 'Initializing...' :
                     uiState === 'completed' ? 'Complete ✓' :
                     'Start Interview'}
                  </span>
                  {['idle', 'error', 'callEnded', 'completed'].includes(uiState) && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500"></div>
                  )}
                </button>
                
                {uiState === 'interviewing' && (
                  <button 
                    onClick={handleEndInterviewClick}
                    className="w-full mt-2 px-4 py-2 bg-red-500 text-white text-sm rounded-lg font-medium hover:bg-red-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                    data-testid="end-interview-button"
                  >
                    End Interview
                  </button>
                )}
              </div>
              
              {/* Live Transcript */}
              {(currentTranscript.length > 0 || uiState === 'interviewing') && (
                <div className="mt-4">
                  <h5 className="text-xs font-medium text-gray-700 mb-2">Live Transcript</h5>
                  <div className="h-32 bg-gray-50 rounded-lg p-3 overflow-y-auto border text-xs" data-testid="transcript-area">
                    {currentTranscript.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">Conversation will appear here...</p>
                    ) : (
                      currentTranscript.map((utt, i) => (
                        <div key={`${utt.speaker}-${utt.timestamp}-${i}`} className="mb-2 animate-fade-in">
                          <span className={`font-medium ${
                            utt.speaker === 'agent' ? 'text-teal-600' : 'text-blue-600'
                          }`}>
                            {utt.speaker === 'agent' ? 'AI' : 'Patient'}:
                          </span>
                          <span className="ml-1 text-gray-700">{utt.transcript}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Box 2: Intake Summary */}
            <div className="bg-white p-6 rounded-lg border border-gray-100 transition-all duration-500 hover:shadow-lg">
              <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-6 flex items-center gap-2">
                <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                Intake Summary
              </h4>
              
              <div className="bg-gray-50 rounded-lg p-4 min-h-[300px] max-h-[400px] relative overflow-y-auto">
                {isProcessing ? (
                  <div>
                    <FunLoadingAnimation variant="summary" />
                    {retryAttempt > 0 && (
                      <div className="mt-4 text-center">
                        <p className="text-xs text-gray-600">
                          Server is warming up... Retry {retryAttempt}/{maxRetryAttempts}
                        </p>
                        <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${(retryAttempt / maxRetryAttempts) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : summaryData ? (
                  <div className="space-y-3">
                    {Object.entries(summaryData).map(([key, value], index) => {
                      if (!value || (typeof value === 'string' && value.trim() === '')) return null;
                      const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                      return (
                        <div 
                          key={key} 
                          className="border-b border-gray-200 pb-3 last:border-0 last:pb-0 animate-fade-in"
                          style={{ animationDelay: `${index * 100}ms` }}
                        >
                          <h5 className="text-sm font-semibold text-blue-700 mb-1">{formattedKey}</h5>
                          <p className="text-sm text-gray-700">{Array.isArray(value) ? value.join(', ') : value}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center text-xs py-12 leading-relaxed">
                    Patient intake summary will appear here after the interview is completed.
                  </p>
                )}
              </div>
            </div>

            {/* Box 3: Clinical Analysis */}
            <div className="bg-white p-6 rounded-lg border border-gray-100 transition-all duration-500 hover:shadow-lg">
              <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-6 flex items-center gap-2">
                <div className="w-1 h-4 bg-purple-500 rounded-full"></div>
                Clinical Analysis
              </h4>
              
              <div className="bg-gray-50 rounded-lg p-4 min-h-[300px] max-h-[400px] relative overflow-y-auto">
                {isProcessing ? (
                  <div>
                    <FunLoadingAnimation variant="analysis" />
                    {retryAttempt > 0 && (
                      <div className="mt-4 text-center">
                        <p className="text-xs text-gray-600">
                          Server is warming up... Retry {retryAttempt}/{maxRetryAttempts}
                        </p>
                        <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${(retryAttempt / maxRetryAttempts) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : analysisData ? (
                  <div className="animate-fade-in">
                    <div className="bg-white p-4 rounded-lg border-l-4 border-purple-500">
                      <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {(() => {
                          const cleanedAnalysis = analysisData.replace(/<\/?answer>/gi, '').trim();
                          console.log('[Page] Rendering analysis:', {
                            originalLength: analysisData.length,
                            cleanedLength: cleanedAnalysis.length,
                            cleanedContent: cleanedAnalysis,
                            firstChar: cleanedAnalysis.charAt(0),
                            lastChar: cleanedAnalysis.charAt(cleanedAnalysis.length - 1)
                          });
                          return cleanedAnalysis;
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center text-xs py-12 leading-relaxed">
                    AI-generated clinical insights will appear here after the interview is completed.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 px-8 text-center">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">How It Works for Your Health System</h2>
          <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
            Streamline patient intake and enhance provider efficiency with AI-powered medical conversations
          </p>
          
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="bg-white rounded-xl p-8 shadow-lg hover:-translate-y-2 transition-all duration-300 group border-2 border-transparent hover:border-teal-500">
              <div className="w-12 h-12 bg-teal-50 text-teal-500 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6 group-hover:bg-teal-500 group-hover:text-white transition-all duration-300 group-hover:rotate-12">
                1
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Patient Initiates Intake</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Patient starts a conversation with our AI assistant to complete their medical intake. No forms, no typing—just conversation.
              </p>
            </div>
            
            <div className="bg-white rounded-xl p-8 shadow-lg hover:-translate-y-2 transition-all duration-300 group border-2 border-transparent hover:border-teal-500">
              <div className="w-12 h-12 bg-teal-50 text-teal-500 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6 group-hover:bg-teal-500 group-hover:text-white transition-all duration-300 group-hover:rotate-12">
                2
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">AI Processes & Analyzes</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Advanced medical AI extracts key information and generates clinical insights from the conversation.
              </p>
            </div>
            
            <div className="bg-white rounded-xl p-8 shadow-lg hover:-translate-y-2 transition-all duration-300 group border-2 border-transparent hover:border-teal-500">
              <div className="w-12 h-12 bg-teal-50 text-teal-500 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6 group-hover:bg-teal-500 group-hover:text-white transition-all duration-300 group-hover:rotate-12">
                3
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Provider Receives Insights</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Structured intake summaries and AI-generated clinical insights before the appointment begins.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Integration Section */}
      <section className="bg-gray-50 py-16 px-8">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Enterprise Integration Options</h2>
          <p className="text-xl text-gray-600 mb-12">
            Secure, scalable deployment options designed for healthcare enterprise environments
          </p>
          
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-white rounded-xl p-8 shadow-lg hover:-translate-y-1 transition-all duration-300 border-2 border-transparent hover:border-teal-500">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl flex items-center justify-center text-3xl mx-auto mb-6 hover:scale-110 hover:rotate-3 transition-all duration-300">
                🏥
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Private Cloud Deployment</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Deploy within your existing cloud infrastructure (AWS, Azure, GCP) with full data control and compliance.
              </p>
              <ul className="text-left text-sm text-gray-600 space-y-2">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
                  HIPAA compliant architecture
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
                  Data never leaves your environment
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
                  Custom security policies
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
                  Integration with existing EHR systems
                </li>
              </ul>
            </div>
            
            <div className="bg-white rounded-xl p-8 shadow-lg hover:-translate-y-1 transition-all duration-300 border-2 border-transparent hover:border-teal-500">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl flex items-center justify-center text-3xl mx-auto mb-6 hover:scale-110 hover:rotate-3 transition-all duration-300">
                🔌
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">API Integration</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Seamlessly integrate AI intake capabilities into your existing patient portal or workflow systems.
              </p>
              <ul className="text-left text-sm text-gray-600 space-y-2">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
                  RESTful API endpoints
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
                  Webhook notifications
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
                  Real-time processing
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
                  Custom branding options
                </li>
              </ul>
            </div>
          </div>
          
          <div className="text-center">
            <p className="text-gray-600 mb-6">Ready to explore implementation for your health system?</p>
            <a href="#" className="inline-flex items-center gap-2 px-8 py-3 bg-teal-500 text-white font-medium rounded-lg hover:bg-teal-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden group">
              <span className="relative z-10">Schedule Enterprise Demo</span>
              <span className="relative z-10">→</span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500"></div>
            </a>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="bg-white py-16 px-8 border-t border-gray-100">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">About BuildAI</h2>
          <p className="text-xl text-gray-600 leading-relaxed max-w-4xl mx-auto mb-12">
            We are an AI consulting team of technologists and healthcare leaders, dedicated to transforming healthcare delivery through intelligent automation.
          </p>
          
          <div className="grid md:grid-cols-2 gap-12 text-left">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Healthcare Expertise</h3>
              <p className="text-gray-600 leading-relaxed">
                Our team combines deep healthcare domain knowledge with cutting edge AI technology to solve real-world clinical challenges.
              </p>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Enterprise Focus</h3>
              <p className="text-gray-600 leading-relaxed">
                We specialize in building secure, scalable AI solutions that integrate seamlessly with existing healthcare infrastructure.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 py-16 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col items-center mb-8">
            <img 
              src="/BuildAI logo.png" 
              alt="BuildAI Logo" 
              className="w-24 h-24 object-contain mb-4"
            />
            <p className="text-gray-600 text-center max-w-md">Transforming healthcare through intelligent automation</p>
          </div>
          
          <div className="border-t border-gray-200 pt-8 mt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex gap-8 text-sm text-gray-600">
                <Link href="/" className="hover:text-teal-600 transition-colors">Home</Link>
                <Link href="/privacy" className="hover:text-teal-600 transition-colors">Privacy</Link>
                <Link href="/security" className="hover:text-teal-600 transition-colors">Security</Link>
                <a href="#" className="hover:text-teal-600 transition-colors">Contact</a>
              </div>
              
              <div className="text-sm text-gray-500 text-center md:text-right">
                <span className="block">BuildAI © 2025</span>
                <span className="block text-xs mt-1">Designed & Built by Jake Moroshek</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

        {/* Error Overlay */}
        {uiState === 'error' && appErrorMessage && (
          <ErrorOverlay 
            message={appErrorMessage} 
            onRetry={handleRetryFromError} 
            onReset={handleFullReset}
            hasTranscriptSaved={!!transcriptPersistence.getTranscript()}
          />
        )}
    </div>
  );
}
