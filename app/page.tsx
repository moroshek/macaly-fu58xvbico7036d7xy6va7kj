"use client";

import React, { useEffect, useCallback, useState, useRef } from "react"; // Added useRef
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
import { useAppState } from "@/hooks/useAppState"; // Assuming this is the correct path
import { useAppLogger } from "@/hooks/useAppLogger";
import { useUltravoxSession } from "@/hooks/useUltravoxSession";
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

export default function Page() { // Renamed to Page as per your correction
  const isMountedRef = useRef(false); // To track initial mount for some effects

  // --- START: RENDER LOG ---
  // Log current state from useAppState directly if possible, or parts of it.
  // This log will show values *before* this render's effects might change them.
  const currentAppStateForRenderLog = useAppState.getState ? useAppState.getState() : null; // Example for Zustand
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

  const ultravoxSessionHook = useUltravoxSession({
    onTranscriptUpdate: appStateSetters.setTranscript,
    onStatusChange: (status) => { // Wrapped to log
      console.log('[Page onStatusChange prop] CALLED by useUltravoxSession. New status:', status);
      appStateSetters.setUvStatus(status);
    },
    onSessionEnd: useCallback(() => {
      console.log('[Page onSessionEnd prop] CALLED by useUltravoxSession.');
      logger.logClientEvent("Session ended via onSessionEnd callback (e.g. external disconnect)");
      // Accessing state.currentTranscript here might be stale if onSessionEnd is memoized with old state
      // It's often better to get fresh state if needed, or ensure useAppState provides stable selectors
      const currentTranscriptSnapshot = useAppState.getState ? useAppState.getState().currentTranscript : state.currentTranscript; // Get fresh state
      if (currentTranscriptSnapshot.length > 0) {
        console.log('[Page onSessionEnd prop] Transcript found, setting processTranscriptAfterSession to true.');
        setProcessTranscriptAfterSession(true);
      } else {
        console.log('[Page onSessionEnd prop] No transcript data found.');
        logger.logError('onSessionEnd', new Error("No transcript data found after session ended."));
        appStateSetters.setError("No conversation data was recorded.");
        toast({ title: "Session Ended", description: "No conversation data." });
        appStateSetters.setUiState('idle');
      }
    }, [logger, appStateSetters, toast]), // Removed state.currentTranscript from here, get fresh inside
    onError: useCallback((error: Error) => { // Ensure onError is stable if passed to ultravoxSessionHook
      console.error('[Page onError prop] CALLED by useUltravoxSession:', error);
      logger.logError('UltravoxSession', error.message, error);
      appStateSetters.setError(error.message);
      // Potentially set UI state to error here too
      // appStateSetters.setUiState('error');
    }, [logger, appStateSetters]), // Added appStateSetters for stability
  });

  const {
    handleStartInterview,
    handleSubmitTranscript,
    handleEndInterview,
    resetAllAndStartNew
  } = useInterviewManager({
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
    ultravoxSession: ultravoxSessionHook,
  });

  // --- START: LOGGING FOR useEffect - ProcessTranscript ---
  useEffect(() => {
    const depsValues = { processTranscriptAfterSession, handleSubmitTranscript_exists: !!handleSubmitTranscript, logger_exists: !!logger };
    console.log('[Page useEffect - ProcessTranscript] FIRED/DEPS CHANGED. Dependencies (values/existence):', depsValues);
    if (processTranscriptAfterSession) {
      logger.logClientEvent("Processing transcript due to processTranscriptAfterSession flag");
      handleSubmitTranscript();
      setProcessTranscriptAfterSession(false);
    }
    return () => {
      const cleanupState = useAppState.getState ? useAppState.getState() : null;
      console.log('[Page useEffect - ProcessTranscript] CLEANUP. Current App State (approx):', cleanupState ? { uiState: cleanupState.uiState, processTranscriptAfterSession } : "N/A");
      console.trace(); // CRITICAL TRACE
    };
  }, [processTranscriptAfterSession, handleSubmitTranscript, logger]);
  // --- END: LOGGING FOR useEffect - ProcessTranscript ---

  // --- START: LOGGING FOR useEffect - NetworkSetup ---
  useEffect(() => {
    const depsValues = { setOnline_exists: !!appStateSetters.setOnline, logger_exists: !!logger };
    console.log('[Page useEffect - NetworkSetup] FIRED/DEPS CHANGED. Dependencies (values/existence):', depsValues);
    
    // Initial check
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
        appStateSetters.setOnline(navigator.onLine);
    } else {
        // Default to true or handle server-side rendering case if applicable
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
      console.trace(); // CRITICAL TRACE
      if (typeof cleanupListeners === 'function') {
        cleanupListeners();
      }
    };
  }, [appStateSetters.setOnline, logger]);
  // --- END: LOGGING FOR useEffect - NetworkSetup ---

  const handleDebugClick = useCallback(() => {
    const currentState = useAppState.getState ? useAppState.getState() : state; // Get fresh or current state
    console.log("=== DEBUG STATE ===", {
      uiState: currentState.uiState,
      uvStatus: currentState.uvStatus,
      isInterviewActive: currentState.isInterviewActive,
      hasAudioPermission: currentState.hasAudioPermission,
      transcriptLength: currentState.currentTranscript.length,
      callId: currentState.callId,
      isOnline: currentState.isOnline,
      errorMessage: currentState.errorMessage,
      ultravoxSessionObject: ultravoxSessionHook.session // Log the session object from the hook
    });
    logger.logClientEvent("Manual debug triggered");
  }, [logger, ultravoxSessionHook.session, state]); // Added state as ultravoxSessionHook.session might not cover all state parts if not using zustand getState

  const formatSummaryField = (value: string | null | undefined) => {
    return value?.trim() || "Not reported";
  };

  const getStatusText = () => {
    const currentState = useAppState.getState ? useAppState.getState() : state; // Get fresh or current state
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
    
    // Example: Log browser compatibility and initial mic permission check
    const browserCheck = checkBrowserCompatibility();
    if (!browserCheck.compatible) {
        logger.logClientEvent(`Browser compatibility issues on mount: ${browserCheck.issues.join(', ')}`);
    }
    checkMicrophonePermissions().then(micResult => { // Assuming this returns a promise
        logger.logClientEvent(`Initial mic permission on mount: ${micResult.granted ? 'granted' : 'not granted/denied/prompt'}`);
        appStateSetters.setAudioPermission(micResult.granted);
    });


    return () => {
      isMountedRef.current = false;
      console.log(`[Page LIFECYCLE] Component Will UNMOUNT. Final App State uiState: ${useAppState.getState ? useAppState.getState().uiState : state.uiState}`);
      console.trace(); // CRITICAL TRACE FOR PAGE UNMOUNT
    };
  }, [appStateSetters, logger]); // Added appStateSetters and logger; if these are stable, effect runs once.
                                // If appStateSetters is an object that changes, this will re-run.
                                // Consider if checkMicrophonePermissions should be here or triggered by user action.
  // --- END: LOGGING FOR PAGE LIFECYCLE (MOUNT/UNMOUNT) ---


  // --- START: LOGGING FOR UI STATE CHANGES (Example) ---
  // This specific effect watches for uiState changes to demonstrate logging.
  // Adapt or remove if you have more specific effects reacting to uiState.
  useEffect(() => {
    if (isMountedRef.current) { // Don't log for initial mount if already handled by mount effect
        console.log(`[Page useEffect - UIStateChange] FIRED/DEPS CHANGED. New uiState: ${state.uiState}. Previous might be different.`);
    }
    return () => {
      // No complex cleanup needed here usually, but good for tracing if this effect causes issues.
      // Only add trace if you suspect this effect's re-run/cleanup is problematic.
      // console.log(`[Page useEffect - UIStateChange] CLEANUP. Current uiState: ${state.uiState}`);
      // console.trace(); 
    };
  }, [state.uiState]);
  // --- END: LOGGING FOR UI STATE CHANGES ---

  return (
    <div className="flex flex-col min-h-screen">
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
        micStatus={ultravoxSessionHook.session ? (ultravoxSessionHook.isMicMuted() ? 'muted' : 'active') : 'inactive'}
        utteranceCount={state.currentTranscript.length}
        lastUtteranceSource={state.currentTranscript.length > 0 ? state.currentTranscript[state.currentTranscript.length - 1].speaker : null}
        submittedDataLength={state.currentTranscript.length > 0 ? state.currentTranscript.map(u => u.text).join('').length : null}
        backendCommsLog={logger.getBackendComms()}
        outputSet1Received={!!state.summaryData}
        outputSet1FieldCount={state.summaryData ? Object.keys(state.summaryData).filter(k => state.summaryData && state.summaryData[k as keyof SummaryData] !== null).length : null} // Added type assertion
        outputSet2Received={!!state.analysisData}
        outputSet2ApproxLength={state.analysisData ? state.analysisData.length : null}
        clientEventsLog={logger.getClientEvents().map(e => `${new Date(e.timestamp).toLocaleTimeString()}: ${e.message}`)} // Using toLocaleTimeString for readability
      />

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
                handleStartInterview={handleStartInterview}
                handleEndInterview={handleEndInterview}
                resetAllAndStartNew={resetAllAndStartNew}
                resetAll={appStateSetters.resetAll}
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
    </div>
  );
}
