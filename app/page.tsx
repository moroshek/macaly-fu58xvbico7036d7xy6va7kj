"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Mic, X, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import axios from "axios";
import axiosRetry from 'axios-retry';
import { UltravoxSession } from 'ultravox-client';
import DevTray from "@/components/DevTray";

import Area1IdleDisplay from "@/components/intake/Area1IdleDisplay";
import Area1InitiatingDisplay from "@/components/intake/Area1InitiatingDisplay";
import Area1InterviewingDisplay from "@/components/intake/Area1InterviewingDisplay";
import Area1ProcessingDisplay from "@/components/intake/Area1ProcessingDisplay";
import Area1ErrorDisplay from "@/components/intake/Area1ErrorDisplay";
import Area1CompleteDisplay from "@/components/intake/Area1CompleteDisplay";
import SummaryResultsBox from "@/components/intake/SummaryResultsBox";
import AnalysisResultsBox from "@/components/intake/AnalysisResultsBox";

type BackendCommLog = {
  timestamp: string;
  serviceTarget: string;
  method: string;
  outcome: string;
  statusCode?: number;
};

const API_BASE_URL = 'https://ai-medical-intake-service-d3jme76qea-uc.a.run.app';

axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return Boolean(
      axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      (error.code === 'ECONNABORTED') ||
      (error.response && error.response.status >= 500)
    );
  },
  onRetry: (retryCount, error, requestConfig) => {
    console.log(`Retry attempt ${retryCount} for ${requestConfig.url}`);
  }
});

axios.interceptors.response.use(
  response => response,
  error => {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.warn('Request timed out:', error.config?.url);
    } else if (!error.response) {
      console.warn('Network error occurred:', error.message);
    }
    return Promise.reject(error);
  }
);

