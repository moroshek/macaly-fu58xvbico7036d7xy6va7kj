import { useCallback, useEffect, useRef } from 'react';
import {
  UI_STATES,
  UIState,
  CALL_ID_DISPLAY_LENGTH,
  DISPLAY_RESULTS_DELAY_MS,
  START_INTERVIEW_DELAY_MS
} from '@/lib/config';
import { Utterance, SummaryData } from '@/lib/types';
import { AppState } from '@/hooks/useAppState';
import { useAppLogger } from '@/hooks/useAppLogger';
import { BackendService } from '@/lib/backend-service';
import { ErrorHandler } from '@/lib/error-handler';
import { TranscriptService } from '@/lib/transcript-service';
import { useToast } from '@/hooks/use-toast';
import { useUltravoxSession } from '@/hooks/useUltravoxSession';
import { checkBrowserCompatibility, checkMicrophonePermissions } from '@/lib/browser-compat';

// Props for the useInterviewManager hook
export interface UseInterviewManagerProps {
  appState: AppState;
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
  
  ultravoxSession: Pick<ReturnType<typeof useUltravoxSession>, 'initializeSession' | 'endSession' | 'getTranscripts'>;
}

// Return type of the useInterviewManager hook
export interface InterviewManagerHandlers {
  handleStartInterview: () => Promise<void>;
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
    ultravoxSession,
  } = deps;

  const handleStartInterview = useCallback(async () => {
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

      const success = await ultravoxSession.initializeSession(response.joinUrl);
      if (!success) {
        throw new Error("Failed to initialize interview session");
      }

      setInterviewActive(true);
      logger.logClientEvent("Interview started successfully");
      // UI_STATES.INTERVIEWING is typically set by Ultravox status events.
      // setInterviewActive(true) and related logging are now handled by a useEffect hook
      // monitoring appState.uvStatus (which reflects callStatus).

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
    }
  }, [
    appState.isOnline,
    setSummaryData, setAnalysisData, setTranscript, clearError, setError, setUiState,
    setAudioPermission, setCallId, setInterviewActive, toast, logger, backendService,
    errorHandler, ultravoxSession.initializeSession
    // Removed direct dependencies on appState values that are part of appState object itself
    // The appState object itself is a dependency if any of its properties are used.
    // For more granular control, list specific appState properties: appState.isOnline, etc.
    // However, if many are used, appState as a whole is fine.
    // appState.uvStatus is intentionally not listed here as it's handled in a separate useEffect.
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
    setInterviewActive(false); // This will trigger onSessionEnd in useUltravoxSession if session is active

    await ultravoxSession.endSession();

    const sessionTranscripts = ultravoxSession.getTranscripts();
    // Use a combined transcript for submission if appState.currentTranscript might be partial
    const finalTranscript = appState.currentTranscript.length > sessionTranscripts.length ? appState.currentTranscript : sessionTranscripts;
    
    if (finalTranscript.length === 0 && appState.currentTranscript.length > 0) {
        // This case handles if getTranscripts somehow returned empty but we had some from onTranscriptUpdate
        setTranscript(appState.currentTranscript); 
    } else if (finalTranscript.length > 0 && appState.currentTranscript.length === 0) {
         logger.logClientEvent("Using session transcripts as fallback for submission");
         setTranscript(finalTranscript); // Ensure appState.currentTranscript is updated before handleSubmit
    }


    // Check currentTranscript from appState again, as it might have been updated by setTranscript above
    // Or, more directly, use `finalTranscript` if it's guaranteed to be the one to use.
    // For safety, using appState.currentTranscript which *should* be updated by now if setTranscript was called.
    // A better pattern might be to pass the transcript directly to handleSubmitTranscript.
    // For now, relying on state update.

    // A small delay to allow state to propagate if setTranscript was called.
    await new Promise(resolve => setTimeout(resolve, 0));


    if (appState.currentTranscript.length > 0) { // Check appState.currentTranscript after potential update
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
    appState.uiState, appState.currentTranscript, // Include appState.currentTranscript
    setInterviewActive, setTranscript, setError, setUiState, toast, logger,
    ultravoxSession.endSession, ultravoxSession.getTranscripts, handleSubmitTranscript
    // Added appState.currentTranscript to dependency array
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
