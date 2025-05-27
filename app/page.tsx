"use client";

import React, { useEffect, useCallback, useState } from "react"; // Added useState
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
import { useUltravoxSession } from "@/hooks/useUltravoxSession";
import { useInterviewManager } from "@/hooks/useInterviewManager"; // Import the new hook
import { BackendService } from "@/lib/backend-service";
import { ErrorHandler } from "@/lib/error-handler";
import { TranscriptService } from "@/lib/transcript-service";
import { checkBrowserCompatibility, checkMicrophonePermissions } from "@/lib/browser-compat";
import { setupNetworkListeners } from "@/utils/network-utils";
import { UI_STATES } from "@/lib/config";
import { Utterance, SummaryData } from "@/lib/types"; // Import types
import DevTray from "@/components/DevTray";
import VoiceActivityIndicator from "@/components/VoiceActivityIndicator";

// Utterance and SummaryData types moved to lib/types.ts
// InterviewPulsingAnimation component moved to IntakeControlUI.tsx

import IntakeControlUI from "@/components/page/medical-intake/IntakeControlUI";
import ResultsDisplay from "@/components/page/medical-intake/ResultsDisplay";

export default function MedicalIntakePage() {
  const appStateHook = useAppState(); // Get the full return value
  const { state, ...appStateSetters } = appStateHook; // Destructure state and setters

  const logger = useAppLogger(); // useAppLogger returns the logger object directly

  const backendService = BackendService.getInstance();
  const errorHandler = ErrorHandler.getInstance();
  const transcriptService = TranscriptService.getInstance();
  const { toast } = useToast();

  // State to signal processing after session ends for reasons other than explicit "End Interview" button.
  const [processTranscriptAfterSession, setProcessTranscriptAfterSession] = useState(false);

  const ultravoxSessionHook = useUltravoxSession({
    onTranscriptUpdate: appStateSetters.setTranscript,
    onStatusChange: appStateSetters.setUvStatus,
    onSessionEnd: useCallback(() => {
      logger.logClientEvent("Session ended via onSessionEnd callback (e.g. external disconnect)");
      if (state.currentTranscript.length > 0) {
        setProcessTranscriptAfterSession(true); // Signal to process transcript
      } else {
        logger.logError('onSessionEnd', new Error("No transcript data found after session ended."));
        appStateSetters.setError("No conversation data was recorded.");
        toast({ title: "Session Ended", description: "No conversation data." });
        appStateSetters.setUiState('idle');
      }
    }, [logger, state.currentTranscript, appStateSetters.setTranscript, appStateSetters.setUiState, appStateSetters.setError, toast]),
    onError: (error: Error) => {
      logger.logError('UltravoxSession', error.message, error);
      appStateSetters.setError(error.message);
    },
  });

  const {
    handleStartInterview,
    handleSubmitTranscript,
    handleEndInterview,
    resetAllAndStartNew
  } = useInterviewManager({
    appState: state, // Pass the state object
    // Pass all setters from useAppState
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
    
    logger, // Pass the logger object
    backendService,
    errorHandler,
    transcriptService,
    toast,
    ultravoxSession: ultravoxSessionHook, // Pass the full ultravoxSessionHook object
  });
  
  useEffect(() => {
    if (processTranscriptAfterSession) {
      logger.logClientEvent("Processing transcript due to processTranscriptAfterSession flag");
      handleSubmitTranscript(); // This now refers to the stable function from useInterviewManager
      setProcessTranscriptAfterSession(false); // Reset flag
    }
  }, [processTranscriptAfterSession, handleSubmitTranscript, logger]);

  // Network setup
  useEffect(() => {
    // navigator.onLine is available in "use client"
    appStateSetters.setOnline(navigator.onLine); 
    const cleanup = setupNetworkListeners(
      appStateSetters.setOnline,
      () => logger.logClientEvent('Network connection restored'),
      () => logger.logClientEvent('Network connection lost')
    );
    return cleanup;
  }, [appStateSetters.setOnline, logger]); // Updated dependencies

  const handleDebugClick = useCallback(() => {
    console.log("=== DEBUG STATE ===", {
      uiState: state.uiState,
      uvStatus: state.uvStatus,
      isInterviewActive: state.isInterviewActive,
      hasAudioPermission: state.hasAudioPermission,
      transcriptLength: state.currentTranscript.length,
      callId: state.callId,
      isOnline: state.isOnline,
      errorMessage: state.errorMessage
    });
    appLogger.logClientEvent("Manual debug triggered"); // Use appLogger instance
  }, [state, appLogger.logClientEvent]); // Use appLogger.logClientEvent in deps

  const formatSummaryField = (value: string | null | undefined) => {
    return value?.trim() || "Not reported";
  };

  const getStatusText = () => {
    const statusMap = {
      'idle': "Ready to start your medical intake interview",
      'requesting_permissions': "Requesting microphone permissions...",
      'initiating': "Connecting to AI assistant...",
      'interviewing': "Interview in progress - speak clearly",
      'processing_transcript': "Processing your interview...",
      'displaying_results': "Interview complete - review your summary",
      'error': state.errorMessage || "Error occurred - please try again"
    };
    return statusMap[state.uiState] || "Loading...";
  };

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
        micStatus={state.uvSession ? 'active' : 'inactive'}
        utteranceCount={state.currentTranscript.length}
        lastUtteranceSource={state.currentTranscript.length > 0 ? state.currentTranscript[state.currentTranscript.length - 1].speaker : null}
        submittedDataLength={state.currentTranscript.length > 0 ? state.currentTranscript.map(u => u.text).join('').length : null}
        backendCommsLog={getBackendComms()}
        outputSet1Received={!!state.summaryData}
        outputSet1FieldCount={state.summaryData ? Object.keys(state.summaryData).filter(k => state.summaryData && state.summaryData[k] !== null).length : null}
        outputSet2Received={!!state.analysisData}
        outputSet2ApproxLength={state.analysisData ? state.analysisData.length : null}
        clientEventsLog={getClientEvents().map(e => `${e.timestamp}: ${e.message}`)}
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
                resetAll={appStateSetters.resetAll} // Pass the resetAll from appStateSetters
                checkMicrophonePermissions={checkMicrophonePermissions} // Pass the imported function
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
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold">How It Works for Your Health System</h2>
              <p className="text-gray-500 mt-2 max-w-2xl mx-auto">
                Streamline patient intake and enhance provider efficiency with AI-powered medical conversations
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-teal-600 font-semibold">1</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">Patient Initiates Intake</h3>
                <p className="text-gray-500">
                  Patients speak naturally with our AI assistant to complete their medical intake. No forms, no typing—just conversation.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-teal-600 font-semibold">2</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">AI Processes & Analyzes</h3>
                <p className="text-gray-500">
                  Advanced medical AI extracts key information and generates clinical insights from the conversation.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-teal-600 font-semibold">3</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">Provider Receives Insights</h3>
                <p className="text-gray-500">
                  Your providers get structured intake summaries and AI-generated clinical insights before the appointment begins.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold">Enterprise Integration Options</h2>
              <p className="text-gray-500 mt-2 max-w-2xl mx-auto">
                Secure, scalable deployment options designed for healthcare enterprise environments
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
                <div className="flex items-center mb-4">
                  <Shield className="h-6 w-6 text-blue-600 mr-3" />
                  <h3 className="text-xl font-semibold text-blue-900">Private Cloud Deployment</h3>
                </div>
                <p className="text-blue-700 mb-4">
                  Deploy within your existing cloud infrastructure (AWS, Azure, GCP) with full data control and compliance.
                </p>
                <ul className="text-sm text-blue-600 space-y-1">
                  <li>• HIPAA-compliant architecture</li>
                  <li>• Data never leaves your environment</li>
                  <li>• Custom security policies</li>
                  <li>• Integration with existing EHR systems</li>
                </ul>
              </div>
              <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
                <div className="flex items-center mb-4">
                  <Lock className="h-6 w-6 text-green-600 mr-3" />
                  <h3 className="text-xl font-semibold text-green-900">API Integration</h3>
                </div>
                <p className="text-green-700 mb-4">
                  Seamlessly integrate AI intake capabilities into your existing patient portal or workflow systems.
                </p>
                <ul className="text-sm text-green-600 space-y-1">
                  <li>• RESTful API endpoints</li>
                  <li>• Webhook notifications</li>
                  <li>• Real-time processing</li>
                  <li>• Custom branding options</li>
                </ul>
              </div>
            </div>
            <div className="text-center mt-8">
              <p className="text-gray-600 mb-4">
                Ready to explore implementation for your health system?
              </p>
              <Button className="bg-teal-500 hover:bg-teal-600 text-white px-8 py-3">
                Schedule Enterprise Demo
              </Button>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 py-16">
          <div className="container mx-auto px-4 md:px-6">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-6">About BuildAI</h2>
              <p className="text-xl text-gray-600 mb-8">
                We are an AI consulting team of technologists and healthcare leaders, dedicated to transforming healthcare delivery through intelligent automation.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-teal-700">Healthcare Expertise</h3>
                  <p className="text-gray-600">
                    Our team combines deep healthcare domain knowledge with cutting-edge AI technology to solve real-world clinical challenges.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-teal-700">Enterprise Focus</h3>
                  <p className="text-gray-600">
                    We specialize in building secure, scalable AI solutions that integrate seamlessly with existing healthcare infrastructure.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-gray-100 py-8">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center">
                <span className="text-white font-semibold text-xs">AI</span>
              </div>
              <span className="font-semibold">MedIntake</span>
            </div>
            <div className="text-sm text-gray-500">Jake Moroshek | BuildAI © 2025</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
