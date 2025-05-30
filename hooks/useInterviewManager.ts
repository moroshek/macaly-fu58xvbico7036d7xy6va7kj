import { useCallback, useEffect, useRef } from 'react';
import {
  UI_STATES,
  UIState,
  CALL_ID_DISPLAY_LENGTH,
  DISPLAY_RESULTS_DELAY_MS,
  START_INTERVIEW_DELAY_MS
} from '@/lib/config';
import { Utterance, SummaryData } from '@/lib/types';
// Note: AppState type is now replaced by the Zustand store structure
// Using inline type definition for this hook's props instead
import { useAppLogger } from '@/hooks/useAppLogger';
import { BackendService } from '@/lib/backend-service';
import { ErrorHandler } from '@/lib/error-handler';
import { TranscriptService } from '@/lib/transcript-service';
import { useToast } from '@/hooks/use-toast';
import { useUltravoxSession } from '@/hooks/useUltravoxSession';
import { checkBrowserCompatibility, checkMicrophonePermissions } from '@/lib/browser-compat';

// Props for the useInterviewManager hook
export interface UseInterviewManagerProps {
  appState: {
    uiState: string;
    isOnline: boolean;
    currentTranscript: Utterance[];
    callId: string;
    uvStatus: string;
  };
  setUiState: (uiState: UIState) => void;
  setCallId: (callId: string) => void;
  setInterviewActive: (isActive: boolean) => void;
  setTranscript: (transcript: Utterance[]) => void;
  setSummaryData: (summaryData: SummaryData | null) => void;
  setAnalysisData: (analysisData: string | null) => void;
  setAudioPermission: (hasPermission: boolean | null) => void;
  setError: (errorMessage: string) => void;
  clearError: () => void;
  resetAll: () => void; // This is from useAppState
  
  logger: ReturnType<typeof useAppLogger>;
  backendService: BackendService;
  errorHandler: ErrorHandler;
  transcriptService: TranscriptService;
  toast: ReturnType<typeof useToast>['toast'];
  // ultravoxSession: Pick<ReturnType<typeof useUltravoxSession>, 'initializeSession' | 'endSession' | 'getTranscripts'>; // Removed
}

// Return type of the useInterviewManager hook
export interface InterviewManagerHandlers {
  handleStartInterview: () => Promise<{ joinUrl: string; callId: string } | null>;
  handleSubmitTranscript: () => Promise<void>;
  handleEndInterview: () => Promise<void>;
  resetAllAndStartNew: () => void;
}

