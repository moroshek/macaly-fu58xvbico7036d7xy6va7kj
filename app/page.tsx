"use client";

import React, { useEffect, useCallback, useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Mic, X, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CALL_ID_DISPLAY_LENGTH,
  DISPLAY_RESULTS_DELAY_MS,
  START_INTERVIEW_DELAY_MS,
  Z_INDEX_DEBUG_BUTTON,
  PULSING_ANIMATION_CONFIG
} from "@/lib/config";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/hooks/useAppState";
import { useAppLogger } from "@/hooks/useAppLogger";
// import { useUltravoxSession } from '@/hooks/useUltravoxSession'; // Removed
import { useInterviewManager } from "@/hooks/useInterviewManager";
import { BackendService } from "@/lib/backend-service";
import { ErrorHandler } from "@/lib/error-handler";
import { TranscriptService } from "@/lib/transcript-service";
import { checkBrowserCompatibility, checkMicrophonePermissions } from "@/lib/browser-compat";
import { setupNetworkListeners } from "@/utils/network-utils";
import { UI_STATES } from "@/lib/config";
import { Utterance, SummaryData } from "@/lib/types";
import DevTray from "@/components/DevTray";
import VoiceActivityIndicator from "@/components/VoiceActivityIndicator";

import IntakeControlUI from "@/components/page/medical-intake/IntakeControlUI";
import ResultsDisplay from "@/components/page/medical-intake/ResultsDisplay";

import dynamic from 'next/dynamic';
import type { UltravoxManagerProps } from '@/components/UltravoxSessionManager';
// Ensure Utterance type is available if not already e.g. from import { Utterance } from "@/lib/types";

const UltravoxSessionLoader = dynamic<UltravoxManagerProps>(
  () => import('@/components/UltravoxSessionManager'),
  {
    ssr: false,
    loading: () => <p style={{ textAlign: 'center', padding: '20px' }}>Loading Audio Session Manager...</p>,
  }
);

// RemountDebugger Component Definition
// 'use client'; // This is already at the top of the file
// import { useEffect, useRef } from 'react'; // Imports are already at the top of the file

interface RemountDebuggerProps {
  children: React.ReactNode;
  errorState?: string; // Pass current error state for better tracking
  uiState?: string;    // Pass current UI state for correlation
}

