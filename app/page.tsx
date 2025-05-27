"use client";

import { useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Mic, X, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/hooks/useAppState";
import { useAppLogger } from "@/hooks/useAppLogger";
import { useUltravoxSession } from "@/hooks/useUltravoxSession";
import { BackendService } from "@/lib/backend-service";
import { ErrorHandler } from "@/lib/error-handler";
import { TranscriptService } from "@/lib/transcript-service";
import { checkBrowserCompatibility, checkMicrophonePermissions } from "@/lib/browser-compat";
import { setupNetworkListeners } from "@/lib/network-utils";
import { UI_STATES } from "@/lib/config";
import DevTray from "@/components/DevTray";
import VoiceActivityIndicator from "@/components/VoiceActivityIndicator";

export type Utterance = {
  speaker: string;
  text: string;
};

export type SummaryData = {
  chiefComplaint: string | null;
  historyOfPresentIllness: string | null;
  associatedSymptoms: string | null;
  pastMedicalHistory: string | null;
  medications: string | null;
  allergies: string | null;
  notesOnInteraction: string | null;
  [key: string]: string | null | undefined;
};

const InterviewPulsingAnimation = () => (
  <div className="w-full h-full flex items-center justify-center">
    <div className="relative flex items-center justify-center">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="absolute w-32 h-32 bg-teal-400/30 rounded-full animate-pulse"
          style={{
            animationDelay: `${i * 0.3}s`,
            animationDuration: '2s',
            transform: `scale(${1 + i * 0.3})`,
            opacity: 0.7 - i * 0.15,
          }}
        />
      ))}
      <Mic size={48} className="text-teal-600 relative z-10" />
    </div>
  </div>
);

