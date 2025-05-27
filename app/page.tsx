"use client";

import { useRef, useEffect, useCallback } from "react"; // Removed useState
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Mic, X, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/hooks/useAppState"; // Import useAppState
import { useAppLogger } from "@/hooks/useAppLogger"; // Import useAppLogger
// axios is no longer directly used
import { UltravoxSession } from 'ultravox-client';
import { BackendService, InitiateIntakeResponse, SubmitTranscriptResponse } from "@/lib/backend-service"; // Import BackendService
import { AppError } from "@/lib/error-handler"; // Import AppError
import DevTray from "@/components/DevTray";
import VoiceActivityIndicator from "@/components/VoiceActivityIndicator";

// Import utility modules
import { debugUltravoxState, testWebSocketConnection, debugAudioState } from "@/lib/ultravox-debug";
import { testNetworkConnectivity, checkApiConnectivity, setupNetworkListeners } from "@/lib/network-utils";
import { checkBrowserCompatibility, checkMicrophonePermissions } from "@/lib/browser-compat";
import { getConfig, API_ENDPOINTS, UI_STATES, UIState } from "@/lib/config";

// Apply global configuration
const config = getConfig();
// axios.defaults.timeout = config.ultravoxTimeoutMs; // Commented out as BackendService manages its own timeouts and direct axios usage is removed.

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