const RemountDebugger = ({ children, errorState, uiState }: RemountDebuggerProps) => {
  const mountCountRef = useRef(0);
  const mountTimeRef = useRef<number[]>([]);
  const componentNameRef = useRef('Page');

  useEffect(() => {
    mountCountRef.current += 1;
    const currentTime = Date.now();
    mountTimeRef.current.push(currentTime);

    console.log(`🔍 ${componentNameRef.current} REMOUNT DEBUGGER - Mount #${mountCountRef.current}`);
    console.log('📊 Mount History:', mountTimeRef.current.map(time => new Date(time).toLocaleTimeString()));
    console.log('🎯 Current States:', { errorState, uiState });

    // Check for previous unmount timing (implementing the other AI's suggestion)
    if (typeof window !== 'undefined') {
      const lastUnmountTime = sessionStorage.getItem('last-page-unmount');
      if (lastUnmountTime) {
        const timeSinceUnmount = currentTime - parseInt(lastUnmountTime);
        console.log(`⏱️ Time since last unmount: ${timeSinceUnmount}ms`);

        if (timeSinceUnmount < 1000) {
          console.error(`🚨 VERY RAPID MOUNT after unmount! Only ${timeSinceUnmount}ms gap`);
        }
      }
    }

    // Check for rapid remounts
    if (mountTimeRef.current.length > 1) {
      const lastMount = mountTimeRef.current[mountTimeRef.current.length - 2];
      const timeDiff = currentTime - lastMount;

      if (timeDiff < 2000) {
        console.error(`⚠️ RAPID REMOUNT DETECTED! Only ${timeDiff}ms since last mount`);
        console.error('🔍 Component remount stack trace:');
        console.trace();

        // Enhanced diagnosis based on current state
        console.error('🔍 Mount Context Analysis:');
        console.error(`  • Error State: ${errorState || 'none'}`);
        console.error(`  • UI State: ${uiState || 'unknown'}`);
        console.error('🔍 Potential remount causes to investigate:');
        console.error('  1. Parent component conditional rendering');
        console.error('  2. Route/navigation changes');
        console.error('  3. Error boundary triggers');
        console.error('  4. State management causing key changes');
        console.error('  5. Next.js error boundaries (app/error.tsx)');
        console.error('  6. useAppState causing parent re-renders');
      }
    }

    // Enhanced error-related remount detection
    if (typeof window !== 'undefined') {
      const errorInUrl = window.location.href.includes('error');
      const errorInStorage = localStorage.getItem('app-error') || sessionStorage.getItem('app-error');

      if (errorInUrl || errorInStorage || errorState) {
        console.warn('🚨 Error-related state detected during mount:', {
          errorInUrl,
          errorInStorage: !!errorInStorage,
          errorStateProp: errorState,
          uiStateProp: uiState,
          currentUrl: window.location.href
        });
      }

      // Check if this mount happened after an error state change
      const lastErrorStateChange = sessionStorage.getItem('last-error-state-change');
      if (lastErrorStateChange) {
        const timeSinceError = currentTime - parseInt(lastErrorStateChange);
        if (timeSinceError < 1000) {
          console.error(`🚨 MOUNT AFTER ERROR STATE CHANGE! Only ${timeSinceError}ms since error state changed`);
        }
      }

      // Track this mount in relation to error states
      if (errorState === 'error' || uiState === 'error') {
        sessionStorage.setItem('last-error-state-change', currentTime.toString());
        console.warn('📍 Recording error state change timestamp for correlation');
      }
    }

    // Keep only last 10 mount times to prevent memory growth
    if (mountTimeRef.current.length > 10) {
      mountTimeRef.current = mountTimeRef.current.slice(-10);
    }

    return () => {
      console.log(`🔍 ${componentNameRef.current} REMOUNT DEBUGGER - Unmount #${mountCountRef.current}`);
      console.log('🎯 States at unmount:', { errorState, uiState });
      console.log('🔍 Unmount stack trace:');
      console.trace();

      // Record unmount time for analysis (implementing the other AI's suggestion)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('last-page-unmount', currentTime.toString());
        console.log('📍 Recorded unmount timestamp for next mount correlation');
      }
    };
  }, []); // Empty deps - only runs on mount/unmount

  return <>{children}</>;
};