export default function MedicalIntakePage() {
  const {
    state,
    setUiState,
    setCallId,
    setInterviewActive,
    setUvStatus,
    setTranscript,
    setSummaryData,
    setAnalysisData,
    setOnline,
    setAudioPermission,
    setError,
    clearError,
    resetAll,
  } = useAppState();

  const {
    logClientEvent,
    logApiCall,
    logUltravoxEvent,
    logError,
    getClientEvents,
    getBackendComms,
    clearLogs,
  } = useAppLogger();

  const backendService = BackendService.getInstance();
  const errorHandler = ErrorHandler.getInstance();
  const transcriptService = TranscriptService.getInstance();
  const { toast } = useToast();

  const {
    initializeSession,
    endSession,
    getTranscripts,
  } = useUltravoxSession({
    onTranscriptUpdate: setTranscript,
    onStatusChange: setUvStatus,
    onSessionEnd: useCallback(() => {
      logClientEvent("Session ended - processing transcript");
      if (state.currentTranscript.length > 0) {
        handleSubmitTranscript();
      }
    }, [state.currentTranscript]),
    onError: (error: string) => {
      logError('UltravoxSession', error);
      setError(error);
    },
  });

  // Network setup
  useEffect(() => {
    setOnline(navigator.onLine);
    const cleanup = setupNetworkListeners(
      setOnline,
      () => logClientEvent('Network connection restored'),
      () => logClientEvent('Network connection lost')
    );
    return cleanup;
  }, [setOnline, logClientEvent]);

  const handleStartInterview = useCallback(async () => {
    // Reset state
    setSummaryData(null);
    setAnalysisData(null);
    setTranscript([]);
    clearError();

    // Check prerequisites
    if (!state.isOnline) {
      const error = "No internet connection. Please check your connection and try again.";
      setError(error);
      toast({ title: "No Internet Connection", description: error, variant: "destructive" });
      return;
    }

    const browserCheck = checkBrowserCompatibility();
    if (!browserCheck.compatible) {
      const error = "Your browser doesn't support all required features. Please try a modern browser.";
      logError('BrowserCompatibility', new Error(browserCheck.issues.join(', ')));
      setError(error);
      toast({ title: "Browser Compatibility Issue", description: error, variant: "destructive" });
      return;
    }

    try {
      // Request microphone permissions
      setUiState(UI_STATES.REQUESTING_PERMISSIONS);
      logClientEvent("Requesting microphone permissions");

      const micResult = await checkMicrophonePermissions();
      if (!micResult.granted) {
        const error = micResult.error || "Microphone access denied";
        setAudioPermission(false);
        setError(error);
        logError('MicrophonePermission', new Error(error));
        toast({ title: "Microphone Access Required", description: error, variant: "destructive" });
        return;
      }

      setAudioPermission(true);
      logClientEvent("Microphone permission granted");

      // Initiate intake
      setUiState(UI_STATES.INITIATING);
      logClientEvent("Starting interview initialization");

      const response = await backendService.initiateIntake();
      logApiCall('Backend', 'POST /api/v1/initiate-intake', 'success', 200);

      setCallId(response.callId);
      logClientEvent(`Call ID received: ${response.callId.substring(0, 8)}...`);

      // Initialize Ultravox session
      const success = await initializeSession(response.joinUrl);
      if (!success) {
        throw new Error("Failed to initialize interview session");
      }

      setInterviewActive(true);
      logClientEvent("Interview started successfully");

    } catch (error) {
      const appError = errorHandler.handle(error, { source: 'startInterview' });
      logError('StartInterview', appError);
      setError(appError.userMessage || appError.message);
      toast({
        title: "Interview Error",
        description: appError.userMessage || appError.message,
        variant: "destructive"
      });
    }
  }, [
    state.isOnline,
    setSummaryData,
    setAnalysisData,
    setTranscript,
    clearError,
    setError,
    setUiState,
    setAudioPermission,
    setCallId,
    setInterviewActive,
    toast,
    logClientEvent,
    logApiCall,
    logError,
    backendService,
    errorHandler,
    initializeSession,
  ]);

  const handleSubmitTranscript = useCallback(async () => {
    if (state.uiState === 'processing_transcript' || state.uiState === 'displaying_results') {
      logClientEvent("Already processing transcript");
      return;
    }

    logClientEvent("Starting transcript submission");
    setSummaryData(null);
    setAnalysisData(null);
    setUiState(UI_STATES.PROCESSING_TRANSCRIPT);

    // Validate and process transcript
    const processingResult = transcriptService.processTranscriptForSubmission(state.currentTranscript);
    
    if (!processingResult.isValid) {
      const error = processingResult.warnings.join('. ') || "Invalid transcript data";
      logError('TranscriptValidation', new Error(error));
      setError(error);
      toast({ title: "Invalid Transcript", description: error, variant: "destructive" });
      return;
    }

    if (!state.callId) {
      const error = "Missing call identifier";
      logError('SubmitTranscript', new Error(error));
      setError(error);
      toast({ title: "Missing Identifier", description: error, variant: "destructive" });
      return;
    }

    try {
      logClientEvent(`Submitting transcript (${processingResult.stats.totalLength} chars, ${processingResult.stats.totalUtterances} utterances)`);

      const response = await backendService.submitTranscript(
        state.callId,
        processingResult.cleanedTranscript
      );
      logApiCall('Backend', 'POST /api/v1/submit-transcript', 'success', 200);

      if (response.summary) {
        setSummaryData(response.summary);
      }
      if (response.analysis) {
        setAnalysisData(response.analysis);
      }

      toast({
        title: "Interview Complete",
        description: "Your medical intake interview has been processed successfully."
      });

      setTimeout(() => {
        setUiState(UI_STATES.DISPLAYING_RESULTS);
      }, 500);

    } catch (error) {
      const appError = errorHandler.handle(error, { source: 'submitTranscript' });
      logError('SubmitTranscript', appError);
      setError(appError.userMessage || appError.message);
      toast({
        title: "Processing Failed",
        description: appError.userMessage || appError.message,
        variant: "destructive"
      });
    }
  }, [
    state.uiState,
    state.currentTranscript,
    state.callId,
    setSummaryData,
    setAnalysisData,
    setUiState,
    setError,
    toast,
    logClientEvent,
    logApiCall,
    logError,
    backendService,
    errorHandler,
    transcriptService,
  ]);

  const handleEndInterview = useCallback(async () => {
    if (state.uiState === 'processing_transcript' || state.uiState === 'displaying_results') {
      logClientEvent("Already processing or displaying results");
      return;
    }

    logClientEvent("Ending interview");
    setInterviewActive(false);

    await endSession();

    // Check if we have transcripts from the session
    const sessionTranscripts = getTranscripts();
    if (sessionTranscripts.length > 0 && state.currentTranscript.length === 0) {
      logClientEvent("Using session transcripts as fallback");
      setTranscript(sessionTranscripts);
    }

    if (state.currentTranscript.length > 0 || sessionTranscripts.length > 0) {
      await handleSubmitTranscript();
    } else {
      logError('EndInterview', new Error("No transcript data found"));
      setError("No conversation data was recorded. Please try starting a new interview.");
      toast({
        title: "Interview Ended",
        description: "No conversation data was recorded."
      });
      setUiState('idle');
    }
  }, [
    state.uiState,
    state.currentTranscript,
    setInterviewActive,
    setTranscript,
    setError,
    setUiState,
    toast,
    logClientEvent,
    logError,
    endSession,
    getTranscripts,
    handleSubmitTranscript,
  ]);

  const resetAllAndStartNew = useCallback(() => {
    logClientEvent("Starting new interview");
    resetAll();
    clearLogs();
    setTimeout(() => handleStartInterview(), 100);
  }, [resetAll, clearLogs, handleStartInterview, logClientEvent]);

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
    logClientEvent("Manual debug triggered");
  }, [state, logClientEvent]);

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
          style={{ zIndex: 9999 }}
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
              <div className="relative h-[400px] rounded-lg overflow-hidden bg-gradient-to-br from-teal-50 to-blue-50 border border-teal-100 shadow-md flex flex-col">
                <div className="p-6 flex-1 flex flex-col items-center justify-center">
                  <div className="text-center space-y-4">
                    <p className="text-sm font-medium text-gray-600 mb-6">
                      {getStatusText()}
                    </p>

                    {state.uiState === 'idle' && (
                      <div className="space-y-6">
                        <button
                          onClick={handleStartInterview}
                          disabled={state.hasAudioPermission === false}
                          className="w-24 h-24 mx-auto bg-teal-500 rounded-full flex items-center justify-center hover:bg-teal-600 transition-colors cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          <Mic size={32} className="text-white" />
                        </button>
                        <Button
                          onClick={handleStartInterview}
                          size="lg"
                          className="bg-teal-500 hover:bg-teal-600"
                          disabled={state.hasAudioPermission === false}
                        >
                          Start Medical Intake
                        </Button>
                        {state.hasAudioPermission === false && (
                          <p className="text-red-500 text-sm mt-2">
                            Microphone access required to start interview
                          </p>
                        )}
                      </div>
                    )}

                    {state.uiState === 'requesting_permissions' && (
                      <div className="space-y-6">
                        <div className="w-24 h-24 mx-auto bg-orange-100 rounded-full flex items-center justify-center">
                          <Mic size={32} className="text-orange-500 animate-pulse" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-orange-600 font-medium">Requesting Microphone Access</p>
                          <p className="text-sm text-gray-500">Please allow microphone access when prompted</p>
                        </div>
                      </div>
                    )}

                    {state.uiState === 'initiating' && (
                      <div className="space-y-6">
                        <div className="w-24 h-24 mx-auto bg-teal-100 rounded-full flex items-center justify-center">
                          <Loader2 size={32} className="text-teal-500 animate-spin" />
                        </div>
                        <p className="text-gray-500">Connecting to AI assistant...</p>
                      </div>
                    )}

                    {state.uiState === 'interviewing' && (
                      <div className="space-y-6">
                        <InterviewPulsingAnimation />
                        <div className="space-y-2">
                          <p className="text-green-600 font-medium">Interview Active</p>
                          <p className="text-sm text-gray-500">Status: {state.uvStatus}</p>
                          <Button
                            onClick={handleEndInterview}
                            variant="destructive"
                            size="sm"
                          >
                            End Interview
                          </Button>
                        </div>
                      </div>
                    )}

                    {state.uiState === 'processing_transcript' && (
                      <div className="space-y-6">
                        <div className="w-24 h-24 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                          <Loader2 size={32} className="text-blue-500 animate-spin" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-blue-600 font-medium">Processing Interview</p>
                          <p className="text-sm text-gray-500">
                            Analyzing conversation and generating summary...
                          </p>
                        </div>
                      </div>
                    )}

                    {state.uiState === 'displaying_results' && (
                      <div className="space-y-6">
                        <div className="w-24 h-24 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                          <CheckCircle size={32} className="text-green-500" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-green-600 font-medium">Interview Complete</p>
                          <Button
                            onClick={resetAllAndStartNew}
                            variant="outline"
                            size="sm"
                          >
                            Start New Interview
                          </Button>
                        </div>
                      </div>
                    )}

                    {state.uiState === 'error' && (
                      <div className="space-y-6">
                        <div className="w-24 h-24 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                          <X size={32} className="text-red-500" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-red-600 font-medium">Error Occurred</p>
                          {state.errorMessage && (
                            <p className="text-sm text-red-500 px-4">{state.errorMessage}</p>
                          )}
                          <div className="space-y-2">
                            <Button
                              onClick={resetAll}
                              variant="outline"
                              size="sm"
                            >
                              Try Again
                            </Button>
                            {state.hasAudioPermission === false && (
                              <Button
                                onClick={async () => {
                                  const result = await checkMicrophonePermissions();
                                  setAudioPermission(result.granted);
                                  if (!result.granted && result.error) {
                                    setError(result.error);
                                  }
                                }}
                                variant="outline"
                                size="sm"
                              >
                                Request Microphone Access
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {state.currentTranscript.length > 0 && (
                      <div className="mt-6">
                        <p className="text-xs text-gray-500 mb-2">
                          Conversation: {state.currentTranscript.length} messages
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={`space-y-8 ${!(state.uiState === 'processing_transcript' || state.uiState === 'displaying_results') ? 'opacity-50' : ''}`}>
                <div className="bg-white rounded-lg border shadow-sm">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Medical Summary</h3>
                    {state.uiState === 'processing_transcript' ? (
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                      </div>
                    ) : state.summaryData ? (
                      <div className="space-y-4 text-sm">
                        {state.summaryData.chiefComplaint && (
                          <div>
                            <strong>Chief Complaint:</strong>
                            <p className="mt-1 text-gray-600">{state.summaryData.chiefComplaint}</p>
                          </div>
                        )}
                        {state.summaryData.historyOfPresentIllness && (
                          <div>
                            <strong>History of Present Illness:</strong>
                            <p className="mt-1 text-gray-600">{state.summaryData.historyOfPresentIllness}</p>
                          </div>
                        )}
                        {state.summaryData.associatedSymptoms && (
                          <div>
                            <strong>Associated Symptoms:</strong>
                            <p className="mt-1 text-gray-600">{formatSummaryField(state.summaryData.associatedSymptoms)}</p>
                          </div>
                        )}
                        {state.summaryData.pastMedicalHistory && (
                          <div>
                            <strong>Past Medical History:</strong>
                            <p className="mt-1 text-gray-600">{formatSummaryField(state.summaryData.pastMedicalHistory)}</p>
                          </div>
                        )}
                        {state.summaryData.medications && (
                          <div>
                            <strong>Medications:</strong>
                            <p className="mt-1 text-gray-600">{formatSummaryField(state.summaryData.medications)}</p>
                          </div>
                        )}
                        {state.summaryData.allergies && (
                          <div>
                            <strong>Allergies:</strong>
                            <p className="mt-1 text-gray-600">{formatSummaryField(state.summaryData.allergies)}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">
                        Summary will appear here after the interview is completed.
                      </p>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-lg border shadow-sm">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Clinical Analysis</h3>
                    {state.uiState === 'processing_transcript' ? (
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-4/5" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/5" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
                      </div>
                    ) : state.analysisData ? (
                      <div className="text-sm text-gray-600">
                        {state.analysisData.split('\n').map((paragraph, index) => (
                          <p key={index} className="mb-2">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">
                        Clinical insights will appear here after the interview is completed.
                      </p>
                    )}
                  </div>
                </div>
              </div>
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
