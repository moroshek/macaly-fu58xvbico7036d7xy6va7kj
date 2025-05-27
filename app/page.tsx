"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Mic, X, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { UltravoxSession } from 'ultravox-client';
import DevTray from "@/components/DevTray";
import VoiceActivityIndicator from "@/components/VoiceActivityIndicator";

// Import utility modules
import { debugUltravoxState, testWebSocketConnection, debugAudioState } from "@/lib/ultravox-debug";
import { testNetworkConnectivity, checkApiConnectivity, setupNetworkListeners } from "@/lib/network-utils";
import { checkBrowserCompatibility, checkMicrophonePermissions } from "@/lib/browser-compat";

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

  // Network setup
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const cleanup = setupNetworkListeners(
      (online) => setIsOnline(online),
      async () => {
        try {
          logClientEvent('Network connection restored');
          const result = await checkApiConnectivity(API_BASE_URL);
          if (result.success) {
            setIsOnline(true);
            logApiCall('Backend', 'GET /health', 'success', result.status);
          }
        } catch (error) {
          console.warn('API connectivity test failed:', error);
          logClientEvent(`API connectivity test failed: ${error}`);
          logApiCall('Backend', 'GET /health', 'failed');
        }
      },
      () => logClientEvent('Network connection lost')
    );

    if (navigator.onLine) {
      checkApiConnectivity(API_BASE_URL)
        .then(result => {
          if (result.success) setIsOnline(true);
          logApiCall('Backend', 'GET /health', result.success ? 'success' : 'failed', result.status);
        })
        .catch(error => {
          console.warn('Initial API connectivity test failed:', error);
          logClientEvent(`Initial API connectivity test failed: ${error}`);
          logApiCall('Backend', 'GET /health', 'failed');
        });
    }

    return cleanup;
  }, []);

  // CRITICAL FIX: Ultravox event handlers with proper state access
  useEffect(() => {
    if (!uvSession) return;

    console.log("🔧 Setting up Ultravox event handlers with current state access");

    const handleStatusChange = (event: any) => {
      const status = typeof event === 'string' ? event :
        event?.data || event?.status || uvSession.status || 'unknown';

      logClientEvent(`Ultravox status: ${status}`);
      setUvStatus(status);

      const activeStates = ['idle', 'listening', 'thinking', 'speaking', 'connected', 'ready'];

      if (status === 'disconnected') {
        console.log("🔌 Ultravox session disconnected");
        setIsInterviewActive(false);

        // Check current state values using functional updates
        setUiState(currentUiState => {
          setCurrentTranscript(currentTranscriptState => {
            if (currentUiState !== 'processing_transcript' &&
              currentUiState !== 'displaying_results' &&
              currentTranscriptState.length > 0) {
              console.log("📤 Auto-submitting transcript after disconnection");
              setTimeout(() => assembleAndSubmitTranscript(), 500);
            } else if (currentTranscriptState.length === 0) {
              setUiState('idle');
            }
            return currentTranscriptState;
          });
          return currentUiState;
        });
      } else if (activeStates.includes(status.toLowerCase())) {
        setUiState('interviewing');
        setIsInterviewActive(true);
      }
    };

    const handleExperimentalMessage = (event: any) => {
      try {
        const message = event?.data || event;
        console.log("🔧 Experimental message received:", message);

        if (message && typeof message === 'object') {
          const messageStr = JSON.stringify(message).toLowerCase();

          const hangupIndicators = [
            'hangup', 'hang_up', 'hang-up',
            '"toolname":"hangup"', '"name":"hangup"',
            '"tool_name":"hangup"', '"function":"hangup"'
          ];

          const foundHangup = hangupIndicators.some(indicator => messageStr.includes(indicator));

          if (foundHangup) {
            console.log("🚨 DETECTED HANGUP TOOL CALL - Agent wants to end call!");
            logClientEvent("🚨 Agent invoked hangUp tool - ending interview automatically");

            setTimeout(() => {
              setUiState(currentUiState => {
                setIsInterviewActive(currentActiveState => {
                  if (currentUiState === 'interviewing' && currentActiveState) {
                    console.log("🔚 Auto-ending interview due to hangUp tool call");
                    handleEndInterview();
                  }
                  return currentActiveState;
                });
                return currentUiState;
              });
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
            console.log("✅ DETECTED COMPLETION PHRASE in experimental message");
            logClientEvent("✅ Agent indicated interview completion");

            setTimeout(() => {
              setUiState(currentUiState => {
                setIsInterviewActive(currentActiveState => {
                  if (currentUiState === 'interviewing' && currentActiveState) {
                    console.log("🔚 Auto-ending interview due to completion phrase");
                    handleEndInterview();
                  }
                  return currentActiveState;
                });
                return currentUiState;
              });
            }, 3000);
          }
        }
      } catch (err) {
        console.error("❌ Error processing experimental message:", err);
      }
    };

    try {
      uvSession.addEventListener('status', handleStatusChange);
      uvSession.addEventListener('experimental_message', handleExperimentalMessage);
      console.log("✅ Ultravox event listeners added successfully");
    } catch (error) {
      console.error("❌ Error adding Ultravox event listeners:", error);
    }

    return () => {
      try {
        uvSession.removeEventListener('status', handleStatusChange);
        uvSession.removeEventListener('experimental_message', handleExperimentalMessage);
        console.log("🧹 Ultravox event listeners cleaned up");
      } catch (error) {
        console.error("❌ Error removing Ultravox event listeners:", error);
      }
    };
  }, [uvSession]);

  // Simplified session initialization
  const initUltravoxSession = async (joinUrl: string) => {
    try {
      logClientEvent("Starting Ultravox initialization");

      if (typeof UltravoxSession !== 'function') {
        throw new Error("UltravoxSession is not available - check import");
      }

      try {
        const wsTestResult = await testWebSocketConnection(joinUrl);
        if (!wsTestResult) {
          logClientEvent("WebSocket connectivity test failed");
        }
      } catch (wsError) {
        console.warn("WebSocket test failed but continuing:", wsError);
        logClientEvent(`WebSocket test failed: ${wsError}`);
      }

      logClientEvent("Initializing Ultravox session");

      const session = new UltravoxSession({
        experimentalMessages: true as any
      });

      // Enhanced transcript handler
      const handleTranscript = (event: any) => {
        try {
          console.log("📝 Transcript event received:", event);

          if (session.transcripts && Array.isArray(session.transcripts)) {
            setCurrentTranscript(prev => {
              const newTranscripts = session.transcripts.filter((transcript: any) => {
                return transcript &&
                  typeof transcript.text === 'string' &&
                  transcript.text.trim() !== '' &&
                  transcript.isFinal !== false;
              });

              if (newTranscripts.length > prev.length) {
                console.log(`📝 Found ${newTranscripts.length - prev.length} new transcripts`);
                return newTranscripts.map((transcript: any) => ({
                  speaker: transcript.speaker === 'user' ? 'user' : 'agent',
                  text: transcript.text.trim()
                }));
              }
              return prev;
            });
          }
        } catch (err) {
          console.error("❌ Error processing transcript:", err);
        }
      };

      const handleError = (event: any) => {
        const errorObj = event?.error || event;
        console.error("❌ Ultravox error:", errorObj);
        setErrorMessage(errorObj?.message || "There was a problem with the interview connection.");
        setUiState('error');
      };

      session.addEventListener('transcripts', handleTranscript);
      session.addEventListener('error', handleError);

      console.log("🔗 Joining Ultravox call...");
      await session.joinCall(joinUrl);
      console.log("✅ Successfully joined Ultravox call");
      logClientEvent("Successfully joined Ultravox call");

      setUvSession(session);
      setUiState('interviewing');
      setIsInterviewActive(true);

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
    setSummaryData(null);
    setAnalysisData(null);
    setCurrentTranscript([]);
    setErrorMessage("");

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
      const browserCompatibility = checkBrowserCompatibility();
      if (!browserCompatibility.compatible) {
        logClientEvent(`Browser compatibility issues: ${browserCompatibility.issues.join(', ')}`);
        setErrorMessage("Your browser doesn't support all required features. Please try a modern browser like Chrome, Edge, or Safari.");
        toast({
          title: "Browser Compatibility Issue",
          description: "Your browser doesn't support all required features. Please try a modern browser.",
          variant: "destructive"
        });
        return;
      }
    } catch (error) {
      console.warn("Browser compatibility check failed:", error);
      logClientEvent(`Browser compatibility check failed: ${error}`);
    }

    try {
      logClientEvent("Testing network connectivity to required services");
      const networkOk = await testNetworkConnectivity();
      if (!networkOk) {
        setErrorMessage("Cannot reach required services. Please check your internet connection or try again later.");
        toast({
          title: "Network Connectivity Issue",
          description: "Cannot reach required services. Please check your connection or try again later.",
          variant: "destructive"
        });
        return;
      }
    } catch (error) {
      console.warn("Network connectivity test failed:", error);
      logClientEvent(`Network connectivity test failed: ${error}`);
    }

    try {
      setUiState('requesting_permissions');
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
        setHasAudioPermission(true);
        logClientEvent("Microphone permission granted");
      } else {
        setHasAudioPermission(false);
        setErrorMessage(errorMsg);
        logClientEvent(`Microphone permission error: ${errorMsg}`);
        setUiState('error');
        toast({
          title: "Microphone Access Required",
          description: errorMsg,
          variant: "destructive"
        });
        return;
      }

      setUiState('initiating');
      logClientEvent("Starting interview initialization");

      pendingRequestsRef.current++;

      try {
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
      } catch (apiError) {
        console.error("Error with API or session:", apiError);
        logClientEvent(`API/session error: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);

        let errorMessage = "An unexpected error occurred. Please try again.";
        if (apiError instanceof Error && apiError.message) {
          errorMessage = apiError.message;
        } else if (axios.isAxiosError(apiError)) {
          if (!apiError.response) {
            errorMessage = "Could not connect to the server. Please check your internet connection.";
          } else {
            errorMessage = `Server error (${apiError.response.status}). Please try again later.`;
          }
          logApiCall('Backend', 'POST /api/v1/initiate-intake', 'failed', apiError.response?.status);
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

    } catch (error: any) {
      console.error("Error starting interview:", error);
      logClientEvent(`Error starting interview: ${error.message || 'Unknown error'}`);

      setErrorMessage("Failed to start interview. Please try again.");
      toast({
        title: "Interview Error",
        description: "Failed to start interview. Please try again.",
        variant: "destructive"
      });
      setUiState('error');
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

    try {
      if (uvSession && typeof uvSession.leaveCall === 'function') {
        console.log("📞 Calling uvSession.leaveCall()...");
        await uvSession.leaveCall();
        console.log("✅ Successfully left Ultravox call");
      }
    } catch (error) {
      console.error("❌ Error leaving Ultravox call:", error);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

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
    if (uiState === 'processing_transcript' || uiState === 'displaying_results') {
      console.log("⚠️ Already processing transcript, ignoring duplicate call");
      return;
    }

    logClientEvent("Starting transcript submission");

    setSummaryData(null);
    setAnalysisData(null);
    setUiState('processing_transcript');

    const validTranscript = currentTranscript.filter(utterance => {
      return utterance &&
        typeof utterance.speaker === 'string' &&
        typeof utterance.text === 'string' &&
        utterance.text.trim().length > 0 &&
        (utterance.speaker === 'user' || utterance.speaker === 'agent');
    });

    if (validTranscript.length === 0) {
      logClientEvent("No valid transcript data to submit");
      setErrorMessage("No conversation data was recorded.");
      toast({
        title: "Missing Data",
        description: "No conversation data was recorded.",
        variant: "destructive"
      });
      setUiState('error');
      return;
    }

    if (!callId || callId.trim().length === 0) {
      logClientEvent("Missing or invalid call ID");
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
      const fullTranscript = validTranscript.map(utterance => {
        const speakerLabel = utterance.speaker === 'agent' ? 'Agent' : 'User';
        return `${speakerLabel}: ${utterance.text.trim()}`;
      }).join('\n');

      if (fullTranscript.length < 10) {
        logClientEvent("Transcript too short to be meaningful");
        setErrorMessage("Conversation too short to process. Please have a longer conversation.");
        toast({
          title: "Insufficient Data",
          description: "Conversation too short to process. Please have a longer conversation.",
          variant: "destructive"
        });
        setUiState('error');
        return;
      }

      logClientEvent(`Submitting transcript (${fullTranscript.length} chars, ${validTranscript.length} utterances)`);
      logClientEvent(`Transcript preview: ${fullTranscript.substring(0, 200)}...`);

      pendingRequestsRef.current++;

      const payload = {
        callId: callId.trim(),
        transcript: fullTranscript
      };

      logClientEvent("Sending POST request to submit-transcript endpoint");
      logApiCall('Backend', 'POST /api/v1/submit-transcript', 'pending');

      const response = await axios.post(
        `${API_BASE_URL}/api/v1/submit-transcript`,
        payload,
        {
          timeout: 120000,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': `${callId}-${Date.now()}`
          }
        }
      );

      logApiCall('Backend', 'POST /api/v1/submit-transcript', 'success', response.status);
      logClientEvent(`Backend response received: ${response.status}`);

      if (!response.data) {
        throw new Error("Empty response from server");
      }

      const { summary, analysis } = response.data;

      if (!summary && !analysis) {
        logClientEvent("Invalid response - missing both summary and analysis");
        throw new Error("Invalid response from server. Missing summary and analysis data.");
      }

      if (summary) {
        const requiredFields = ['chiefComplaint', 'historyOfPresentIllness', 'associatedSymptoms',
          'pastMedicalHistory', 'medications', 'allergies', 'notesOnInteraction'];
        const missingFields = requiredFields.filter(field => !(field in summary));

        if (missingFields.length > 0) {
          logClientEvent(`Summary missing fields: ${missingFields.join(', ')}`);
          missingFields.forEach(field => {
            summary[field] = null;
          });
        }
      }

      const validatedSummary: SummaryData = summary ? {
        chiefComplaint: summary.chiefComplaint || null,
        historyOfPresentIllness: summary.historyOfPresentIllness || null,
        associatedSymptoms: summary.associatedSymptoms || null,
        pastMedicalHistory: summary.pastMedicalHistory || null,
        medications: summary.medications || null,
        allergies: summary.allergies || null,
        notesOnInteraction: summary.notesOnInteraction || null
      } : null;

      const validatedAnalysis = analysis && typeof analysis === 'string' && analysis.trim().length > 0
        ? analysis.trim()
        : null;

      logClientEvent("Setting processed summary and analysis data");
      logClientEvent(`Summary fields present: ${validatedSummary ? Object.keys(validatedSummary).filter(k => validatedSummary[k] !== null).length : 0}`);
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
        setUiState('displaying_results');
      }, 500);

    } catch (error: any) {
      logClientEvent(`Error submitting transcript: ${error.message || 'Unknown error'}`);
      logApiCall('Backend', 'POST /api/v1/submit-transcript', 'failed', error.response?.status);

      console.error("❌ Transcript submission error:", error);

      let errorMessage = "There was an issue processing your interview.";
      let shouldShowFallback = false;

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          errorMessage = "Processing timed out. The server may be overloaded. Please try again.";
        } else if (!error.response) {
          errorMessage = "Could not connect to the processing server. Please check your internet connection.";
        } else if (error.response.status >= 500) {
          errorMessage = "Server error during processing. Please try again later.";
          shouldShowFallback = true;
        } else if (error.response.status === 400) {
          errorMessage = "Invalid interview data. Please start a new interview.";
        } else {
          errorMessage = `Processing error (${error.response.status}). Please try again.`;
        }
      } else if (error.message) {
        errorMessage = error.message;
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
          notesOnInteraction: `Processing failed at ${new Date().toISOString()}. Error: ${errorMessage}`
        };

        setSummaryData(fallbackSummary);
        setAnalysisData("Technical processing error occurred. Please retry the interview for complete analysis.");

        setTimeout(() => {
          setUiState('displaying_results');
          toast({
            title: "Partial Results Available",
            description: "Processing failed but your conversation was recorded. Please try again for full analysis.",
            variant: "destructive"
          });
        }, 500);
      } else {
        setErrorMessage(errorMessage);
        setUiState('error');
        toast({
          title: "Processing Failed",
          description: errorMessage,
          variant: "destructive"
        });
      }

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

  const handleDebugClick = () => {
    try {
      const debugParams = {
        uvSession: uvSession || null,
        uvStatus: uvStatus || '',
        isInterviewActive: Boolean(isInterviewActive),
        hasAudioPermission: hasAudioPermission,
        uiState: uiState || 'unknown',
        currentTranscript: Array.isArray(currentTranscript) ? currentTranscript : [],
        callId: callId || '',
        isOnline: Boolean(isOnline),
        errorMessage: errorMessage || ''
      };

      debugUltravoxState(debugParams);
      debugAudioState();
      logClientEvent("Manual debug triggered");
    } catch (error) {
      console.error('Debug function error:', error);
      logClientEvent(`Debug function failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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

  // Logging utilities
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

  const logApiCall = (target: string, method: string, outcome: string, statusCode?: number) => {
    const timestamp = new Date().toLocaleTimeString();
    backendCommsLog.unshift({ timestamp, serviceTarget: target, method, outcome, statusCode });
    if (backendCommsLog.length > 20) backendCommsLog.pop();
    console.log(`API Call: ${target} ${method} - ${outcome}${statusCode ? ` (${statusCode})` : ''}`);
  };

  // Development debugging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      (window as any).debugUltravox = {
        checkState: () => {
          console.log("Current State:", {
            uiState,
            uvStatus,
            isInterviewActive,
            hasAudioPermission,
            transcriptLength: currentTranscript.length,
            callId,
            isOnline,
            errorMessage
          });
        },
        testMicrophone: async () => {
          try {
            const result = await checkMicrophonePermissions();
            console.log("Microphone test result:", result);
            return result;
          } catch (error) {
            console.error("Microphone test failed:", error);
            return false;
          }
        },
        testNetwork: async () => {
          try {
            const result = await testNetworkConnectivity();
            console.log("Network test result:", result);
            return result;
          } catch (error) {
            console.error("Network test failed:", error);
            return false;
          }
        }
      };

      console.log("🔧 Debug tools available: window.debugUltravox");
    }
  }, [uiState, uvStatus, isInterviewActive, hasAudioPermission, currentTranscript.length, callId, isOnline, errorMessage]);

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

      <VoiceActivityIndicator
        uvStatus={uvStatus}
        isInterviewActive={isInterviewActive}
      />

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
                                onClick={async () => {
                                  try {
                                    const result = await checkMicrophonePermissions();
                                    const hasPermission = result && typeof result === 'object' ? result.granted : Boolean(result);
                                    if (hasPermission) {
                                      setHasAudioPermission(true);
                                      logClientEvent("Microphone permission granted");
                                    } else {
                                      setHasAudioPermission(false);
                                      const errorMsg = (result && typeof result === 'object' && result.error) || "Microphone access denied";
                                      setErrorMessage(errorMsg);
                                      logClientEvent(`Microphone permission error: ${errorMsg}`);
                                    }
                                  } catch (error) {
                                    console.error("Error requesting microphone permission:", error);
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

              <div className={`space-y-8 ${!(uiState === 'processing_transcript' || uiState === 'displaying_results') ? 'opacity-50' : ''}`}>
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