export const useInterviewManager = (deps: UseInterviewManagerProps): InterviewManagerHandlers => {
  const {
    appState,
    setUiState,
    setCallId,
    setInterviewActive,
    setTranscript,
    setSummaryData,
    setAnalysisData,
    setAudioPermission,
    setError,
    clearError,
    resetAll: appStateResetAll, // Renamed to avoid conflict with the new resetAllAndStartNew
    logger,
    backendService,
    errorHandler,
    transcriptService,
    toast,
    // ultravoxSession, // Removed
  } = deps;

  const handleStartInterview = useCallback(async (): Promise<{ joinUrl: string; callId: string } | null> => {
    setSummaryData(null);
    setAnalysisData(null);
    setTranscript([]);
    clearError();

    if (!appState.isOnline) {
      const error = "No internet connection. Please check your connection and try again.";
      setError(error);
      toast({ title: "No Internet Connection", description: error, variant: "destructive" });
      return;
    }

    const browserCheck = checkBrowserCompatibility();
    if (!browserCheck.compatible) {
      const error = "Your browser doesn't support all required features. Please try a modern browser.";
      logger.logError('BrowserCompatibility', new Error(browserCheck.issues.join(', ')));
      setError(error);
      toast({ title: "Browser Compatibility Issue", description: error, variant: "destructive" });
      return;
    }

    try {
      setUiState(UI_STATES.REQUESTING_PERMISSIONS);
      logger.logClientEvent("Requesting microphone permissions");

      const micResult = await checkMicrophonePermissions();
      if (!micResult.granted) {
        const error = micResult.error || "Microphone access denied";
        setAudioPermission(false);
        setError(error);
        logger.logError('MicrophonePermission', new Error(error));
        toast({ title: "Microphone Access Required", description: error, variant: "destructive" });
        return;
      }

      setAudioPermission(true);
      logger.logClientEvent("Microphone permission granted");

      setUiState(UI_STATES.INITIATING);
      logger.logClientEvent("Starting interview initialization");

      const response = await backendService.initiateIntake();
      logger.logApiCall('Backend', 'POST /api/v1/initiate-intake', 'success', 200);

      setCallId(response.callId);
      logger.logClientEvent(`Call ID received: ${response.callId.substring(0, CALL_ID_DISPLAY_LENGTH)}...`);
      
      // No longer calls ultravoxSession.initializeSession here
      setInterviewActive(true); // Signifies intent and that setup is proceeding
      logger.logClientEvent("Interview initiation process complete, joinUrl obtained.");

      return { joinUrl: response.joinUrl, callId: response.callId };

    } catch (error) {
      const appError = errorHandler.handle(error, { source: 'startInterview' });
      logger.logError('StartInterview', appError);
      setError(appError.userMessage || appError.message);
      toast({
        title: "Interview Error",
        description: appError.userMessage || appError.message,
        variant: "destructive"
      });
      setUiState(UI_STATES.ERROR); // Ensure UI state reflects error
      return null;
    }
  }, [
    appState.isOnline, // Ensure appState.isOnline is listed if used directly
    setSummaryData, setAnalysisData, setTranscript, clearError, setError, setUiState,
    setAudioPermission, setCallId, setInterviewActive, toast, logger, backendService,
    errorHandler
    // Removed ultravoxSession.initializeSession
  ]);

  const handleSubmitTranscript = useCallback(async () => {
    if (appState.uiState === UI_STATES.PROCESSING_TRANSCRIPT || appState.uiState === UI_STATES.DISPLAYING_RESULTS) {
      logger.logClientEvent("Already processing transcript");
      return;
    }

    logger.logClientEvent("Starting transcript submission");
    setSummaryData(null);
    setAnalysisData(null);
    setUiState(UI_STATES.PROCESSING_TRANSCRIPT);

    const processingResult = transcriptService.processTranscriptForSubmission(appState.currentTranscript);
    
    if (!processingResult.isValid) {
      const error = processingResult.warnings.join('. ') || "Invalid transcript data";
      logger.logError('TranscriptValidation', new Error(error));
      setError(error);
      toast({ title: "Invalid Transcript", description: error, variant: "destructive" });
      setUiState(UI_STATES.ERROR); // Ensure UI state reflects error
      return;
    }

    if (!appState.callId) {
      const error = "Missing call identifier";
      logger.logError('SubmitTranscript', new Error(error));
      setError(error);
      toast({ title: "Missing Identifier", description: error, variant: "destructive" });
      setUiState(UI_STATES.ERROR);
      return;
    }

    try {
      logger.logClientEvent(`Submitting transcript (${processingResult.stats.totalLength} chars, ${processingResult.stats.totalUtterances} utterances)`);

      const response = await backendService.submitTranscript(
        appState.callId,
        processingResult.cleanedTranscript
      );
      logger.logApiCall('Backend', 'POST /api/v1/submit-transcript', 'success', 200);

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
      }, DISPLAY_RESULTS_DELAY_MS);

    } catch (error) {
      const appError = errorHandler.handle(error, { source: 'submitTranscript' });
      logger.logError('SubmitTranscript', appError);
      setError(appError.userMessage || appError.message);
      toast({
        title: "Processing Failed",
        description: appError.userMessage || appError.message,
        variant: "destructive"
      });
      setUiState(UI_STATES.ERROR);
    }
  }, [
    appState.uiState, appState.currentTranscript, appState.callId,
    setSummaryData, setAnalysisData, setUiState, setError, toast, logger,
    backendService, errorHandler, transcriptService
  ]);

  const handleEndInterview = useCallback(async () => {
    if (appState.uiState === UI_STATES.PROCESSING_TRANSCRIPT || appState.uiState === UI_STATES.DISPLAYING_RESULTS) {
      logger.logClientEvent("Already processing or displaying results");
      return;
    }

    logger.logClientEvent("Ending interview");
    setInterviewActive(false); // Signal intent to end

    // No longer calls ultravoxSession.endSession() or ultravoxSession.getTranscripts()
    // Relies on appState.currentTranscript which should be up-to-date

    // A small delay to allow state to propagate if setTranscript was called (though setTranscript is not called here anymore directly)
    // This delay might not be strictly necessary anymore but keeping it for now if handleSubmitTranscript relies on very recent state.
    await new Promise(resolve => setTimeout(resolve, 0)); 

    if (appState.currentTranscript.length > 0) {
      await handleSubmitTranscript();
    } else {
      logger.logError('EndInterview', new Error("No transcript data found to submit."));
      setError("No conversation data was recorded. Please try starting a new interview.");
      toast({
        title: "Interview Ended",
        description: "No conversation data was recorded."
      });
      setUiState(UI_STATES.IDLE);
    }
  }, [
    appState.uiState, appState.currentTranscript, // appState.currentTranscript is crucial here
    setInterviewActive, setError, setUiState, toast, logger,
    handleSubmitTranscript // Removed setTranscript, ultravoxSession.endSession, ultravoxSession.getTranscripts
  ]);
  
  // This function needs to be defined within the hook to access `appStateResetAll`, `logger.clearLogs`, and `handleStartInterview`
  const resetAllAndStartNew = useCallback(() => {
    logger.logClientEvent("Starting new interview from reset");
    appStateResetAll(); // Call the resetAll from useAppState
    logger.clearLogs();
    // It's important that handleStartInterview is stable or included in deps if it changes
    setTimeout(() => handleStartInterview(), START_INTERVIEW_DELAY_MS);
  }, [appStateResetAll, logger.clearLogs, handleStartInterview, START_INTERVIEW_DELAY_MS]);

  const hasHandledDisconnectionRef = useRef(false);

  // useEffect to react to Ultravox callStatus changes (via appState.uvStatus)
  useEffect(() => {
    if (appState.uvStatus === 'idle') {
      logger.logClientEvent(`[InterviewManager] Ultravox session is ready (status: ${appState.uvStatus}). Waiting for 'listening'.`);
      // Reset flag if session is in a non-terminal state
      if (hasHandledDisconnectionRef.current) {
          console.log(`[InterviewManager] Resetting hasHandledDisconnection flag as status is now ${appState.uvStatus}.`);
          hasHandledDisconnectionRef.current = false;
      }
    } else if (appState.uvStatus === 'listening') {
      logger.logClientEvent(`[InterviewManager] Ultravox session is active (status: ${appState.uvStatus}). Interview started.`);
      setInterviewActive(true);
      // Reset flag if session is in a non-terminal state
      if (hasHandledDisconnectionRef.current) {
          console.log(`[InterviewManager] Resetting hasHandledDisconnection flag as status is now ${appState.uvStatus}.`);
          hasHandledDisconnectionRef.current = false;
      }
      // Potentially set UI_STATE to INTERVIEWING here if not already handled
      // setUiState(UI_STATES.INTERVIEWING); 
    } else if ((appState.uvStatus === 'disconnected' || appState.uvStatus === 'error' || appState.uvStatus === 'failed')) {
      if (!hasHandledDisconnectionRef.current) {
        console.log(`[InterviewManager] Handling disconnection (status: ${appState.uvStatus}) ONCE.`);
        logger.logClientEvent(`[InterviewManager] Ultravox session ended or failed (status: ${appState.uvStatus}). Marking interview inactive.`);
        setInterviewActive(false);
        // Potentially set UI_STATE to ERROR or IDLE here
        // setUiState(UI_STATES.ERROR); // Or appropriate terminal UI state
        hasHandledDisconnectionRef.current = true;
      } else {
        console.log(`[InterviewManager] Disconnection (status: ${appState.uvStatus}) already handled.`);
      }
    } else if (appState.uvStatus !== 'disconnected' && appState.uvStatus !== 'error' && appState.uvStatus !== 'failed') {
      // This is the more general reset condition from the issue description
      if (hasHandledDisconnectionRef.current) {
          console.log(`[InterviewManager] Resetting hasHandledDisconnection flag as status is now ${appState.uvStatus}.`);
      }
      hasHandledDisconnectionRef.current = false;
    }
  }, [appState.uvStatus, setInterviewActive, logger, setUiState]); 

  return {
    handleStartInterview,
    handleSubmitTranscript,
    handleEndInterview,
    resetAllAndStartNew,
  };
};