type Utterance = {
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

export default function LandingPage() {
  const [uiState, setUiState] = useState<'idle' | 'initiating' | 'interviewing' | 'processing_transcript' | 'displaying_results' | 'error'>('idle');
  const [uvSession, setUvSession] = useState<any>(null);
  const [callId, setCallId] = useState<string>("");
  const [isInterviewActive, setIsInterviewActive] = useState<boolean>(false);
  const [uvStatus, setUvStatus] = useState<string>("");

  const [currentTranscript, setCurrentTranscript] = useState<Utterance[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [analysisData, setAnalysisData] = useState<string | null>(null);

  const [isOnline, setIsOnline] = useState(true);
  const [networkChecking, setNetworkChecking] = useState(false);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [isDrawerHidden, setIsDrawerHidden] = useState(true);
  const pendingRequestsRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [backendCommsLog, setBackendCommsLog] = useState<BackendCommLog[]>([]);
  const [clientEventsLog, setClientEventsLog] = useState<string[]>([]);
  const [submittedTranscriptLength, setSubmittedTranscriptLength] = useState<number | null>(null);

  const logClientEvent = (event: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `${timestamp}: ${event}`;
    setClientEventsLog(prev => [logEntry, ...prev].slice(0, 20));
    console.log(logEntry);
  };

  const debugUltravoxSession = (session: any, label = 'Ultravox Session') => {
    try {
      if (!session) {
        console.log(`${label}: null or undefined`);
        return;
      }
      console.log(`=== ${label} Debug ===`);
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(session))
        .filter(prop => typeof session[prop] === 'function');
      console.log('Available methods:', methods);
      const props = Object.getOwnPropertyNames(session)
        .filter(prop => typeof session[prop] !== 'function');
      console.log('Available properties:', props);
      if ('status' in session) {
        console.log('Current status:', session.status);
      }
      console.log('=== End Debug ===');
    } catch (err) {
      console.error('Error debugging Ultravox session:', err);
    }
  };

  const logBackendComm = (serviceTarget: string, method: string, outcome: string, statusCode?: number) => {
    const timestamp = new Date().toLocaleTimeString();
    setBackendCommsLog(prev => [
      { timestamp, serviceTarget, method, outcome, statusCode },
      ...prev
    ].slice(0, 10));
  };

  const checkApiConnectivity = async () => {
    try {
      setNetworkChecking(true);
      logClientEvent('Checking API connectivity');
      const timestamp = new Date().getTime();
      const response = await axios.get(
        `${API_BASE_URL}/health?_=${timestamp}`,
        { timeout: 15000 }
      );
      logBackendComm('health', 'GET', 'success', response.status);
      if (!isOnline) {
        logClientEvent('API connectivity restored');
        setIsOnline(true);
      }
      return true;
    } catch (error) {
      logClientEvent('API connectivity failed');
      logBackendComm('health', 'GET', 'failed');
      console.warn('API connectivity test failed:', error);
      if (isOnline) {
        setIsOnline(false);
        if (!isDrawerHidden) {
          setDrawerExpanded(true);
        }
      }
      return false;
    } finally {
      setNetworkChecking(false);
    }
  };

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = async () => {
      console.log('Browser reports network connection restored');
      if (pendingRequestsRef.current > 0) {
        await checkApiConnectivity();
      } else {
        setIsOnline(true);
      }
    };
    const handleOffline = () => {
      console.log('Browser reports network connection lost');
      setIsOnline(false);
      if (!isDrawerHidden) {
        setDrawerExpanded(true);
      }
    };
    const connectionCheckInterval = setInterval(() => {
      if (pendingRequestsRef.current > 0 && !isOnline) {
        checkApiConnectivity();
      }
    }, 10000);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine) {
      checkApiConnectivity();
    }
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(connectionCheckInterval);
    };
  }, [isOnline, isDrawerHidden]);

  useEffect(() => {
    return () => {
      if (uvSession) {
        try {
          console.log("Cleaning up Ultravox session on unmount");
          logClientEvent("Cleaning up Ultravox session on component unmount");
          uvSession.leaveCall();
        } catch (error) {
          console.error("Error cleaning up Ultravox session:", error);
          logClientEvent(`Error cleaning up Ultravox session: ${(error as Error).message || 'Unknown error'}`);
        }
      }
    };
  }, [uvSession]);

  const initUltravoxSession = async (joinUrl: string) => {
    try {
      console.log("Initializing Ultravox session");
      logClientEvent("Creating new UltravoxSession instance");

      const session = new UltravoxSession();
      setUvSession(session);
      debugUltravoxSession(session, 'New Ultravox Session');

      const handleStatusChange = (status: string) => {
        console.log("Ultravox status:", status);
        logClientEvent(`Ultravox status changed: ${status}`);
        setUvStatus(status);

        if (status === 'disconnected') {
          logClientEvent("Ultravox session disconnected");
          setIsInterviewActive(false); // Ensure interview active is false
          // Check if we are already processing; if so, let assembleAndSubmitTranscript handle it
          if (uiState !== 'processing_transcript' && uiState !== 'displaying_results') {
            if (currentTranscript.length > 0) {
              console.log("Ultravox disconnected with transcript data, auto-submitting");
              logClientEvent("Auto-submitting transcript after disconnection (not already processing)");
              assembleAndSubmitTranscript();
            } else {
              console.log("Ultravox disconnected without transcript data (not already processing)");
              logClientEvent("No transcript data to submit, UI state not processing. Resetting to idle.");
              setUiState('idle');
            }
          } else {
            logClientEvent("Ultravox disconnected, but UI is already processing/displaying. No action from status handler.");
          }
        } else if (status === 'connecting') {
          logClientEvent("Ultravox connecting");
        } else if (['idle', 'listening', 'thinking', 'speaking', 'connected', 'ready'].includes(status)) {
          logClientEvent(`Interview active, status: ${status}`);
          setUiState('interviewing');
          setIsInterviewActive(true);
        }
      };

      const handleAgentMessage = (message: any) => {
        if (message && typeof message.isFinal !== 'undefined' && typeof message.text === 'string') {
          if (message.isFinal) {
            console.log("Received final agent transcript:", message);
            logClientEvent(`Agent message received: ${message.text.substring(0, 30)}...`);
            setCurrentTranscript(prev => [
              ...prev,
              { speaker: message.speaker || 'agent', text: message.text }
            ]);
          }
        } else {
          console.warn("handleAgentMessage received malformed message object:", message);
          logClientEvent("Warning: Malformed agent message structure in handler.");
        }
      };

      const handleUserMessage = (transcript: any) => {
        if (transcript && typeof transcript.isFinal !== 'undefined' && typeof transcript.text === 'string') {
          if (transcript.isFinal) {
            console.log("User transcript finalized:", transcript);
            logClientEvent(`User message transcribed: ${transcript.text.substring(0, 30)}...`);
            setCurrentTranscript(prev => [
              ...prev,
              { speaker: transcript.speaker || 'user', text: transcript.text }
            ]);
          }
        } else {
          console.warn("handleUserMessage received malformed transcript object:", transcript);
          logClientEvent("Warning: Malformed user transcript structure in handler.");
        }
      };

      const handleError = (error: any) => {
        console.error("Ultravox error:", error);
        logClientEvent(`Ultravox error: ${(error && error.message) ? error.message : 'Unknown Ultravox error'}`);
        toast.error("Interview Error", {
          description: "There was a problem with the interview. Please try again."
        });
        setUiState('error');
      };

      if (typeof (session as any).onStatusChange !== 'undefined') {
        console.log("Using onStatusChange property for status events");
        (session as any).onStatusChange = (status: string) => handleStatusChange(status);
      } else if (typeof session.addEventListener === 'function') {
        console.log("Using addEventListener for status events");
        session.addEventListener('status', (event: any) => {
          if (event && typeof event.data === 'string') {
            handleStatusChange(event.data);
          } else if (event && event.status && typeof event.status === 'string') {
            handleStatusChange(event.status);
          } else {
            console.warn("Received status event with unexpected structure:", event);
          }
        });
      } else {
        console.log("Using manual event assignment for status events");
        (session as any).on?.('status', (event: any) => {
          if (typeof event === 'string') handleStatusChange(event);
          else if (event && typeof event.data === 'string') handleStatusChange(event.data);
          else console.warn("Received manual status event with unexpected structure:", event);
        });
      }

      if (typeof (session as any).onMessageReceived !== 'undefined') {
        console.log("Using onMessageReceived property for agent messages");
        (session as any).onMessageReceived = (message: any) => {
          if (message && typeof message.speaker === 'string') {
            if (message.speaker === 'agent') {
              handleAgentMessage(message);
            } else {
              handleUserMessage(message);
            }
          } else if (message) {
            handleAgentMessage({ ...message, speaker: 'agent' });
          } else {
            console.warn("onMessageReceived called with null/undefined message");
            logClientEvent("Warning: onMessageReceived with null/undefined message data.");
          }
        };
      }

      if (typeof (session as any).onUserMessageTranscribed !== 'undefined') {
        console.log("Using onUserMessageTranscribed property for user messages");
        (session as any).onUserMessageTranscribed = (transcript: any) => {
          if (transcript) {
            handleUserMessage({ ...transcript, speaker: 'user' });
          } else {
            console.warn("onUserMessageTranscribed called with null/undefined transcript");
            logClientEvent("Warning: onUserMessageTranscribed with null/undefined transcript data.");
          }
        };
      }

      if ((typeof (session as any).onMessageReceived === 'undefined' ||
        typeof (session as any).onUserMessageTranscribed === 'undefined') &&
        typeof session.addEventListener === 'function') {
        console.log("Using addEventListener for transcript events");
        session.addEventListener('transcripts', (event: any) => {
          if (event && event.data && typeof event.data.speaker === 'string') {
            if (event.data.speaker === 'agent') {
              handleAgentMessage(event.data);
            } else {
              handleUserMessage(event.data);
            }
          } else {
            console.warn("Received transcript event via addEventListener with missing/malformed data:", event);
            logClientEvent("Warning: Received transcript event (addEventListener) with malformed data.");
          }
        });
      }

      if (typeof (session as any).onError !== 'undefined') {
        console.log("Using onError property for error events");
        (session as any).onError = (error: any) => handleError(error);
      } else if (typeof session.addEventListener === 'function') {
        console.log("Using addEventListener for error events");
        session.addEventListener('error', (event: any) => handleError(event.error || event));
      } else {
        console.log("Using manual event assignment for error events");
        (session as any).on?.('error', (event: any) => handleError(event.error || event));
      }

      console.log("Joining Ultravox call with URL:", joinUrl);
      logClientEvent("Joining Ultravox call");
      await session.joinCall(joinUrl);
      logClientEvent("Successfully joined Ultravox call");

      setUiState('interviewing');
      setIsInterviewActive(true);

      console.log("Ensuring microphone is unmuted");
      logClientEvent("Ensuring microphone is unmuted post-join");
      try {
        if (typeof session.unmuteMic === 'function') {
          session.unmuteMic();
        } else if (typeof (session as any).unmuteMicrophone === 'function') {
          (session as any).unmuteMicrophone();
        } else if (typeof (session as any).unmute === 'function') {
          (session as any).unmute();
        } else {
          console.warn("No explicit unmute method found, assuming mic is active by default or controlled by browser.")
        }
      } catch (micError) {
        console.warn("Could not unmute microphone initially:", micError);
        logClientEvent(`Warning: Could not unmute microphone: ${(micError as Error).message}`);
      }
      return true;
    } catch (error) {
      console.error("Error initializing Ultravox session:", error);
      logClientEvent(`Failed to initialize Ultravox session: ${(error as Error).message || 'Unknown error'}`);
      toast.error("Connection Error", {
        description: "Could not connect to the interview service. Please try again."
      });
      setUiState('error');
      return false;
    }
  };

  const handleStartInterview = async () => {
    try {
      setUiState('initiating');
      logClientEvent("Starting interview initialization");
      if (!navigator.onLine) {
        logClientEvent("Interview start failed: Offline");
        throw new Error("You appear to be offline. Please check your connection.");
      }
      pendingRequestsRef.current++;
      try {
        logClientEvent("Requesting microphone access");
        await navigator.mediaDevices.getUserMedia({ audio: true });
        logClientEvent("Microphone access granted");
      } catch (micError) {
        logClientEvent("Microphone access denied");
        console.error("Microphone access denied:", micError);
        throw new Error("Microphone access is required for the interview. Please grant permission.");
      }
      logClientEvent("Calling initiate-intake API");
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/initiate-intake`,
        {},
        { timeout: 30000 }
      );
      logBackendComm('initiate-intake', 'POST', 'success', response.status);
      logClientEvent("Received initiate-intake response");
      const { joinUrl, callId: newCallId } = response.data; // Renamed to newCallId to avoid conflict
      if (!joinUrl || !newCallId) {
        logClientEvent("Invalid API response: Missing joinUrl or callId");
        throw new Error("Invalid response from server. Missing joinUrl or callId.");
      }
      setCallId(newCallId); // Set the main callId state here
      logClientEvent(`Call ID received: ${newCallId.substring(0, 8)}...`);
      logClientEvent("Initializing Ultravox session");
      const success = await initUltravoxSession(joinUrl);
      if (!success) {
        logClientEvent("Failed to initialize Ultravox session");
        throw new Error("Failed to initialize interview session.");
      }
      logClientEvent("Ultravox session initialized successfully");
    } catch (error: any) {
      console.error("Error starting interview:", error);
      logClientEvent(`Interview start error: ${error.message || 'Unknown error'}`);
      let errorMessage = "An unexpected error occurred. Please try again.";
      let statusCode;
      if (error.message) {
        errorMessage = error.message;
      } else if (axios.isAxiosError(error)) {
        if (!error.response) {
          errorMessage = "Could not connect to the server. Please check your internet connection.";
        } else if (error.response.status === 429) {
          errorMessage = "Too many requests. Please try again later.";
          statusCode = 429;
        } else {
          errorMessage = `Server error (${error.response.status}). Please try again later.`;
          statusCode = error.response.status;
        }
        if (error.config?.url) {
          const url = error.config.url;
          const endpoint = url.includes('/') ? url.split('/').pop() : url;
          logBackendComm(endpoint || 'unknown', error.config.method?.toUpperCase() || 'UNKNOWN', 'failed', statusCode);
        }
      }
      toast.error("Interview Error", {
        description: errorMessage
      });
      setUiState('error');
    } finally {
      pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
    }
  };

  const handleEndInterview = async () => {
    if (!uvSession) {
      logClientEvent("[handleEndInterview] No uvSession, returning.");
      return;
    }

    logClientEvent("[handleEndInterview] User initiated. Current transcript length: " + currentTranscript.length + ", Call ID: " + callId);

    // Regardless of transcript, we are ending the interview process from user action.
    // The UI should reflect processing if there's data, or reset if not.

    if (currentTranscript.length > 0 && callId) {
      logClientEvent("[handleEndInterview] Transcript and callId exist. Attempting to leave call and submit.");
      // assembleAndSubmitTranscript will set uiState to 'processing_transcript'
      try {
        logClientEvent("[handleEndInterview] Attempting to leave Ultravox call...");
        await uvSession.leaveCall();
        logClientEvent("[handleEndInterview] Successfully left Ultravox call.");
      } catch (error) {
        console.error("[handleEndInterview] Error during uvSession.leaveCall():", error);
        logClientEvent(`[handleEndInterview] Error leaving call: ${(error as Error).message || 'Unknown error'}`);
        // If leaving call fails, we might still want to try processing if data exists.
        // Or, consider this a more severe error. For now, proceed to attempt submission.
      } finally {
        setIsInterviewActive(false); // Always set interview to inactive after attempting to leave.
        // Call assembleAndSubmitTranscript AFTER attempting to leave call
        assembleAndSubmitTranscript();
      }
    } else {
      logClientEvent("[handleEndInterview] No transcript or callId. Resetting to idle.");
      toast.error("Empty Interview", {
        description: "No conversation data recorded or call ID is missing."
      });
      setIsInterviewActive(false);
      if (uvSession && uvSession.status !== 'disconnected') {
        try {
          logClientEvent("[handleEndInterview] Attempting to leave call on empty/no-callId scenario.");
          await uvSession.leaveCall();
        } catch (e) { console.warn("[handleEndInterview] Error leaving call on empty:", e); }
      }
      setUiState('idle');
    }
  };

  const assembleAndSubmitTranscript = async () => {
    logClientEvent(`[assembleAndSubmitTranscript] Called. Transcript length: ${currentTranscript.length}, Call ID: ${callId}, Current UI State: ${uiState}`);

    // This function is now the single source of truth for entering 'processing_transcript' state
    // when submission is intended.
    setSummaryData(null);
    setAnalysisData(null);
    setUiState('processing_transcript');
    logClientEvent("[assembleAndSubmitTranscript] UI state set to 'processing_transcript'.");

    if (!currentTranscript.length) {
      logClientEvent("[assembleAndSubmitTranscript] No transcript data. Resetting to idle.");
      // This case should ideally be caught before calling this function,
      // but as a safeguard:
      setUiState('idle');
      toast.info("No Data", { description: "No conversation to process." });
      return;
    }
    if (!callId) {
      logClientEvent("[assembleAndSubmitTranscript] Missing call ID. Setting to error state.");
      setUiState('error');
      toast.error("System Error", { description: "Missing call identifier for submission." });
      return;
    }

    logClientEvent("[assembleAndSubmitTranscript] Proceeding with transcript assembly and API call.");
    try {
      const fullTranscript = currentTranscript.map(utterance =>
        `${utterance.speaker === 'agent' ? 'Agent' : 'User'}: ${utterance.text}`
      ).join('\n');
      setSubmittedTranscriptLength(fullTranscript.length);
      logClientEvent(`[assembleAndSubmitTranscript] Assembled transcript (${fullTranscript.length} chars).`);

      pendingRequestsRef.current++;
      abortControllerRef.current = new AbortController();

      logClientEvent("[assembleAndSubmitTranscript] Calling submit-transcript API.");
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/submit-transcript`,
        { callId: callId, transcript: fullTranscript },
        { timeout: 60000, signal: abortControllerRef.current.signal }
      );

      logBackendComm('submit-transcript', 'POST', 'success', response.status);
      logClientEvent("[assembleAndSubmitTranscript] Received submit-transcript response.");

      const { summary, analysis } = response.data;

      if (typeof summary === 'undefined' || typeof response.data.analysis === 'undefined') {
        logClientEvent("[assembleAndSubmitTranscript] Error: Invalid API response - 'summary' or 'analysis' field is undefined.");
        throw new Error("Invalid response from server. The 'summary' or 'analysis' field is undefined.");
      }

      const validatedSummary: SummaryData = {
        chiefComplaint: summary.chiefComplaint ?? null,
        historyOfPresentIllness: summary.historyOfPresentIllness ?? null,
        associatedSymptoms: summary.associatedSymptoms ?? null,
        pastMedicalHistory: summary.pastMedicalHistory ?? null,
        medications: summary.medications ?? null,
        allergies: summary.allergies ?? null,
        notesOnInteraction: summary.notesOnInteraction ?? null
      };

      const summaryFieldCount = Object.values(validatedSummary).filter(v => v !== null && String(v).trim() !== "").length;
      logClientEvent(`[assembleAndSubmitTranscript] Received summary data (${summaryFieldCount} fields).`);
      logClientEvent(`[assembleAndSubmitTranscript] Received analysis (${analysis ? analysis.length : 0} characters).`);

      setSummaryData(validatedSummary);
      setAnalysisData(analysis);

      setUiState('displaying_results');
      logClientEvent("[assembleAndSubmitTranscript] UI state set to 'displaying_results'.");

      toast.success("Interview Complete", {
        description: "Your medical intake interview has been processed successfully."
      });
    } catch (error: any) {
      console.error("[assembleAndSubmitTranscript] Error submitting transcript:", error);
      logClientEvent(`[assembleAndSubmitTranscript] Transcript submission error: ${error.message || 'Unknown error'}`);
      let errorMessage = "An unexpected error occurred while processing your interview. Please try again.";
      let statusCode;
      if (error.message) {
        errorMessage = error.message;
      } else if (axios.isAxiosError(error)) {
        if (!error.response) {
          errorMessage = "Could not connect to the server. Please check your internet connection.";
        } else if (error.response.status === 429) {
          errorMessage = "Too many requests. Please try again later.";
          statusCode = 429;
        } else {
          errorMessage = `Server error (${error.response.status}). Please try again later.`;
          statusCode = error.response.status;
        }
        if (error.config?.url) {
          const url = error.config.url;
          const endpoint = url.includes('/') ? url.split('/').pop() : url;
          logBackendComm(endpoint || 'unknown', error.config.method?.toUpperCase() || 'UNKNOWN', 'failed', statusCode);
        }
      }
      toast.error("Processing Error", { description: errorMessage });
      setUiState('error');
      logClientEvent("[assembleAndSubmitTranscript] UI state set to 'error'.");
    } finally {
      pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
    }
  };

  const resetAll = () => {
    logClientEvent("[resetAll] Called.");
    if (uvSession) {
      try {
        uvSession.leaveCall();
      } catch (error) {
        console.error("[resetAll] Error leaving Ultravox call during reset:", error);
      }
    }
    setUvSession(null);
    setCallId("");
    setIsInterviewActive(false);
    setUvStatus("");
    setCurrentTranscript([]);
    setSummaryData(null);
    setAnalysisData(null);
    setUiState('idle');
    logClientEvent("[resetAll] UI state set to 'idle'.");
  };

  const resetAllAndStartNew = () => {
    logClientEvent("[resetAllAndStartNew] Called.");
    resetAll();
    setTimeout(() => handleStartInterview(), 100);
  };

  const formatSummaryField = (value: string | null | undefined) => {
    if (value === null || value === undefined || value.trim() === '') {
      return "Not reported";
    }
    return value;
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="container mx-auto py-4 px-4 md:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
              <span className="text-white font-semibold">AI</span>
            </div>
            <span className="font-semibold text-lg">MedIntake</span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="container mx-auto py-12 md:py-24 px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
            <div className="space-y-6">
              <div className="space-y-2">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Intelligent, Faster Medical Intake</h1>
                <p className="text-xl text-gray-500">
                  Patient speaks to friendly AI agent. Intake summary provided instantly. State of the art medical model provides insights to the provider.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline" className="flex items-center gap-1 py-1.5 px-2.5 bg-white">
                  <Shield className="h-3.5 w-3.5 text-teal-500" />
                  <span>HIPAA Compliant</span>
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1 py-1.5 px-2.5 bg-white">
                  <Lock className="h-3.5 w-3.5 text-teal-500" />
                  <span>Secure Encryption</span>
                </Badge>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  This is beta software. Do not use this as medical advice. It is for informational purposes only.
                  <Link href="/privacy" className="ml-1 text-teal-600 hover:underline">
                    Learn more
                  </Link>
                </p>
              </div>
            </div>

            <div className={`${uiState === 'displaying_results' || uiState === 'processing_transcript' ? 'md:col-span-2 md:grid md:grid-cols-2 md:gap-8' : 'relative md:col-span-1'}`}>
              <div className={`${uiState === 'displaying_results' || uiState === 'processing_transcript' ? 'md:col-span-1' : ''} relative h-[400px] rounded-lg overflow-hidden bg-gradient-to-br from-teal-50 to-blue-50 border border-teal-100 shadow-md flex flex-col`}>
                {uiState === 'idle' && <Area1IdleDisplay onStartInterview={handleStartInterview} />}
                {uiState === 'initiating' && <Area1InitiatingDisplay />}
                {uiState === 'interviewing' && (
                  <Area1InterviewingDisplay
                    uvStatus={uvStatus}
                    onEndInterview={handleEndInterview}
                    InterviewPulsingAnimationComponent={InterviewPulsingAnimation}
                  />
                )}
                {uiState === 'processing_transcript' && <Area1ProcessingDisplay />}
                {uiState === 'error' && <Area1ErrorDisplay onReset={resetAll} />}
                {uiState === 'displaying_results' && <Area1CompleteDisplay onStartNewInterview={resetAllAndStartNew} />}
              </div>

              {(uiState === 'processing_transcript' || uiState === 'displaying_results') && (
                <div className="md:col-span-1 space-y-8 mt-8 md:mt-0">
                  <SummaryResultsBox
                    summaryData={summaryData}
                    isLoading={uiState === 'processing_transcript'}
                    formatSummaryField={formatSummaryField}
                  />
                  <AnalysisResultsBox
                    analysisData={analysisData}
                    isLoading={uiState === 'processing_transcript'}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="bg-gray-50 py-16">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold">How It Works</h2>
              <p className="text-gray-500 mt-2 max-w-2xl mx-auto">
                Our AI-powered intake process is designed to be simple, secure, and efficient
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-teal-600 font-semibold">1</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">Start Your Intake</h3>
                <p className="text-gray-500">
                  Begin the process with a simple click. No downloads or complicated setup required.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-teal-600 font-semibold">2</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">Answer Questions</h3>
                <p className="text-gray-500">
                  Speak naturally with our AI assistant to answer medical questions.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-teal-600 font-semibold">3</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">See Your Doctor</h3>
                <p className="text-gray-500">
                  Your provider receives your information instantly, making your consultation more efficient.
                </p>
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
            <div className="flex flex-wrap justify-center gap-6 mb-4 md:mb-0">
              <Link href="/terms" className="text-sm text-gray-500 hover:text-teal-600 transition-colors">
                Terms of Service
              </Link>
              <Link href="/privacy" className="text-sm text-gray-500 hover:text-teal-600 transition-colors">
                Privacy Policy
              </Link>
            </div>
            <div className="text-sm text-gray-500">Jake Moroshek | BuildAI © 2025</div>
          </div>
        </div>
      </footer>

      {!isDrawerHidden && (
        <div className={`network-status-drawer ${!isOnline || networkChecking || drawerExpanded ? 'expanded' : ''}`}>
          <div
            className={`network-status-icon ${!isOnline ? 'network-offline' : networkChecking ? 'network-checking' : 'network-online'}`}
            onClick={() => setDrawerExpanded(!drawerExpanded)}
            aria-label="Network status"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setDrawerExpanded(!drawerExpanded)}
          >
            ^
          </div>

          <div className="network-status-panel bg-white rounded-lg border shadow-sm">
            <div className="absolute top-1 right-1">
              <button
                onClick={() => {
                  setIsDrawerHidden(true);
                  setDrawerExpanded(false);
                  console.log('Network drawer hidden by user');
                }}
                className="text-gray-400 hover:text-gray-600 text-xs p-1"
                aria-label="Hide network status"
              >
                ×
              </button>
            </div>

            <div className={`p-2 ${!isOnline ? 'bg-red-50 text-red-800' : networkChecking ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>
              <div className="font-medium text-xs">
                {!isOnline ? 'Offline' : networkChecking ? 'Checking...' : 'Connected'}
              </div>
            </div>

            <div className="p-2">
              {!isOnline && (
                <Button
                  onClick={() => {
                    checkApiConnectivity();
                  }}
                  disabled={networkChecking}
                  className="w-full text-xs py-0.5 h-6"
                  size="sm"
                >
                  {networkChecking ? '...' : 'Retry'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <DevTray
        appPhase={uiState}
        sessionStatus={uvStatus || 'N/A'}
        sessionId={callId || null}
        isSessionActive={isInterviewActive}
        micStatus={isInterviewActive ? 'Active' : 'Inactive'}
        utteranceCount={currentTranscript.length}
        lastUtteranceSource={currentTranscript.length > 0 ?
          (currentTranscript[currentTranscript.length - 1].speaker === 'agent' ? 'Agent' : 'User') :
          null
        }
        submittedDataLength={submittedTranscriptLength}
        backendCommsLog={backendCommsLog}
        outputSet1Received={!!summaryData}
        outputSet1FieldCount={summaryData ?
          Object.values(summaryData).filter(value => value !== null && String(value).trim() !== '').length :
          null
        }
        outputSet2Received={!!analysisData && analysisData !== null && analysisData.length > 0}
        outputSet2ApproxLength={analysisData ? analysisData.length : null}
        clientEventsLog={clientEventsLog}
      />
    </div>
  );
}