// Error Overlay Component
const ErrorOverlay: React.FC<{
  errorMessage: string;
  onRetry: () => void;
  onReset: () => void;
}> = ({ errorMessage, onRetry, onReset }) => {
  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      }}
    >
      <div 
        style={{
          background: '#1f2937',
          padding: '40px',
          borderRadius: '12px',
          textAlign: 'center',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <X size={48} style={{ color: '#ef4444', margin: '0 auto 16px' }} />
        </div>
        
        <h2 style={{ 
          fontSize: '1.5rem', 
          fontWeight: 'bold', 
          marginBottom: '16px',
          color: '#f9fafb'
        }}>
          An Error Occurred
        </h2>
        
        <p style={{ 
          marginBottom: '24px', 
          color: '#d1d5db',
          lineHeight: '1.5'
        }}>
          {errorMessage || 'Failed to connect or process the interview.'}
        </p>
        
        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={onRetry}
            style={{
              padding: '12px 24px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '14px'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#2563eb'}
            onMouseOut={(e) => e.currentTarget.style.background = '#3b82f6'}
          >
            Try Again
          </button>
          
          <button
            onClick={onReset}
            style={{
              padding: '12px 24px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '14px'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#4b5563'}
            onMouseOut={(e) => e.currentTarget.style.background = '#6b7280'}
          >
            Start Over
          </button>
        </div>
        
        <p style={{ 
          marginTop: '20px', 
          fontSize: '12px', 
          color: '#9ca3af' 
        }}>
          If this problem persists, please refresh the page or try a different browser.
        </p>
      </div>
    </div>
  );
};

export default function Page() {
  const isMountedRef = useRef(false);

  // --- START: RENDER LOG ---
  const currentAppStateForRenderLog = useAppState.getState ? useAppState.getState() : null;
  console.log(
    '[Page RENDER] Component rendering. App State (at start of render):', 
    currentAppStateForRenderLog ? { 
      uiState: currentAppStateForRenderLog.uiState,
      uvStatus: currentAppStateForRenderLog.uvStatus,
      isInterviewActive: currentAppStateForRenderLog.isInterviewActive,
      hasAudioPermission: currentAppStateForRenderLog.hasAudioPermission,
      isOnline: currentAppStateForRenderLog.isOnline,
      errorMessage: currentAppStateForRenderLog.errorMessage,
      callId: currentAppStateForRenderLog.callId,
    } : "useAppState.getState not available for logging full state here"
  );
  // --- END: RENDER LOG ---

  const appStateHook = useAppState();
  const { state, ...appStateSetters } = appStateHook;

  const logger = useAppLogger();

  const backendService = BackendService.getInstance();
  const errorHandler = ErrorHandler.getInstance();
  const transcriptService = TranscriptService.getInstance();
  const { toast } = useToast();

  const [processTranscriptAfterSession, setProcessTranscriptAfterSession] = useState(false);
  const [activeJoinUrl, setActiveJoinUrl] = useState<string | null>(null);

  // const ultravoxSessionHook = useUltravoxSession({ ... }); // Removed

  const interviewManager = useInterviewManager({ // Renamed to avoid conflict with destructured handleStartInterview
    appState: state,
    setUiState: appStateSetters.setUiState,
    setCallId: appStateSetters.setCallId,
    setInterviewActive: appStateSetters.setInterviewActive,
    setTranscript: appStateSetters.setTranscript,
    setSummaryData: appStateSetters.setSummaryData,
    setAnalysisData: appStateSetters.setAnalysisData,
    setAudioPermission: appStateSetters.setAudioPermission,
    setError: appStateSetters.setError,
    clearError: appStateSetters.clearError,
    resetAll: appStateSetters.resetAll,
    logger,
    backendService,
    errorHandler,
    transcriptService,
    toast,
    ultravoxSession: null as any, // TEMPORARY CHANGE
  });

  // --- START: LOGGING FOR useEffect - ProcessTranscript ---
  useEffect(() => {
    const depsValues = { processTranscriptAfterSession, handleSubmitTranscript_exists: !!interviewManager.handleSubmitTranscript, logger_exists: !!logger };
    console.log('[Page useEffect - ProcessTranscript] FIRED/DEPS CHANGED. Dependencies (values/existence):', depsValues);
    if (processTranscriptAfterSession) {
      logger.logClientEvent("Processing transcript due to processTranscriptAfterSession flag");
      interviewManager.handleSubmitTranscript();
      setProcessTranscriptAfterSession(false);
    }
    return () => {
      const cleanupState = useAppState.getState ? useAppState.getState() : null;
      console.log('[Page useEffect - ProcessTranscript] CLEANUP. Current App State (approx):', cleanupState ? { uiState: cleanupState.uiState, processTranscriptAfterSession } : "N/A");
      console.trace();
    };
  }, [processTranscriptAfterSession, interviewManager.handleSubmitTranscript, logger]);
  // --- END: LOGGING FOR useEffect - ProcessTranscript ---

  // --- START: LOGGING FOR useEffect - NetworkSetup ---
  useEffect(() => {
    const depsValues = { setOnline_exists: !!appStateSetters.setOnline, logger_exists: !!logger };
    console.log('[Page useEffect - NetworkSetup] FIRED/DEPS CHANGED. Dependencies (values/existence):', depsValues);
    
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
        appStateSetters.setOnline(navigator.onLine);
    } else {
        appStateSetters.setOnline(true); 
    }

    const cleanupListeners = setupNetworkListeners(
      appStateSetters.setOnline,
      () => logger.logClientEvent('Network connection restored'),
      () => logger.logClientEvent('Network connection lost')
    );
    return () => {
      const cleanupState = useAppState.getState ? useAppState.getState() : null;
      console.log('[Page useEffect - NetworkSetup] CLEANUP. Current App State (approx):', cleanupState ? { isOnline: cleanupState.isOnline } : "N/A");
      console.trace();
      if (typeof cleanupListeners === 'function') {
        cleanupListeners();
      }
    };
  }, [appStateSetters.setOnline, logger]);
  // --- END: LOGGING FOR useEffect - NetworkSetup ---

  const handleDebugClick = useCallback(() => {
    const currentState = useAppState.getState ? useAppState.getState() : state;
    console.log("=== DEBUG STATE ===", {
      uiState: currentState.uiState,
      uvStatus: currentState.uvStatus,
      isInterviewActive: currentState.isInterviewActive,
      hasAudioPermission: currentState.hasAudioPermission,
      transcriptLength: currentState.currentTranscript.length,
      callId: currentState.callId,
      isOnline: currentState.isOnline,
      errorMessage: currentState.errorMessage,
      ultravoxSessionObject: null // TEMPORARY CHANGE
    });
    logger.logClientEvent("Manual debug triggered");
  }, [logger, state]); // Removed ultravoxSessionHook.session from dependencies

  const formatSummaryField = (value: string | null | undefined) => {
    return value?.trim() || "Not reported";
  };

  const getStatusText = () => {
    const currentState = useAppState.getState ? useAppState.getState() : state;
    const statusMap = {
      'idle': "Ready to start your medical intake interview",
      'requesting_permissions': "Requesting microphone permissions...",
      'initiating': "Connecting to AI assistant...",
      'interviewing': "Interview in progress - speak clearly",
      'processing_transcript': "Processing your interview...",
      'displaying_results': "Interview complete - review your summary",
      'error': currentState.errorMessage || "Error occurred - please try again"
    };
    return statusMap[currentState.uiState] || "Loading...";
  };

  // --- START: LOGGING FOR PAGE LIFECYCLE (MOUNT/UNMOUNT) ---
  useEffect(() => {
    isMountedRef.current = true;
    console.log(`[Page LIFECYCLE] Component Did MOUNT. Initial App State uiState: ${useAppState.getState ? useAppState.getState().uiState : state.uiState}`);
    
    const browserCheck = checkBrowserCompatibility();
    if (!browserCheck.compatible) {
        logger.logClientEvent(`Browser compatibility issues on mount: ${browserCheck.issues.join(', ')}`);
    }
    checkMicrophonePermissions().then(micResult => {
        logger.logClientEvent(`Initial mic permission on mount: ${micResult.granted ? 'granted' : 'not granted/denied/prompt'}`);
        appStateSetters.setAudioPermission(micResult.granted);
    });

    return () => {
      isMountedRef.current = false;
      console.log(`[Page LIFECYCLE] Component Will UNMOUNT. Final App State uiState: ${useAppState.getState ? useAppState.getState().uiState : state.uiState}`);
      console.trace();
    };
  }, [appStateSetters, logger]);
  // --- END: LOGGING FOR PAGE LIFECYCLE (MOUNT/UNMOUNT) ---

  // --- START: LOGGING FOR UI STATE CHANGES ---
  useEffect(() => {
    if (isMountedRef.current) {
        console.log(`[Page useEffect - UIStateChange] FIRED/DEPS CHANGED. New uiState: ${state.uiState}. Previous might be different.`);
    }
    return () => {
      // No cleanup needed for simple logging
    };
  }, [state.uiState]);
  // --- END: LOGGING FOR UI STATE CHANGES ---

  // Error overlay handlers
  const handleErrorRetry = useCallback(() => {
    console.log('[Page Error Overlay] Retry clicked.');
    appStateSetters.clearError();
    appStateSetters.setUiState('idle');
    setActiveJoinUrl(null); // Ensure manager is removed on retry from error
  }, [appStateSetters]);

  const handleErrorReset = useCallback(() => {
    console.log('[Page Error Overlay] Start Over clicked.');
    interviewManager.resetAllAndStartNew(); // Use the one from interviewManager
    setActiveJoinUrl(null); // Ensure manager is removed
  }, [interviewManager, appStateSetters]); // Added appStateSetters if resetAllAndStartNew doesn't cover UI

  // Page-level handlers that interact with UltravoxSessionManager lifecycle
  const pageLevelHandleStartInterview = async () => {
    appStateSetters.clearError();
    appStateSetters.setUiState('requesting_permissions'); // Or 'initiating' based on actual flow
    // Assuming interviewManager.handleStartInterview is updated to return { joinUrl, callId } or similar
    const joinInfo = await interviewManager.handleStartInterview(); 
    if (joinInfo && joinInfo.joinUrl) {
      console.log('[Page] joinUrl received, setting activeJoinUrl:', joinInfo.joinUrl);
      // callId should be set in appState by handleStartInterview from useInterviewManager
      setActiveJoinUrl(joinInfo.joinUrl);
      // uiState will be further managed by UltravoxSessionManager's onStatusChange -> appStateSetters.setUvStatus -> which influences uiState via useAppState logic
    } else {
      console.error('[Page] Failed to get joinUrl from handleStartInterview.');
      // Error should ideally be set by useInterviewManager.handleStartInterview if it fails
      if (!state.errorMessage) { // Check if error is already set
         appStateSetters.setError('Failed to initiate interview session. No join URL was provided.');
      }
      appStateSetters.setUiState('error'); // Ensure UI reflects error state
    }
  };

  const pageLevelHandleEndInterview = async () => {
    console.log('[Page] pageLevelHandleEndInterview called.');
    // useInterviewManager's handleEndInterview might still do transcript submission
    await interviewManager.handleEndInterview(); 
    setActiveJoinUrl(null); // This will unmount UltravoxSessionManager, triggering its endSession
    // UI state should be managed by onSessionEnd from manager or transcript processing logic
  };

  const pageLevelResetAllAndStartNew = () => {
    console.log('[Page] pageLevelResetAllAndStartNew called.');
    interviewManager.resetAllAndStartNew(); 
    setActiveJoinUrl(null); // Ensure manager is gone
  };

  return (
    <RemountDebugger
      errorState={state.errorMessage ? 'error' : undefined}
      uiState={state.uiState}
    >
      <div className="relative flex flex-col min-h-screen">
        {process.env.NODE_ENV === 'development' && (
          <button
            onClick={handleDebugClick}
            className="fixed top-4 right-4 bg-red-500 text-white p-2 rounded z-50 text-xs font-mono"
            style={{ zIndex: Z_INDEX_DEBUG_BUTTON }}
          >
            Debug State
          </button>
        )}

        <header className="container mx-auto py-4 px-4 md:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
                <span className="text-white font-semibold">AI</span>
              </div>
              <span className="font-semibold text-lg">MedIntake</span>
            </div>
            {(state.uiState === 'interviewing' || state.uiState === 'initiating' || !state.isOnline) && (
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  !state.isOnline ? 'bg-red-500 animate-pulse' :
                  state.uiState === 'initiating' ? 'bg-orange-400 animate-pulse' :
                  'bg-green-500'
                }`} />
                <span className="text-sm text-gray-500">
                  {!state.isOnline ? 'Connection Lost' :
                    state.uiState === 'initiating' ? 'Connecting...' :
                    'Connected'}
                </span>
              </div>
            )}
          </div>
        </header>

        <VoiceActivityIndicator
          uvStatus={state.uvStatus}
          isInterviewActive={state.isInterviewActive}
        />

        <DevTray
          appPhase={state.uiState}
          sessionStatus={state.uvStatus}
          sessionId={state.callId}
          isSessionActive={state.isInterviewActive}
          micStatus={'unknown'} // TEMPORARY CHANGE
          utteranceCount={state.currentTranscript.length}
          lastUtteranceSource={state.currentTranscript.length > 0 ? state.currentTranscript[state.currentTranscript.length - 1].speaker : null}
          submittedDataLength={state.currentTranscript.length > 0 ? state.currentTranscript.map(u => u.text).join('').length : null}
          backendCommsLog={logger.getBackendComms()}
          outputSet1Received={!!state.summaryData}
          outputSet1FieldCount={state.summaryData ? Object.keys(state.summaryData).filter(k => state.summaryData && state.summaryData[k as keyof SummaryData] !== null).length : null}
          outputSet2Received={!!state.analysisData}
          outputSet2ApproxLength={state.analysisData ? state.analysisData.length : null}
          clientEventsLog={logger.getClientEvents().map(e => `${new Date(e.timestamp).toLocaleTimeString()}: ${e.message}`)}
        />

        {activeJoinUrl && (
          <UltravoxSessionLoader
            key={activeJoinUrl} 
            joinUrl={activeJoinUrl}
            callId={state.callId || undefined} // Pass callId from app state
            onTranscriptUpdate={appStateSetters.setTranscript}
            onStatusChange={(status) => {
              console.log('[Page] UltravoxSessionManager onStatusChange:', status);
              appStateSetters.setUvStatus(status);
            }}
            onSessionEnd={() => {
              console.log('[Page] UltravoxSessionManager onSessionEnd.');
              logger.logClientEvent("Session ended via UltravoxSessionManager");
              const currentTranscriptSnapshot = useAppState.getState ? useAppState.getState().currentTranscript : state.currentTranscript;
              if (currentTranscriptSnapshot.length > 0) {
                setProcessTranscriptAfterSession(true); 
              } else {
                logger.logError('onSessionEnd (from Manager)', new Error("No transcript data after session ended."));
                appStateSetters.setError("No conversation data was recorded.");
                toast({ title: "Session Ended", description: "No conversation data." });
                appStateSetters.setUiState('idle');
              }
              setActiveJoinUrl(null); 
            }}
            onError={(error: Error) => {
              console.error('[Page] UltravoxSessionManager onError:', error);
              logger.logError('UltravoxSessionManager', error.message, error);
              appStateSetters.setError(error.message); 
              setActiveJoinUrl(null); 
            }}
          />
        )}

        <main className="flex-1">
          <section className="container mx-auto py-12 md:py-24 px-4 md:px-6">
            <div className="grid grid-cols-1 gap-12">
              <div className="space-y-6 max-w-2xl mx-auto text-center md:text-left md:mx-0">
                <div className="space-y-2">
                  <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                    Intelligent, Faster Medical Intake
                  </h1>
                  <p className="text-xl text-gray-500">
                    Patient speaks to friendly AI agent. Intake summary provided instantly.
                    State of the art medical model provides insights to the provider.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                  <Badge variant="outline" className="flex items-center gap-1 py-1.5 px-2.5 bg-white">
                    <Shield className="h-3.5 w-3.5 text-teal-500" />
                    <span>HIPAA Compliant</span>
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1 py-1.5 px-2.5 bg-white">
                    <Lock className="h-3.5 w-3.5 text-teal-500" />
                    <span>Secure Encryption</span>
                  </Badge>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-blue-900">Available in English</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
                    <span className="text-sm text-blue-700">Spanish - Coming Soon</span>
                  </div>
                  <p className="text-xs text-blue-600">
                    Multi-language support powered by our advanced AI technology
                  </p>
                </div>
                <p className="text-sm text-gray-500">
                  This is beta software. Do not use this as medical advice. It is for informational purposes only.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  U.S. Provisional Patent Application (No. 63/811,932) - Patent Pending
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <IntakeControlUI
                  uiState={state.uiState}
                  uvStatus={state.uvStatus}
                  hasAudioPermission={state.hasAudioPermission}
                  errorMessage={state.errorMessage}
                  currentTranscriptLength={state.currentTranscript.length}
                  getStatusText={getStatusText}
                  handleStartInterview={pageLevelHandleStartInterview}
                  handleEndInterview={pageLevelHandleEndInterview}
                  resetAllAndStartNew={pageLevelResetAllAndStartNew}
                  resetAll={appStateSetters.resetAll} // This can remain if it only resets state
                  checkMicrophonePermissions={checkMicrophonePermissions}
                  setAudioPermission={appStateSetters.setAudioPermission}
                  setError={appStateSetters.setError}
                />
                <ResultsDisplay
                  uiState={state.uiState}
                  summaryData={state.summaryData}
                  analysisData={state.analysisData}
                  formatSummaryField={formatSummaryField}
                />
              </div>
            </div>
          </section>

          <section className="bg-gray-50 py-16">
            <div className="container mx-auto px-4 md:px-6">
              {/* ... How It Works section ... */}
            </div>
          </section>

          <section className="py-16">
            <div className="container mx-auto px-4 md:px-6">
              {/* ... Enterprise Integration Options section ... */}
            </div>
          </section>

          <section className="bg-gray-50 py-16">
            <div className="container mx-auto px-4 md:px-6">
              {/* ... About BuildAI section ... */}
            </div>
          </section>
        </main>

        <footer className="bg-gray-100 py-8">
          <div className="container mx-auto px-4 md:px-6">
            {/* ... footer section ... */}
          </div>
        </footer>

        {/* ERROR OVERLAY - This prevents the Page component from unmounting */}
        {state.uiState === 'error' && (
          <ErrorOverlay
            errorMessage={state.errorMessage}
            onRetry={handleErrorRetry}
            onReset={handleErrorReset}
          />
        )}
      </div>
    </RemountDebugger>
  );
}
