"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Mic, X, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { UltravoxSession } from 'ultravox-client';
import DevTray from "@/components/DevTray";
import VoiceActivityIndicator from "@/components/VoiceActivityIndicator";

// Configure axios with retries
axios.defaults.timeout = 30000;

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

// Your correct Cloud Run URL
const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL ||
  'https://ai-medical-intake-service-191450583446.us-central1.run.app';

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
  const [uiState, setUiState] = useState<'idle' | 'requesting_permissions' | 'initiating' | 'interviewing' | 'processing_transcript' | 'displaying_results' | 'error'>('idle');
  const [uvSession, setUvSession] = useState<any>(null);
  const [callId, setCallId] = useState<string>("");
  const [isInterviewActive, setIsInterviewActive] = useState<boolean>(false);
  const [uvStatus, setUvStatus] = useState<string>("");
  const [currentTranscript, setCurrentTranscript] = useState<Utterance[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [analysisData, setAnalysisData] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [hasAudioPermission, setHasAudioPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const { toast } = useToast();
  const pendingRequestsRef = useRef<number>(0);

  // Enhanced microphone permission check
  const checkMicrophonePermission = async (): Promise<boolean> => {
    try {
      // First check if we already have permission
      if (navigator.permissions) {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (permission.state === 'granted') {
          setHasAudioPermission(true);
          return true;
        } else if (permission.state === 'denied') {
          setHasAudioPermission(false);
          setErrorMessage("Microphone access denied. Please enable microphone permissions in your browser settings and refresh the page.");
          return false;
        }
      }

      // If permission is not determined, request it
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Permission granted, stop the stream immediately
      stream.getTracks().forEach(track => track.stop());
      setHasAudioPermission(true);
      logClientEvent("Microphone permission granted");
      return true;
    } catch (error: any) {
      console.error("Microphone permission error:", error);
      setHasAudioPermission(false);

      let errorMsg = "Microphone access error: ";
      if (error.name === 'NotAllowedError') {
        errorMsg += "Permission denied. Please allow microphone access and try again.";
      } else if (error.name === 'NotFoundError') {
        errorMsg += "No microphone found. Please connect a microphone.";
      } else if (error.name === 'NotReadableError') {
        errorMsg += "Microphone is being used by another application.";
      } else {
        errorMsg += error.message || "Unknown error occurred.";
      }

      setErrorMessage(errorMsg);
      logClientEvent(`Microphone permission error: ${errorMsg}`);
      return false;
    }
  };

  // Enhanced shouldEndConversation function (backup detection)
  const shouldEndConversation = (message: any): boolean => {
    if (!message) return false;

    // Check for explicit hangUp tool calls
    if (message.toolCalls && Array.isArray(message.toolCalls)) {
      const hangUpCall = message.toolCalls.find((call: any) => {
        if (!call) return false;

        const toolName = call.toolName || call.name || '';
        return toolName.toLowerCase().includes('hangup') ||
          toolName.toLowerCase().includes('hang_up') ||
          toolName.toLowerCase().includes('hang-up');
      });

      if (hangUpCall) {
        console.log("Found hangUp tool call in message:", hangUpCall);
        return true;
      }
    }

    // Check message text for end phrases
    const textToCheck = message.content || message.text || '';
    if (typeof textToCheck === 'string') {
      const lowerText = textToCheck.toLowerCase();
      const endPhrases = [
        'thank you for completing', 'thank you for your time',
        'that concludes', 'interview complete', 'interview is complete',
        'have a great day', 'have a good day', 'take care',
        'goodbye', 'provider will review', 'doctor will see you',
        'staff will be with you', 'submitted for review',
        'all done', 'finished', 'complete'
      ];

      for (const phrase of endPhrases) {
        if (lowerText.includes(phrase)) {
          console.log(`Found end phrase: "${phrase}"`);
          return true;
        }
      }
    }

    return false;
  };

  // Network connectivity check
  const checkApiConnectivity = async () => {
    try {
      logClientEvent('Testing API connectivity');
      const response = await axios.get(`${API_BASE_URL}/health`, { timeout: 10000 });
      if (!isOnline) setIsOnline(true);
      logApiCall('Backend', 'GET /health', 'success', response.status);
      return true;
    } catch (error) {
      console.warn('API connectivity test failed:', error);
      logClientEvent(`API connectivity test failed: ${error}`);
      logApiCall('Backend', 'GET /health', 'failed');
      setIsOnline(false);
      return false;
    }
  };

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      console.log('Network connection restored');
      setIsOnline(true);
      checkApiConnectivity();
    };

    const handleOffline = () => {
      console.log('Network connection lost');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial connectivity check
    if (navigator.onLine) {
      checkApiConnectivity();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOnline]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (uvSession) {
        try {
          console.log("Cleaning up Ultravox session on unmount");
          uvSession.leaveCall();
        } catch (error) {
          console.error("Error cleaning up Ultravox session:", error);
        }
      }
    };
  }, [uvSession]);

  const initUltravoxSession = async (joinUrl: string) => {
    try {
      logClientEvent("Initializing Ultravox session");

      // Create session with proper configuration
      const session = new UltravoxSession({
        experimentalMessages: true // Enable experimental messages for hangUp detection
      });
      setUvSession(session);

      // Status change handler
      const handleStatusChange = (event: any) => {
        const status = typeof event === 'string' ? event :
          event?.data || event?.status || session.status || 'unknown';

        logClientEvent(`Ultravox status: ${status}`);
        setUvStatus(status);

        const activeStates = ['idle', 'listening', 'thinking', 'speaking', 'connected', 'ready'];

        if (status === 'disconnected') {
          console.log("🔌 Ultravox session disconnected");
          setIsInterviewActive(false);

          // Auto-submit transcript if we have data and aren't already processing
          if (uiState !== 'processing_transcript' && uiState !== 'displaying_results' && currentTranscript.length > 0) {
            console.log("📤 Auto-submitting transcript after disconnection");
            setTimeout(() => assembleAndSubmitTranscript(), 500);
          } else if (currentTranscript.length === 0) {
            setUiState('idle');
          }
        } else if (activeStates.includes(status.toLowerCase())) {
          setUiState('interviewing');
          setIsInterviewActive(true);
        }
      };

      // Enhanced transcript handler
      const handleTranscript = (event: any) => {
        try {
          console.log("📝 Transcript event received:", event);

          if (session.transcripts && Array.isArray(session.transcripts)) {
            const processedCount = currentTranscript.length;
            const newTranscripts = session.transcripts.slice(processedCount).filter((transcript: any) => {
              return transcript &&
                typeof transcript.text === 'string' &&
                transcript.text.trim() !== '' &&
                transcript.isFinal !== false;
            });

            console.log(`📝 Found ${newTranscripts.length} new transcripts to process`);

            if (newTranscripts.length > 0) {
              newTranscripts.forEach((transcript: any) => {
                const speaker = transcript.speaker === 'user' ? 'user' : 'agent';
                const utterance = { speaker, text: transcript.text.trim() };

                console.log(`➕ Adding transcript: ${speaker}: ${utterance.text.substring(0, 50)}...`);

                setCurrentTranscript(prev => {
                  const exists = prev.some(u => u.speaker === speaker && u.text === utterance.text);
                  if (exists) return prev;
                  return [...prev, utterance];
                });
              });
            }
          }
        } catch (err) {
          console.error("❌ Error processing transcript:", err);
        }
      };

      // CRITICAL: Tool call detection via experimental messages
      const handleExperimentalMessage = (event: any) => {
        try {
          const message = event?.data || event;
          console.log("🔧 Experimental message received:", message);

          if (message && typeof message === 'object') {
            const messageStr = JSON.stringify(message).toLowerCase();

            // Check for hangUp tool calls (multiple possible formats)
            const hangupIndicators = [
              'hangup', 'hang_up', 'hang-up',
              '"toolname":"hangup"', '"name":"hangup"',
              '"tool_name":"hangup"', '"function":"hangup"'
            ];

            const foundHangup = hangupIndicators.some(indicator => messageStr.includes(indicator));

            if (foundHangup) {
              console.log("🚨 DETECTED HANGUP TOOL CALL - Agent wants to end call!");
              logClientEvent("🚨 Agent invoked hangUp tool - ending interview automatically");

              // End the interview after a delay to let final audio play
              setTimeout(() => {
                if (uiState === 'interviewing' && isInterviewActive) {
                  console.log("🔚 Auto-ending interview due to hangUp tool call");
                  handleEndInterview();
                }
              }, 2000);
              return;
            }

            // Check for completion phrases in experimental messages
            const completionIndicators = [
              'interview complete', 'interview is complete',
              'thank you for completing', 'that concludes',
              'all done', 'finished with questions'
            ];

            const foundCompletion = completionIndicators.some(indicator => messageStr.includes(indicator));

            if (foundCompletion) {
              console.log("✅ DETECTED COMPLETION PHRASE in experimental message");
              logClientEvent("✅ Agent indicated interview completion");

              setTimeout(() => {
                if (uiState === 'interviewing' && isInterviewActive) {
                  console.log("🔚 Auto-ending interview due to completion phrase");
                  handleEndInterview();
                }
              }, 3000);
              return;
            }
          }
        } catch (err) {
          console.error("❌ Error processing experimental message:", err);
        }
      };

      // Error handler
      const handleError = (event: any) => {
        const errorObj = event?.error || event;
        console.error("❌ Ultravox error:", errorObj);

        if (uiState === 'interviewing' || uiState === 'initiating') {
          setErrorMessage(errorObj?.message || "There was a problem with the interview. Please try again.");
          toast({
            title: "Interview Error",
            description: errorObj?.message || "There was a problem with the interview. Please try again.",
            variant: "destructive"
          });
          setUiState('error');
        }
      };

      // Set up ALL event listeners
      const eventListeners = [
        { event: 'status', handler: handleStatusChange },
        { event: 'transcripts', handler: handleTranscript },
        { event: 'experimental_message', handler: handleExperimentalMessage }, // 🔑 CRITICAL
        { event: 'error', handler: handleError }
      ];

      // Clean up any existing listeners
      eventListeners.forEach(({ event, handler }) => {
        try {
          session.removeEventListener(event, handler);
        } catch (e) {
          // Ignore - no existing listeners
        }
      });

      // Add new listeners
      eventListeners.forEach(({ event, handler }) => {
        session.addEventListener(event, handler);
        console.log(`✅ Added event listener for: ${event}`);
      });

      console.log("🔗 Joining Ultravox call...");
      await session.joinCall(joinUrl);
      console.log("✅ Successfully joined Ultravox call");
      logClientEvent("Successfully joined Ultravox call");

      // Set interviewing state
      setUiState('interviewing');
      setIsInterviewActive(true);

      // Unmute microphone
      try {
        if (typeof session.unmuteMic === 'function') {
          session.unmuteMic();
          console.log("🎤 Microphone unmuted");
        }
      } catch (micError) {
        console.error("❌ Error unmuting microphone:", micError);
      }

      return true;
    } catch (error: any) {
      console.error("❌ Error initializing Ultravox session:", error);
      setErrorMessage(error?.message || "Could not connect to the interview service. Please try again.");
      toast({
        title: "Connection Error",
        description: error?.message || "Could not connect to the interview service. Please try again.",
        variant: "destructive"
      });
      setUiState('error');
      return false;
    }
  };

  const handleStartInterview = async () => {
    // Reset previous data
    setSummaryData(null);
    setAnalysisData(null);
    setCurrentTranscript([]);
    setErrorMessage("");

    // Check for internet connection first
    if (!navigator.onLine) {
      setErrorMessage("No internet connection. Please check your connection and try again.");
      toast({
        title: "No Internet Connection",
        description: "Please check your connection and try again.",
        variant: "destructive"
      });
      return;
    }

    try {
      // First, request microphone permissions
      setUiState('requesting_permissions');
      logClientEvent("Requesting microphone permissions");

      const hasPermission = await checkMicrophonePermission();
      if (!hasPermission) {
        setUiState('error');
        toast({
          title: "Microphone Access Required",
          description: errorMessage || "Microphone access is required for the interview. Please grant permission.",
          variant: "destructive"
        });
        return;
      }

      setUiState('initiating');
      logClientEvent("Starting interview initialization");

      pendingRequestsRef.current++;

      logClientEvent("Calling initiate-intake API");
      const response = await axios.post(`${API_BASE_URL}/api/v1/initiate-intake`, {});
      logApiCall('Backend', 'POST /api/v1/initiate-intake', 'success', response.status);

      const { joinUrl, callId: newCallId } = response.data;
      if (!joinUrl || !newCallId) {
        logClientEvent("Invalid response - missing joinUrl or callId");
        throw new Error("Invalid response from server. Missing joinUrl or callId.");
      }

      setCallId(newCallId);
      logClientEvent(`Call ID received: ${newCallId.substring(0, 8)}...`);

      const success = await initUltravoxSession(joinUrl);
      if (!success) {
        logClientEvent("Failed to initialize Ultravox session");
        throw new Error("Failed to initialize interview session.");
      }

      logClientEvent("Interview started successfully");
    } catch (error: any) {
      console.error("Error starting interview:", error);
      logClientEvent(`Error starting interview: ${error.message || 'Unknown error'}`);

      let errorMessage = "An unexpected error occurred. Please try again.";
      if (error.message) {
        errorMessage = error.message;
      } else if (axios.isAxiosError(error)) {
        if (!error.response) {
          errorMessage = "Could not connect to the server. Please check your internet connection.";
        } else {
          errorMessage = `Server error (${error.response.status}). Please try again later.`;
        }
        logApiCall('Backend', 'POST /api/v1/initiate-intake', 'failed', error.response?.status);
      }

      setErrorMessage(errorMessage);
      toast({
        title: "Interview Error",
        description: errorMessage,
        variant: "destructive"
      });
      setUiState('error');
    } finally {
      pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
    }
  };

  const handleEndInterview = async () => {
    if (uiState === 'processing_transcript' || uiState === 'displaying_results') {
      console.log("⚠️ Already processing or displaying results. Ignoring duplicate call.");
      return;
    }

    console.log("🔚 ENDING INTERVIEW - Starting transcript submission to Cloud Run");
    logClientEvent("Ending interview and preparing transcript for Cloud Run backend");
    setIsInterviewActive(false);

    // Leave Ultravox call first
    try {
      if (uvSession && typeof uvSession.leaveCall === 'function') {
        console.log("📞 Calling uvSession.leaveCall()...");
        await uvSession.leaveCall();
        console.log("✅ Successfully left Ultravox call");
      }
    } catch (error) {
      console.error("❌ Error leaving Ultravox call:", error);
    }

    // Wait for any final transcript events
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Debug current transcript state
    console.log(`📊 Current transcript length: ${currentTranscript.length}`);
    if (currentTranscript.length > 0) {
      console.log("📝 Transcript preview:");
      currentTranscript.slice(0, 3).forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.speaker}: "${item.text.substring(0, 50)}..."`);
      });

      console.log("🚀 SENDING TRANSCRIPT TO CLOUD RUN BACKEND");
      console.log(`🏁 Target: ${API_BASE_URL}/api/v1/submit-transcript`);
      await assembleAndSubmitTranscript();
    } else {
      // Try session fallback
      if (uvSession && uvSession.transcripts && Array.isArray(uvSession.transcripts) && uvSession.transcripts.length > 0) {
        console.log("📝 Using session transcripts as fallback");
        const sessionTranscripts = uvSession.transcripts
          .filter((t: any) => t && t.text && typeof t.text === 'string')
          .map((t: any) => ({
            speaker: t.speaker === 'user' ? 'user' : 'agent',
            text: t.text.trim()
          }));

        if (sessionTranscripts.length > 0) {
          setCurrentTranscript(sessionTranscripts);
          console.log("🚀 SENDING SESSION TRANSCRIPT TO CLOUD RUN");
          await assembleAndSubmitTranscript();
          return;
        }
      }

      console.log("❌ No transcript data found");
      setErrorMessage("No conversation data was recorded. Please try starting a new interview.");
      toast({
        title: "Interview Ended",
        description: "No conversation data was recorded. Please try starting a new interview."
      });
      setUiState('idle');
    }
  };

  const assembleAndSubmitTranscript = async () => {
    logClientEvent("Starting transcript submission");

    setSummaryData(null);
    setAnalysisData(null);
    setUiState('processing_transcript');

    if (currentTranscript.length === 0) {
      logClientEvent("No transcript data to submit");
      setErrorMessage("No conversation data was recorded.");
      toast({
        title: "Missing Data",
        description: "No conversation data was recorded.",
        variant: "destructive"
      });
      setUiState('error');
      return;
    }

    if (!callId) {
      logClientEvent("Missing call ID");
      setErrorMessage("Missing call identifier.");
      toast({
        title: "Missing Identifier",
        description: "Missing call identifier.",
        variant: "destructive"
      });
      setUiState('error');
      return;
    }

    try {
      const fullTranscript = currentTranscript.map(utterance =>
        `${utterance.speaker === 'agent' ? 'Agent' : 'User'}: ${utterance.text}`
      ).join('\n');

      logClientEvent(`Submitting transcript (${fullTranscript.length} chars)`);
      logClientEvent(`First 200 chars of transcript: ${fullTranscript.substring(0, 200)}...`);

      pendingRequestsRef.current++;

      const payload = { callId: callId, transcript: fullTranscript };
      logClientEvent("Preparing POST request payload");

      logApiCall('Backend', 'POST /api/v1/submit-transcript', 'pending');
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/submit-transcript`,
        payload,
        {
          timeout: 60000,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      logApiCall('Backend', 'POST /api/v1/submit-transcript', 'success', response.status);

      logClientEvent(`API response received: ${response.status}`);
      const { summary, analysis } = response.data;

      if (!summary || !analysis) {
        logClientEvent("Invalid response - missing summary or analysis");
        throw new Error("Invalid response from server. Missing summary or analysis.");
      }

      const validatedSummary: SummaryData = {
        chiefComplaint: summary.chiefComplaint || null,
        historyOfPresentIllness: summary.historyOfPresentIllness || null,
        associatedSymptoms: summary.associatedSymptoms || null,
        pastMedicalHistory: summary.pastMedicalHistory || null,
        medications: summary.medications || null,
        allergies: summary.allergies || null,
        notesOnInteraction: summary.notesOnInteraction || null
      };

      logClientEvent("Setting summary and analysis data");
      logClientEvent(`Analysis length: ${analysis.length} chars`);

      setSummaryData(validatedSummary);
      setAnalysisData(analysis);

      // Force a state update to ensure UI changes
      setTimeout(() => {
        logClientEvent("Changing UI state to displaying_results");
        setUiState('displaying_results');
        toast({
          title: "Interview Complete",
          description: "Your medical intake interview has been processed successfully."
        });
      }, 300);

    } catch (error: any) {
      logClientEvent(`Error submitting transcript: ${error.message || 'Unknown error'}`);
      logApiCall('Backend', 'POST /api/v1/submit-transcript', 'failed', error.response?.status);

      // Create fallback data for demo purposes
      const fallbackSummary: SummaryData = {
        chiefComplaint: "Technical Issue - Please retry",
        historyOfPresentIllness: "There was a technical issue processing your interview.",
        associatedSymptoms: null,
        pastMedicalHistory: null,
        medications: null,
        allergies: null,
        notesOnInteraction: `Note: This is fallback data due to processing error: ${error.message || "Unknown error"}`
      };

      logClientEvent("Setting fallback summary and analysis data");
      setSummaryData(fallbackSummary);
      setAnalysisData("This is fallback analysis data. Please retry your interview for accurate results.");

      setTimeout(() => {
        logClientEvent("Changing UI state to displaying_results (fallback)");
        setUiState('displaying_results');
        setErrorMessage(error.message || "There was an issue processing your interview. Please try again.");
        toast({
          title: "Processing Issue",
          description: error.message || "There was an issue processing your interview. Please try again.",
          variant: "destructive"
        });
      }, 300);

    } finally {
      pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
    }
  };

  const resetAll = () => {
    console.log("Resetting application state");
    if (uvSession) {
      try {
        uvSession.leaveCall();
      } catch (error) {
        console.error("Error leaving call during reset:", error);
      }
    }
    setUvSession(null);
    setCallId("");
    setIsInterviewActive(false);
    setUvStatus("");
    setCurrentTranscript([]);
    setSummaryData(null);
    setAnalysisData(null);
    setErrorMessage("");
    setUiState('idle');
  };

  const resetAllAndStartNew = () => {
    console.log("Starting new interview");
    resetAll();
    setTimeout(() => handleStartInterview(), 100);
  };

  // Debug function for audio state
  const debugAudioState = () => {
    console.log("=== AUDIO DEBUG STATE ===");
    console.log("UV Session:", !!uvSession);
    console.log("UV Status:", uvStatus);
    console.log("Is Interview Active:", isInterviewActive);
    console.log("Has Audio Permission:", hasAudioPermission);
    console.log("UI State:", uiState);
    console.log("Transcript Length:", currentTranscript.length);
    console.log("Call ID:", callId);
    console.log("Is Online:", isOnline);
    console.log("Error Message:", errorMessage);

    if (uvSession) {
      console.log("Mic Muted:", uvSession.isMicMuted?.());
      console.log("Speaker Muted:", uvSession.isSpeakerMuted?.());
      console.log("Session Transcripts Length:", uvSession.transcripts?.length || 0);
    }

    // Test audio context
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log("Audio Context State:", audioContext.state);
    } catch (e) {
      console.log("Audio Context Error:", e);
    }

    // Test microphone access
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        console.log("Microphone test: SUCCESS");
        stream.getTracks().forEach(track => track.stop());
      })
      .catch((error) => {
        console.log("Microphone test: FAILED", error);
      });

    console.log("=== END DEBUG ===");
  };

  const formatSummaryField = (value: string | null | undefined) => {
    if (value === null || value === undefined || value.trim() === '') {
      return "Not reported";
    }
    return value;
  };

  const getStatusText = () => {
    switch (uiState) {
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
        return errorMessage || "Error occurred - please try again";
      default:
        return "Loading...";
    }
  };

  // Prepare DevTray props
  const clientEventsLog = useRef<string[]>([]).current;
  const logClientEvent = (event: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `${timestamp}: ${event}`;
    console.log(logEntry);
    clientEventsLog.unshift(logEntry);
    if (clientEventsLog.length > 50) clientEventsLog.pop();
  };

  const backendCommsLog = useRef<Array<{
    timestamp: string;
    serviceTarget: string;
    method: string;
    outcome: string;
    statusCode?: number;
  }>>([]).current;

  // Log API calls for DevTray
  const logApiCall = (target: string, method: string, outcome: string, statusCode?: number) => {
    const timestamp = new Date().toLocaleTimeString();
    backendCommsLog.unshift({ timestamp, serviceTarget: target, method, outcome, statusCode });
    if (backendCommsLog.length > 20) backendCommsLog.pop();
    console.log(`API Call: ${target} ${method} - ${outcome}${statusCode ? ` (${statusCode})` : ''}`);
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Debug button for development */}
      {process.env.NODE_ENV === 'development' && (
        <button
          onClick={debugAudioState}
          className="fixed top-4 right-4 bg-red-500 text-white p-2 rounded z-50 text-xs font-mono"
          style={{ zIndex: 9999 }}
        >
          Debug Audio
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
          {/* Connection status only shown during interview or when there are issues */}
          {(uiState === 'interviewing' || uiState === 'initiating' || !isOnline) && (
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${!isOnline ? 'bg-red-500 animate-pulse' :
                  uiState === 'initiating' ? 'bg-orange-400 animate-pulse' :
                    'bg-green-500'
                }`} />
              <span className="text-sm text-gray-500">
                {!isOnline ? 'Connection Lost' :
                  uiState === 'initiating' ? 'Connecting...' :
                    'Connected'}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Add Voice Activity Indicator */}
      <VoiceActivityIndicator
        uvStatus={uvStatus}
        isInterviewActive={isInterviewActive}
      />

      {/* DevTray */}
      <DevTray
        appPhase={uiState}
        sessionStatus={uvStatus}
        sessionId={callId}
        isSessionActive={isInterviewActive}
        micStatus={uvSession ? 'active' : 'inactive'}
        utteranceCount={currentTranscript.length}
        lastUtteranceSource={currentTranscript.length > 0 ? currentTranscript[currentTranscript.length - 1].speaker : null}
        submittedDataLength={currentTranscript.length > 0 ? currentTranscript.map(u => u.text).join('').length : null}
        backendCommsLog={backendCommsLog}
        outputSet1Received={!!summaryData}
        outputSet1FieldCount={summaryData ? Object.keys(summaryData).filter(k => summaryData[k] !== null).length : null}
        outputSet2Received={!!analysisData}
        outputSet2ApproxLength={analysisData ? analysisData.length : null}
        clientEventsLog={clientEventsLog}
      />

      <main className="flex-1">
        <section className="container mx-auto py-12 md:py-24 px-4 md:px-6">
          <div className="grid grid-cols-1 gap-12">
            {/* Title and Description */}
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

              {/* Language Support Section */}
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

            {/* Main Interface */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Audio Interaction Area */}
              <div className="relative h-[400px] rounded-lg overflow-hidden bg-gradient-to-br from-teal-50 to-blue-50 border border-teal-100 shadow-md flex flex-col">
                <div className="p-6 flex-1 flex flex-col items-center justify-center">
                  <div className="text-center space-y-4">
                    <p className="text-sm font-medium text-gray-600 mb-6">
                      {getStatusText()}
                    </p>

                    {uiState === 'idle' && (
                      <div className="space-y-6">
                        <button
                          onClick={handleStartInterview}
                          disabled={hasAudioPermission === false}
                          className="w-24 h-24 mx-auto bg-teal-500 rounded-full flex items-center justify-center hover:bg-teal-600 transition-colors cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                          aria-label="Start Medical Intake"
                        >
                          <Mic size={32} className="text-white" />
                        </button>
                        <Button
                          onClick={handleStartInterview}
                          size="lg"
                          className="bg-teal-500 hover:bg-teal-600"
                          disabled={hasAudioPermission === false}
                        >
                          Start Medical Intake
                        </Button>
                        {hasAudioPermission === false && (
                          <p className="text-red-500 text-sm mt-2">
                            Microphone access required to start interview
                          </p>
                        )}
                      </div>
                    )}

                    {uiState === 'requesting_permissions' && (
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

                    {uiState === 'initiating' && (
                      <div className="space-y-6">
                        <div className="w-24 h-24 mx-auto bg-teal-100 rounded-full flex items-center justify-center">
                          <Loader2 size={32} className="text-teal-500 animate-spin" />
                        </div>
                        <p className="text-gray-500">Connecting to AI assistant...</p>
                      </div>
                    )}

                    {uiState === 'interviewing' && (
                      <div className="space-y-6">
                        <InterviewPulsingAnimation />
                        <div className="space-y-2">
                          <p className="text-green-600 font-medium">Interview Active</p>
                          <p className="text-sm text-gray-500">Status: {uvStatus}</p>
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

                    {uiState === 'processing_transcript' && (
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

                    {uiState === 'displaying_results' && (
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

                    {uiState === 'error' && (
                      <div className="space-y-6">
                        <div className="w-24 h-24 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                          <X size={32} className="text-red-500" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-red-600 font-medium">Error Occurred</p>
                          {errorMessage && (
                            <p className="text-sm text-red-500 px-4">{errorMessage}</p>
                          )}
                          <div className="space-y-2">
                            <Button
                              onClick={resetAll}
                              variant="outline"
                              size="sm"
                            >
                              Try Again
                            </Button>
                            {hasAudioPermission === false && (
                              <Button
                                onClick={checkMicrophonePermission}
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

                    {currentTranscript.length > 0 && (
                      <div className="mt-6">
                        <p className="text-xs text-gray-500 mb-2">
                          Conversation: {currentTranscript.length} messages
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Results Area */}
              <div className={`space-y-8 ${!(uiState === 'processing_transcript' || uiState === 'displaying_results') ? 'opacity-50' : ''}`}>
                {/* Summary Box */}
                <div className="bg-white rounded-lg border shadow-sm">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Medical Summary</h3>
                    {uiState === 'processing_transcript' ? (
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                      </div>
                    ) : summaryData ? (
                      <div className="space-y-4 text-sm">
                        {summaryData.chiefComplaint && (
                          <div>
                            <strong>Chief Complaint:</strong>
                            <p className="mt-1 text-gray-600">{summaryData.chiefComplaint}</p>
                          </div>
                        )}
                        {summaryData.historyOfPresentIllness && (
                          <div>
                            <strong>History of Present Illness:</strong>
                            <p className="mt-1 text-gray-600">{summaryData.historyOfPresentIllness}</p>
                          </div>
                        )}
                        {summaryData.associatedSymptoms && (
                          <div>
                            <strong>Associated Symptoms:</strong>
                            <p className="mt-1 text-gray-600">{formatSummaryField(summaryData.associatedSymptoms)}</p>
                          </div>
                        )}
                        {summaryData.pastMedicalHistory && (
                          <div>
                            <strong>Past Medical History:</strong>
                            <p className="mt-1 text-gray-600">{formatSummaryField(summaryData.pastMedicalHistory)}</p>
                          </div>
                        )}
                        {summaryData.medications && (
                          <div>
                            <strong>Medications:</strong>
                            <p className="mt-1 text-gray-600">{formatSummaryField(summaryData.medications)}</p>
                          </div>
                        )}
                        {summaryData.allergies && (
                          <div>
                            <strong>Allergies:</strong>
                            <p className="mt-1 text-gray-600">{formatSummaryField(summaryData.allergies)}</p>
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

                {/* Analysis Box */}
                <div className="bg-white rounded-lg border shadow-sm">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Clinical Analysis</h3>
                    {uiState === 'processing_transcript' ? (
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-4/5" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/5" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
                      </div>
                    ) : analysisData ? (
                      <div className="text-sm text-gray-600">
                        {analysisData.split('\n').map((paragraph, index) => (
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

        {/* How It Works Section */}
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

        {/* Integration Options Section */}
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

        {/* About BuildAI Section */}
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