// Use centralized configuration
const API_BASE_URL = config.apiBaseUrl;

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
    dispatch,
    setUiState,
    setSession,
    setCallId,
    setInterviewActive,
    setUvStatus,
    // addTranscriptItem, // We'll use setTranscript for now as per existing logic
    setTranscript,
    setSummaryData,
    setAnalysisData,
    setOnline,
    setAudioPermission,
    setError,
    clearError,
    resetInterview,
    resetAll: resetAllState, // Renamed to avoid conflict with local resetAll function
  } = useAppState();

  const { 
    logClientEvent, 
    logApiCall, 
    logUltravoxEvent, 
    logError, 
    getClientEvents, 
    getBackendComms,
    clearLogs 
  } = useAppLogger();

  const backendService = BackendService.getInstance(); // Get BackendService instance

  const { toast } = useToast();
  const pendingRequestsRef = useRef<number>(0);

  // Network setup
  useEffect(() => {
    setOnline(navigator.onLine);
    const cleanup = setupNetworkListeners(
      (online) => setOnline(online),
      async () => {
        try {
          logClientEvent('Network connection restored');
          // checkApiConnectivity might use BackendService.checkHealth() in the future
          const result = await checkApiConnectivity(API_BASE_URL); 
          if (result.success) {
            setOnline(true);
            logApiCall('Backend', 'GET /health', 'success', result.status);
          }
        } catch (error) {
          console.warn('API connectivity test failed:', error);
          logError('NetworkSetup-Restored', error); 
          logApiCall('Backend', 'GET /health', 'failed');
        }
      },
      () => logClientEvent('Network connection lost')
    );

    if (navigator.onLine) {
      // checkApiConnectivity might use BackendService.checkHealth() in the future
      checkApiConnectivity(API_BASE_URL) 
        .then(result => {
          if (result.success) setOnline(true);
          logApiCall('Backend', 'GET /health', result.success ? 'success' : 'failed', result.status);
        })
        .catch(error => {
          console.warn('Initial API connectivity test failed:', error);
          logError('NetworkSetup-Initial', error); 
          logApiCall('Backend', 'GET /health', 'failed');
        });
    }

    return cleanup;
  }, [setOnline, logClientEvent, logApiCall, logError]); 

  // Simplified session initialization
  // useCallback for initUltravoxSession
  const initUltravoxSession = useCallback(async (joinUrl: string) => {
    try {
      logUltravoxEvent("Starting Ultravox initialization"); // Use logUltravoxEvent

      if (typeof UltravoxSession !== 'function') {
        logError('InitUltravox', new Error("UltravoxSession is not available"));
        throw new Error("UltravoxSession is not available - check import");
      }

      try {
        const wsTestResult = await testWebSocketConnection(joinUrl);
        if (!wsTestResult) {
          logUltravoxEvent("WebSocket connectivity test failed");
        }
      } catch (wsError) {
        console.warn("WebSocket test failed but continuing:", wsError);
        logError('InitUltravox-WSTest', wsError);
      }

      logUltravoxEvent("Initializing Ultravox session");

      const session = new UltravoxSession({
        experimentalMessages: true as any
      });

      // Enhanced transcript handler
      const handleTranscriptEvent = (event: any) => { 
        try {
          console.log("📝 Transcript event received:", event);

          if (session.transcripts && Array.isArray(session.transcripts)) {
            const newTranscripts = session.transcripts.filter((transcript: any) => {
              return transcript &&
                typeof transcript.text === 'string' &&
                transcript.text.trim() !== '' &&
                transcript.isFinal !== false;
            });

            // Check against the latest state via dispatch's functional update or by re-accessing state if possible
            // For simplicity here, we assume `state.currentTranscript` is reasonably up-to-date
            // or this handler is memoized with `state.currentTranscript.length` if it were outside.
            // However, since `setTranscript` comes from `useAppState`, it's already stable.
            if (newTranscripts.length > state.currentTranscript.length) {
              logUltravoxEvent(`Found ${newTranscripts.length - state.currentTranscript.length} new transcripts`);
              setTranscript(newTranscripts.map((transcript: any) => ({ 
                speaker: transcript.speaker === 'user' ? 'user' : 'agent',
                text: transcript.text.trim()
              })));
            }
          }
        } catch (err) {
          logError('HandleTranscriptEvent', err);
        }
      };

      const handleErrorEvent = (event: any) => { 
        const errorObj = event?.error || event;
        logError('UltravoxSessionError', errorObj);
        setError(errorObj?.message || "There was a problem with the interview connection."); 
      };

      session.addEventListener('transcripts', handleTranscriptEvent);
      session.addEventListener('error', handleErrorEvent);

      logUltravoxEvent("Joining Ultravox call...");
      await session.joinCall(joinUrl);
      logUltravoxEvent("Successfully joined Ultravox call");

      setSession(session); 
      setUiState('interviewing'); 
      setInterviewActive(true); 

      try {
        if (typeof session.unmuteMic === 'function') {
          session.unmuteMic();
          logUltravoxEvent("Microphone unmuted");
        }
      } catch (micError) {
        logError('UnmuteMic', micError);
      }

      return true;
    } catch (error: any) {
      logError('InitUltravox-OuterCatch', error);
      setError(error?.message || "Could not connect to the interview service. Please try again."); 
      toast({
        title: "Connection Error",
        description: error?.message || "Could not connect to the interview service. Please try again.",
        variant: "destructive"
      });
      return false;
    }
  }, [state.currentTranscript.length, setError, setSession, setUiState, setInterviewActive, setTranscript, toast, logUltravoxEvent, logError]);

  const handleStartInterview = useCallback(async () => {
    setSummaryData(null); 
    setAnalysisData(null); 
    setTranscript([]); 
    clearError(); 

    if (!state.isOnline) { 
      setError("No internet connection. Please check your connection and try again.");
      toast({
        title: "No Internet Connection",
        description: "Please check your connection and try again.",
        variant: "destructive"
      });
      return;
    }

    try {
      const browserCompatibility = checkBrowserCompatibility();
      if (!browserCompatibility.compatible) {
          logError('BrowserCompatibility', new Error(`Browser compatibility issues: ${browserCompatibility.issues.join(', ')}`));
        setError("Your browser doesn't support all required features. Please try a modern browser like Chrome, Edge, or Safari.");
        toast({
          title: "Browser Compatibility Issue",
          description: "Your browser doesn't support all required features. Please try a modern browser.",
          variant: "destructive"
        });
        return;
      }
    } catch (error) {
      console.warn("Browser compatibility check failed:", error);
      logError('BrowserCompatibilityCheck', error);
    }

    try {
      logClientEvent("Testing network connectivity to required services");
      const networkOk = await testNetworkConnectivity();
      if (!networkOk) {
        setError("Cannot reach required services. Please check your internet connection or try again later.");
        toast({
          title: "Network Connectivity Issue",
          description: "Cannot reach required services. Please check your connection or try again later.",
          variant: "destructive"
        });
        return;
      }
    } catch (error) {
      console.warn("Network connectivity test failed:", error);
      logError('NetworkConnectivityTest', error);
    }

    try {
      setUiState(UI_STATES.REQUESTING_PERMISSIONS);
      logClientEvent("Requesting microphone permissions");

      const result = await checkMicrophonePermissions();

      let hasPermission = false;
      let errorMsg = "Microphone access denied";

      if (typeof result === 'boolean') {
        hasPermission = result;
      } else if (result && typeof result === 'object') {
        hasPermission = Boolean(result.granted);
        if (result.error) {
          errorMsg = result.error;
        }
      }

      if (hasPermission) {
        setAudioPermission(true);
        logClientEvent("Microphone permission granted");
      } else {
        setAudioPermission(false);
        setError(errorMsg); 
        logError('MicrophonePermission', new Error(errorMsg));
        toast({
          title: "Microphone Access Required",
          description: errorMsg,
          variant: "destructive"
        });
        return;
      }

      setUiState(UI_STATES.INITIATING);
      logClientEvent("Starting interview initialization");

      pendingRequestsRef.current++;

      try {
        logClientEvent("Calling initiate-intake API with BackendService");
        const response: InitiateIntakeResponse = await backendService.initiateIntake();
        // logApiCall is handled by BackendService interceptor for success/failure at transport layer
        // App-level logging of success should be based on business logic if needed

        const { joinUrl, callId: newCallId } = response;
        // Validation of joinUrl and newCallId is done within BackendService

        setCallId(newCallId); 
        logClientEvent(`Call ID received: ${newCallId.substring(0, 8)}...`);

        const success = await initUltravoxSession(joinUrl);
        if (!success) {
          // Error already logged by initUltravoxSession
          throw new Error("Failed to initialize interview session.");
        }

        logClientEvent("Interview started successfully");
      } catch (error) { // This will catch AppError from BackendService or other errors
        const appError = error instanceof AppError ? error : new AppError( (error as Error).message || "Unknown error during start interview", "START_INTERVIEW_CATCH_ALL", "unknown");
        logError('HandleStartInterview-ApiCatch', appError);
        
        setError(appError.userMessage || appError.message); 
        toast({
          title: "Interview Error",
          description: appError.userMessage || appError.message,
          variant: "destructive"
        });
      } finally {
        pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
      }

    } catch (error: any) { // Catch errors from permission checks etc.
      const appError = error instanceof AppError ? error : new AppError( (error as Error).message || "Unknown error during start interview outer", "START_INTERVIEW_OUTER_CATCH_ALL", "unknown");
      logError('HandleStartInterview-OuterCatch', appError);
      setError(appError.userMessage || "Failed to start interview. Please try again."); 
      toast({
        title: "Interview Error",
        description: appError.userMessage || "Failed to start interview. Please try again.",
        variant: "destructive"
      });
    }
  }, [
    state.isOnline, initUltravoxSession, clearError, setSummaryData, setAnalysisData, setTranscript, 
    setError, setUiState, setAudioPermission, setCallId, toast, logClientEvent, logError, backendService // Added backendService
  ]);

  const assembleAndSubmitTranscript = useCallback(async () => {
    if (state.uiState === 'processing_transcript' || state.uiState === 'displaying_results') {
      logClientEvent("Already processing transcript, ignoring duplicate call to assembleAndSubmitTranscript");
      return;
    }

    logClientEvent("Starting transcript submission");

    setSummaryData(null); 
    setAnalysisData(null); 
    setUiState(UI_STATES.PROCESSING_TRANSCRIPT); 

    const validTranscript = state.currentTranscript.filter(utterance => { 
      return utterance &&
        typeof utterance.speaker === 'string' &&
        typeof utterance.text === 'string' &&
        utterance.text.trim().length > 0 &&
        (utterance.speaker === 'user' || utterance.speaker === 'agent');
    });

    if (validTranscript.length === 0) {
      logError('SubmitTranscript', new Error("No valid transcript data to submit"));
      setError("No conversation data was recorded."); 
      toast({
        title: "Missing Data",
        description: "No conversation data was recorded.",
        variant: "destructive"
      });
      return;
    }

    if (!state.callId || state.callId.trim().length === 0) { 
      logError('SubmitTranscript', new Error("Missing or invalid call ID"));
      setError("Missing call identifier."); 
      toast({
        title: "Missing Identifier",
        description: "Missing call identifier.",
        variant: "destructive"
      });
      return;
    }

    try {
      const fullTranscript = validTranscript.map(utterance => {
        const speakerLabel = utterance.speaker === 'agent' ? 'Agent' : 'User';
        return `${speakerLabel}: ${utterance.text.trim()}`;
      }).join('\n');

      if (fullTranscript.length < 10) {
        logError('SubmitTranscript', new Error("Transcript too short"));
        setError("Conversation too short to process. Please have a longer conversation."); 
        toast({
          title: "Insufficient Data",
          description: "Conversation too short to process. Please have a longer conversation.",
          variant: "destructive"
        });
        return;
      }

      logClientEvent(`Submitting transcript (${fullTranscript.length} chars, ${validTranscript.length} utterances)`);
      logClientEvent(`Transcript preview: ${fullTranscript.substring(0, 200)}...`);

      pendingRequestsRef.current++;
      
      logClientEvent("Calling submit-transcript API with BackendService");
      const response: SubmitTranscriptResponse = await backendService.submitTranscript(state.callId, fullTranscript);
      // logApiCall for success/failure is handled by BackendService interceptor

      // Validation and normalization of summary is now done within BackendService
      const { summary, analysis } = response;

      const validatedSummary = summary; // Already validated by BackendService
      const validatedAnalysis = analysis && typeof analysis === 'string' && analysis.trim().length > 0
        ? analysis.trim()
        : null;


      logClientEvent("Setting processed summary and analysis data");
      logClientEvent(`Summary fields present: ${validatedSummary ? Object.keys(validatedSummary).filter(k => validatedSummary && validatedSummary[k] !== null).length : 0}`);
      logClientEvent(`Analysis length: ${validatedAnalysis ? validatedAnalysis.length : 0} chars`);

      if (validatedSummary) {
        setSummaryData(validatedSummary); 
      }
      if (validatedAnalysis) {
        setAnalysisData(validatedAnalysis); 
      }

      toast({
        title: "Interview Complete",
        description: "Your medical intake interview has been processed successfully."
      });

      setTimeout(() => {
        logClientEvent("Transitioning to results display");
        setUiState(UI_STATES.DISPLAYING_RESULTS); 
      }, 500);

    } catch (error) { // This will catch AppError from BackendService or other errors
      const appError = error instanceof AppError ? error : new AppError( (error as Error).message || "Unknown error during submit transcript", "SUBMIT_TRANSCRIPT_CATCH_ALL", "unknown");
      logError('SubmitTranscript-Catch', appError); 

      let errorMessageText = appError.userMessage || appError.message;
      let shouldShowFallback = false;

      // Check if the error category or a specific code indicates a server error where fallback might be useful
      if (appError.category === 'api' && appError.code === 'SERVER_ERROR') {
          shouldShowFallback = true;
      }
      // Add more specific conditions if BackendService provides more granular error codes for timeouts, etc.
      if (appError.message.includes('timeout')) { // Example for timeout
        errorMessageText = "Processing timed out. The server may be overloaded. Please try again.";
      }


      if (shouldShowFallback && validTranscript.length > 0) {
        logClientEvent("Showing fallback data due to server error");

        const fallbackSummary: SummaryData = {
          chiefComplaint: "Processing Error - Please Retry",
          historyOfPresentIllness: "There was a technical issue processing your interview. The conversation was recorded but could not be fully analyzed.",
          associatedSymptoms: null,
          pastMedicalHistory: null,
          medications: null,
          allergies: null,
          notesOnInteraction: `Processing failed at ${new Date().toISOString()}. Error: ${errorMessageText}` 
        };

        setSummaryData(fallbackSummary); 
        setAnalysisData("Technical processing error occurred. Please retry the interview for complete analysis."); 

        setTimeout(() => {
          setUiState(UI_STATES.DISPLAYING_RESULTS); 
          toast({
            title: "Partial Results Available",
            description: "Processing failed but your conversation was recorded. Please try again for full analysis.",
            variant: "destructive"
          });
        }, 500);
      } else {
        setError(errorMessageText); 
        toast({
          title: "Processing Failed",
          description: errorMessageText, 
          variant: "destructive"
        });
      }

    } finally {
      pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
    }
  }, [
    state.uiState, state.currentTranscript, state.callId, 
    setSummaryData, setAnalysisData, setUiState, setError, toast, logClientEvent, logError, backendService // Added backendService
  ]);

  const handleEndInterview = useCallback(async () => {
    if (state.uiState === 'processing_transcript' || state.uiState === 'displaying_results') {
      logClientEvent("Already processing or displaying results, ignoring duplicate call to handleEndInterview");
      return;
    }

    logClientEvent("Ending interview and preparing transcript for Cloud Run backend");
    setInterviewActive(false); 

    try {
      if (state.uvSession && typeof state.uvSession.leaveCall === 'function') {
        logUltravoxEvent("Calling uvSession.leaveCall()");
        await state.uvSession.leaveCall();
        logUltravoxEvent("Successfully left Ultravox call");
      }
    } catch (error) {
      logError('LeaveCall', error);
    }

    await new Promise(resolve => setTimeout(resolve, 1000)); 

    logClientEvent(`Current transcript length: ${state.currentTranscript.length}`);
    if (state.currentTranscript.length > 0) {
      logClientEvent("Transcript preview:");
      state.currentTranscript.slice(0, 3).forEach((item, index) => {
        logClientEvent(`  ${index + 1}. ${item.speaker}: "${item.text.substring(0, 50)}..."`);
      });

      logClientEvent("Sending transcript to Cloud Run backend");
      logClientEvent(`Target: ${API_BASE_URL}${API_ENDPOINTS.SUBMIT_TRANSCRIPT}`);
      await assembleAndSubmitTranscript();
    } else {
      if (state.uvSession && state.uvSession.transcripts && Array.isArray(state.uvSession.transcripts) && state.uvSession.transcripts.length > 0) {
        logClientEvent("Using session transcripts as fallback");
        const sessionTranscripts = state.uvSession.transcripts
          .filter((t: any) => t && t.text && typeof t.text === 'string')
          .map((t: any) => ({
            speaker: t.speaker === 'user' ? 'user' : 'agent',
            text: t.text.trim()
          }));

        if (sessionTranscripts.length > 0) {
          setTranscript(sessionTranscripts); 
          logClientEvent("Sending session transcript to Cloud Run");
          await assembleAndSubmitTranscript(); 
          return;
        }
      }

      logError('EndInterview', new Error("No transcript data found"));
      setError("No conversation data was recorded. Please try starting a new interview."); 
      toast({
        title: "Interview Ended",
        description: "No conversation data was recorded. Please try starting a new interview."
      });
      setUiState('idle'); 
    }
  }, [
    state.uiState, state.uvSession, state.currentTranscript, 
    setInterviewActive, setTranscript, assembleAndSubmitTranscript, setError, setUiState, toast,
    logClientEvent, logUltravoxEvent, logError
  ]);


  // CRITICAL FIX: Ultravox event handlers with proper state access
  useEffect(() => {
    if (!state.uvSession) return;

    // logUltravoxEvent("Setting up Ultravox event handlers"); // Already logged by the hook itself if desired

    const handleStatusChange = (event: any) => {
      const status = typeof event === 'string' ? event :
        event?.data || event?.status || state.uvSession.status || 'unknown';

      logUltravoxEvent(`Status change: ${status}`); // This specific log is good
      setUvStatus(status);

      const activeStates = ['idle', 'listening', 'thinking', 'speaking', 'connected', 'ready', 'active'];

      if (status === 'disconnected') {
        logUltravoxEvent("Session disconnected");
        setInterviewActive(false);

        if (state.uiState !== 'processing_transcript' &&
            state.uiState !== 'displaying_results' &&
            state.currentTranscript.length > 0) {
          logClientEvent("Auto-submitting transcript after disconnection"); // This specific log is good
          setTimeout(() => assembleAndSubmitTranscript(), 500);
        } else if (state.currentTranscript.length === 0) {
          setUiState(UI_STATES.IDLE);
        }
      } else if (activeStates.includes(status.toLowerCase())) {
        setUiState(UI_STATES.INTERVIEWING);
        setInterviewActive(true);
      }
    };

    const handleExperimentalMessage = (event: any) => {
      try {
        const message = event?.data || event;
        // logUltravoxEvent("Experimental message received", message); // Already logged by the hook, or too verbose. User-level logClientEvent below is better.

        if (message && typeof message === 'object') {
          const messageStr = JSON.stringify(message).toLowerCase();

          const hangupIndicators = [
            'hangup', 'hang_up', 'hang-up',
            '"toolname":"hangup"', '"name":"hangup"',
            '"tool_name":"hangup"', '"function":"hangup"'
          ];

          const foundHangup = hangupIndicators.some(indicator => messageStr.includes(indicator));

          if (foundHangup) {
            logClientEvent("Hangup tool call detected in experimental message - ending interview"); // More specific client event
            setTimeout(() => {
              if (state.uiState === 'interviewing' && state.isInterviewActive) {
                logClientEvent("Auto-ending interview due to hangUp tool call");
                handleEndInterview(); 
              }
            }, 2000);
            return;
          }

          const completionIndicators = [
            'interview complete', 'interview is complete',
            'thank you for completing', 'that concludes',
            'all done', 'finished with questions'
          ];

          const foundCompletion = completionIndicators.some(indicator => messageStr.includes(indicator));

          if (foundCompletion) {
            logClientEvent("Completion phrase detected in experimental message - ending interview"); // More specific client event
            setTimeout(() => {
              if (state.uiState === 'interviewing' && state.isInterviewActive) {
                logClientEvent("Auto-ending interview due to completion phrase");
                handleEndInterview(); 
              }
            }, 3000);
          }
        }
      } catch (err) {
        logError('HandleExperimentalMessage', err);
      }
    };

    try {
      state.uvSession.addEventListener('status', handleStatusChange);
      state.uvSession.addEventListener('experimental_message', handleExperimentalMessage);
      logUltravoxEvent("Ultravox event listeners added successfully"); // This is a good specific log
    } catch (error) {
      logError('AddUltravoxListeners', error);
    }

    return () => {
      try {
        state.uvSession.removeEventListener('status', handleStatusChange);
        state.uvSession.removeEventListener('experimental_message', handleExperimentalMessage);
        logUltravoxEvent("Ultravox event listeners cleaned up"); // This is a good specific log
      } catch (error) {
        logError('RemoveUltravoxListeners', error);
      }
    };
  }, [
    state.uvSession, 
    state.uiState, 
    state.isInterviewActive, 
    state.currentTranscript.length, 
    setUvStatus, 
    setInterviewActive, 
    setUiState, 
    assembleAndSubmitTranscript, 
    handleEndInterview,
    logClientEvent, 
    logUltravoxEvent, 
    logError 
  ]);


  const resetAllLocal = () => { 
    logClientEvent("Resetting application state (local function)");
    if (state.uvSession) { 
      try {
        state.uvSession.leaveCall();
      } catch (error) {
        logError('ResetLeaveCall', error);
      }
    }
    resetAllState(); 
    clearLogs(); 
  };

  const resetAllAndStartNew = () => {
    logClientEvent("Starting new interview via resetAllAndStartNew");
    resetAllLocal();
    setTimeout(() => handleStartInterview(), 100);
  };

  const handleDebugClick = () => {
    try {
      const debugParams = {
        uvSession: state.uvSession || null,
        uvStatus: state.uvStatus || '',
        isInterviewActive: Boolean(state.isInterviewActive),
        hasAudioPermission: state.hasAudioPermission,
        uiState: state.uiState || 'unknown',
        currentTranscript: Array.isArray(state.currentTranscript) ? state.currentTranscript : [],
        callId: state.callId || '',
        isOnline: Boolean(state.isOnline),
        errorMessage: state.errorMessage || ''
      };

      debugUltravoxState(debugParams); // This function likely does its own console logging
      debugAudioState(); // This function likely does its own console logging
      logClientEvent("Manual debug triggered"); // This is a good specific log
    } catch (error) {
      logError('DebugClick', error);
    }
  };

  const formatSummaryField = (value: string | null | undefined) => {
    if (value === null || value === undefined || value.trim() === '') {
      return "Not reported";
    }
    return value;
  };

  const getStatusText = () => {
    switch (state.uiState) { 
      case 'idle':
        return "Ready to start your medical intake interview";
      case 'requesting_permissions':
        return "Requesting microphone permissions...";
      case 'initiating':
        return "Connecting to AI assistant...";
      case 'interviewing':
        return "Interview in progress - speak clearly";
      case 'processing_transcript':
        return "Processing your interview...";
      case 'displaying_results':
        return "Interview complete - review your summary";
      case 'error':
        return state.errorMessage || "Error occurred - please try again"; 
      default:
        return "Loading...";
    }
  };

  // REMOVED Local Logging Utilities:
  // - clientEventsLog ref
  // - local logClientEvent function
  // - backendCommsLog ref
  // - local logApiCall function

  // Development debugging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      (window as any).debugUltravox = {
        checkState: () => {
          // This console.log is acceptable as it's a specific debug tool output
          console.log("Current State (via window.debugUltravox.checkState):", {
            uiState: state.uiState,
            uvStatus: state.uvStatus,
            isInterviewActive: state.isInterviewActive,
            hasAudioPermission: state.hasAudioPermission,
            transcriptLength: state.currentTranscript.length,
            callId: state.callId,
            isOnline: state.isOnline,
            errorMessage: state.errorMessage
          });
        },
        testMicrophone: async () => {
          try {
            const result = await checkMicrophonePermissions();
            logClientEvent("Debug - Microphone test result: " + JSON.stringify(result));
            return result;
          } catch (error) {
            logError('Debug - TestMicrophone', error);
            return false;
          }
        },
        testNetwork: async () => {
          try {
            const result = await testNetworkConnectivity();
            logClientEvent("Debug - Network test result: " + JSON.stringify(result));
            return result;
          } catch (error) {
            logError('Debug - TestNetwork', error);
            return false;
          }
        }
      };

      logClientEvent("Debug tools available: window.debugUltravox"); // This specific log is good
    }
  }, [
    state.uiState,
    state.uvStatus,
    state.isInterviewActive,
    state.hasAudioPermission,
    state.currentTranscript.length,
    state.callId,
    state.isOnline,
    state.errorMessage,
    logClientEvent, 
    logError 
  ]); 

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
              <div className={`w-2 h-2 rounded-full ${!state.isOnline ? 'bg-red-500 animate-pulse' : 
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
        backendCommsLog={getBackendComms()} // Use getter for DevTray
        outputSet1Received={!!state.summaryData} 
        outputSet1FieldCount={state.summaryData ? Object.keys(state.summaryData).filter(k => state.summaryData && state.summaryData[k] !== null).length : null} 
        outputSet2Received={!!state.analysisData} 
        outputSet2ApproxLength={state.analysisData ? state.analysisData.length : null} 
        clientEventsLog={getClientEvents()} // Use getter for DevTray
      />

      <main className="flex-1">
        <section className="container mx-auto py-12 md:py-24 px-4 md:px-6">
          <div className="grid grid-cols-1 gap-12">
            <div className="space-y-6 max-w-2xl mx-auto text-center md:text-left md:mx-0">
              {/* Static content, no changes needed */}
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

                    {state.uiState === 'idle' && ( // Use state.uiState
                      <div className="space-y-6">
                        <button
                          onClick={handleStartInterview}
                          disabled={state.hasAudioPermission === false} // Use state.hasAudioPermission
                          className="w-24 h-24 mx-auto bg-teal-500 rounded-full flex items-center justify-center hover:bg-teal-600 transition-colors cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                          aria-label="Start Medical Intake"
                        >
                          <Mic size={32} className="text-white" />
                        </button>
                        <Button
                          onClick={handleStartInterview}
                          size="lg"
                          className="bg-teal-500 hover:bg-teal-600"
                          disabled={state.hasAudioPermission === false} // Use state.hasAudioPermission
                        >
                          Start Medical Intake
                        </Button>
                        {state.hasAudioPermission === false && ( // Use state.hasAudioPermission
                          <p className="text-red-500 text-sm mt-2">
                            Microphone access required to start interview
                          </p>
                        )}
                      </div>
                    )}

                    {state.uiState === 'requesting_permissions' && ( // Use state.uiState
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

                    {state.uiState === 'initiating' && ( // Use state.uiState
                      <div className="space-y-6">
                        <div className="w-24 h-24 mx-auto bg-teal-100 rounded-full flex items-center justify-center">
                          <Loader2 size={32} className="text-teal-500 animate-spin" />
                        </div>
                        <p className="text-gray-500">Connecting to AI assistant...</p>
                      </div>
                    )}

                    {state.uiState === 'interviewing' && ( // Use state.uiState
                      <div className="space-y-6">
                        <InterviewPulsingAnimation />
                        <div className="space-y-2">
                          <p className="text-green-600 font-medium">Interview Active</p>
                          <p className="text-sm text-gray-500">Status: {state.uvStatus}</p> {/* Use state.uvStatus */}
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

                    {state.uiState === 'processing_transcript' && ( // Use state.uiState
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

                    {state.uiState === 'displaying_results' && ( // Use state.uiState
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

                    {state.uiState === 'error' && ( // Use state.uiState
                      <div className="space-y-6">
                        <div className="w-24 h-24 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                          <X size={32} className="text-red-500" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-red-600 font-medium">Error Occurred</p>
                          {state.errorMessage && ( // Use state.errorMessage
                            <p className="text-sm text-red-500 px-4">{state.errorMessage}</p> // Use state.errorMessage
                          )}
                          <div className="space-y-2">
                            <Button
                              onClick={resetAllLocal} // Use resetAllLocal
                              variant="outline"
                              size="sm"
                            >
                              Try Again
                            </Button>
                            {state.hasAudioPermission === false && ( // Use state.hasAudioPermission
                              <Button
                                onClick={async () => {
                                  try {
                                    const result = await checkMicrophonePermissions();
                                    const hasPermission = result && typeof result === 'object' ? result.granted : Boolean(result);
                                    if (hasPermission) {
                                      setAudioPermission(true); // Use hook's dispatcher
                                      logClientEvent("Microphone permission granted");
                                    } else {
                                      setAudioPermission(false); // Use hook's dispatcher
                                      const errorMsg = (result && typeof result === 'object' && result.error) || "Microphone access denied";
                                      setError(errorMsg); // Use hook's dispatcher
                                      logClientEvent(`Microphone permission error: ${errorMsg}`);
                                    }
                                  } catch (error) {
                                    console.error("Error requesting microphone permission:", error);
                                    setError("Error requesting microphone permission."); // Use hook's dispatcher
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

                    {state.currentTranscript.length > 0 && ( // Use state.currentTranscript
                      <div className="mt-6">
                        <p className="text-xs text-gray-500 mb-2">
                          Conversation: {state.currentTranscript.length} messages {/* Use state.currentTranscript */}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={`space-y-8 ${!(state.uiState === 'processing_transcript' || state.uiState === 'displaying_results') ? 'opacity-50' : ''}`}> {/* Use state.uiState */}
                <div className="bg-white rounded-lg border shadow-sm">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Medical Summary</h3>
                    {state.uiState === 'processing_transcript' ? ( // Use state.uiState
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                      </div>
                    ) : state.summaryData ? ( // Use state.summaryData
                      <div className="space-y-4 text-sm">
                        {state.summaryData.chiefComplaint && ( // Use state.summaryData
                          <div>
                            <strong>Chief Complaint:</strong>
                            <p className="mt-1 text-gray-600">{state.summaryData.chiefComplaint}</p> {/* Use state.summaryData */}
                          </div>
                        )}
                        {state.summaryData.historyOfPresentIllness && ( // Use state.summaryData
                          <div>
                            <strong>History of Present Illness:</strong>
                            <p className="mt-1 text-gray-600">{state.summaryData.historyOfPresentIllness}</p> {/* Use state.summaryData */}
                          </div>
                        )}
                        {state.summaryData.associatedSymptoms && ( // Use state.summaryData
                          <div>
                            <strong>Associated Symptoms:</strong>
                            <p className="mt-1 text-gray-600">{formatSummaryField(state.summaryData.associatedSymptoms)}</p> {/* Use state.summaryData */}
                          </div>
                        )}
                        {state.summaryData.pastMedicalHistory && ( // Use state.summaryData
                          <div>
                            <strong>Past Medical History:</strong>
                            <p className="mt-1 text-gray-600">{formatSummaryField(state.summaryData.pastMedicalHistory)}</p> {/* Use state.summaryData */}
                          </div>
                        )}
                        {state.summaryData.medications && ( // Use state.summaryData
                          <div>
                            <strong>Medications:</strong>
                            <p className="mt-1 text-gray-600">{formatSummaryField(state.summaryData.medications)}</p> {/* Use state.summaryData */}
                          </div>
                        )}
                        {state.summaryData.allergies && ( // Use state.summaryData
                          <div>
                            <strong>Allergies:</strong>
                            <p className="mt-1 text-gray-600">{formatSummaryField(state.summaryData.allergies)}</p> {/* Use state.summaryData */}
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
                    {state.uiState === 'processing_transcript' ? ( // Use state.uiState
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-4/5" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/5" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
                      </div>
                    ) : state.analysisData ? ( // Use state.analysisData
                      <div className="text-sm text-gray-600">
                        {state.analysisData.split('\n').map((paragraph, index) => ( // Use state.analysisData
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

        {/* Static content sections, no changes needed */}
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