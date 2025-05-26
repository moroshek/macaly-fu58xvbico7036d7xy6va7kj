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
  const [uiState, setUiState] = useState<'idle' | 'initiating' | 'interviewing' | 'processing_transcript' | 'displaying_results' | 'error'>('idle');
  const [uvSession, setUvSession] = useState<any>(null);
  const [callId, setCallId] = useState<string>("");
  const [isInterviewActive, setIsInterviewActive] = useState<boolean>(false);
  const [uvStatus, setUvStatus] = useState<string>("");
  const [currentTranscript, setCurrentTranscript] = useState<Utterance[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [analysisData, setAnalysisData] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  const { toast } = useToast();
  const pendingRequestsRef = useRef<number>(0);

  // Check if conversation should end based on agent message
  const shouldEndConversation = (message: any): boolean => {
    if (!message) return false;

    // Check for tool calls (like hangUp)
    if (message.toolCalls && Array.isArray(message.toolCalls)) {
      return message.toolCalls.some((tool: any) =>
        tool && (tool.name === 'hangUp' || tool.toolName === 'hangUp')
      );
    }

    // Check for end phrases in message text
    if (message.text && typeof message.text === 'string') {
      const lowerText = message.text.toLowerCase();
      const endPhrases = [
        'thank you for completing', 'thank you for your time',
        'take care', 'goodbye', 'have a good day',
        'thanks for answering', 'that concludes',
        "we're all set", 'interview is complete'
      ];

      return endPhrases.some(phrase => lowerText.includes(phrase));
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
      const session = new UltravoxSession();
      setUvSession(session);

      // Status change handler
      const handleStatusChange = (event: any) => {
        const status = typeof event === 'string' ? event :
          event?.data || event?.status || 'unknown';

        logClientEvent(`Ultravox status: ${status}`);
        setUvStatus(status);

        const activeStates = ['idle', 'listening', 'thinking', 'speaking', 'connected', 'ready', 'active'];

        if (status === 'disconnected') {
          console.log("Ultravox session disconnected");
          setIsInterviewActive(false);

          // Auto-submit transcript if we have data and aren't already processing
          if (uiState !== 'processing_transcript' && uiState !== 'displaying_results' && currentTranscript.length > 0) {
            console.log("Auto-submitting transcript after disconnection");
            assembleAndSubmitTranscript();
          } else if (currentTranscript.length === 0) {
            setUiState('idle');
          }
        } else if (activeStates.includes(status.toLowerCase())) {
          setUiState('interviewing');
          setIsInterviewActive(true);
        }
      };

      // Transcript handler
      const handleTranscript = (event: any) => {
        try {
          console.log("Transcript event received:", event);

          // Access transcripts from session.transcripts property
          if (session.transcripts && Array.isArray(session.transcripts)) {
            // Get the new transcripts (ones we haven't processed yet)
            const processedCount = currentTranscript.length;
            const newTranscripts = session.transcripts.slice(processedCount).filter((transcript: any) => {
              // Only process final transcripts with valid text
              return transcript &&
                typeof transcript.text === 'string' &&
                transcript.text.trim() !== '' &&
                (transcript.isFinal !== false); // Include if isFinal is true or undefined
            });

            console.log(`Found ${newTranscripts.length} new transcripts to process`);

            // Add new transcripts to state
            if (newTranscripts.length > 0) {
              newTranscripts.forEach((transcript: any) => {
                const speaker = transcript.speaker === 'user' ? 'user' : 'agent';
                const utterance = { speaker, text: transcript.text.trim() };

                console.log(`Adding transcript: ${speaker}: ${utterance.text.substring(0, 50)}...`);
                
                setCurrentTranscript(prev => {
                  // Avoid duplicates
                  const exists = prev.some(u => u.speaker === speaker && u.text === utterance.text);
                  if (exists) return prev;
                  return [...prev, utterance];
                });
              });
            }
          } else {
            console.log("No transcripts array found on session", session);
          }
        } catch (err) {
          console.error("Error processing transcript:", err);
        }
      };

      // Agent message handler
      const handleAgentMessage = (event: any) => {
        try {
          const message = event?.data || event;
          console.log("Agent message received:", message);

          // Check if conversation should end
          if (shouldEndConversation(message)) {
            console.log("Detected conversation end signal");
            setTimeout(() => {
              if (uiState === 'interviewing') {
                handleEndInterview();
              }
            }, 1000);
          }

          // Process transcript if available
          if (message && message.text && message.isFinal) {
            const utterance = {
              speaker: 'agent',
              text: message.text.trim()
            };

            setCurrentTranscript(prev => {
              const exists = prev.some(u => u.speaker === 'agent' && u.text === utterance.text);
              if (exists) return prev;
              return [...prev, utterance];
            });
          }
        } catch (err) {
          console.error("Error processing agent message:", err);
        }
      };

      // Error handler
      const handleError = (event: any) => {
        const errorObj = event?.error || event;
        console.error("Ultravox error:", errorObj);
        
        // Don't show error UI if we're already in a different state
        if (uiState === 'interviewing' || uiState === 'initiating') {
          toast({
            title: "Interview Error",
            description: errorObj?.message || "There was a problem with the interview. Please try again.",
            variant: "destructive"
          });
          setUiState('error');
        }
      };

      // Set up event listeners
      if (typeof session.addEventListener === 'function') {
        // Remove any existing listeners first to prevent duplicates
        try {
          session.removeEventListener('status', handleStatusChange);
          session.removeEventListener('transcripts', handleTranscript);
          session.removeEventListener('agentMessage', handleAgentMessage);
          session.removeEventListener('error', handleError);
        } catch (e) {
          console.log("No previous listeners to remove");
        }
        
        // Add new listeners
        session.addEventListener('status', handleStatusChange);
        session.addEventListener('transcripts', handleTranscript);
        session.addEventListener('agentMessage', handleAgentMessage);
        session.addEventListener('error', handleError);
        
        console.log("All event listeners attached successfully");
      } else {
        console.warn("addEventListener is not a function on session");
      }

      console.log("Joining Ultravox call with URL:", joinUrl.substring(0, 20) + "...");
      await session.joinCall(joinUrl);
      console.log("Successfully joined Ultravox call");
      logClientEvent("Successfully joined Ultravox call - transitioning to interviewing state");

      // Set interviewing state immediately after successful join
      setUiState('interviewing');
      setIsInterviewActive(true);

      // Unmute microphone
      try {
        if (typeof session.unmuteMic === 'function') {
          session.unmuteMic();
          console.log("Microphone unmuted");
        } else if (typeof (session as any).unmuteMicrophone === 'function') {
          (session as any).unmuteMicrophone();
          console.log("Microphone unmuted (alternate method)");
        } else {
          console.warn("No unmute method found on session");
        }
      } catch (micError) {
        console.error("Error unmuting microphone:", micError);
      }

      return true;
    } catch (error: any) {
      console.error("Error initializing Ultravox session:", error);
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

    try {
      setUiState('initiating');
      logClientEvent("Starting interview initialization");

      if (!navigator.onLine) {
        logClientEvent("Interview failed - user is offline");
        throw new Error("You appear to be offline. Please check your connection.");
      }

      // Request microphone permission
      try {
        logClientEvent("Requesting microphone permission");
        await navigator.mediaDevices.getUserMedia({ audio: true });
        logClientEvent("Microphone access granted");
      } catch (micError) {
        logClientEvent(`Microphone access denied: ${micError}`);
        throw new Error("Microphone access is required for the interview. Please grant permission.");
      }

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
      console.log("Already processing or displaying results. Ignoring duplicate call.");
      return;
    }

    console.log("Ending interview");
    setIsInterviewActive(false);

    // Leave Ultravox call
    try {
      if (uvSession && typeof uvSession.leaveCall === 'function') {
        await uvSession.leaveCall();
        console.log("Successfully left Ultravox call");
      }
    } catch (error) {
      console.error("Error leaving Ultravox call:", error);
    }

    // Log transcript information
    console.log(`Current transcript length: ${currentTranscript.length}`);
    if (currentTranscript.length > 0) {
      console.log("Transcript samples:");
      currentTranscript.slice(0, 3).forEach((item, index) => {
        console.log(`Transcript ${index}: ${item.speaker}: "${item.text.substring(0, 50)}..."`);
      });
    }

    // Process transcript if we have data
    if (currentTranscript.length > 0) {
      console.log("Processing transcript data");
      await assembleAndSubmitTranscript();
    } else {
      // Check if we can get transcripts directly from the session as a fallback
      if (uvSession && uvSession.transcripts && Array.isArray(uvSession.transcripts) && uvSession.transcripts.length > 0) {
        console.log("No transcript in state, but found transcripts in session. Using those instead.");
        const sessionTranscripts = uvSession.transcripts
          .filter((t: any) => t && t.text && typeof t.text === 'string')
          .map((t: any) => ({
            speaker: t.speaker === 'user' ? 'user' : 'agent',
            text: t.text.trim()
          }));
          
        if (sessionTranscripts.length > 0) {
          setCurrentTranscript(sessionTranscripts);
          await assembleAndSubmitTranscript();
          return;
        }
      }
      
      console.log("No transcript data to process");
      toast({
        title: "Interview Ended",
        description: "No conversation data was recorded."
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
    setUiState('idle');
  };

  const resetAllAndStartNew = () => {
    console.log("Starting new interview");
    resetAll();
    setTimeout(() => handleStartInterview(), 100);
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
      case 'initiating':
        return "Connecting to AI assistant...";
      case 'interviewing':
        return "Interview in progress - speak clearly";
      case 'processing_transcript':
        return "Processing your interview...";
      case 'displaying_results':
        return "Interview complete - review your summary";
      case 'error':
        return "Error occurred - please try again";
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
      <header className="container mx-auto py-4 px-4 md:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
              <span className="text-white font-semibold">AI</span>
            </div>
            <span className="font-semibold text-lg">MedIntake</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-500">
              {isOnline ? 'Connected' : 'Offline'}
            </span>
          </div>
        </div>
      </header>
      
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
              <p className="text-sm text-gray-500">
                This is beta software. Do not use this as medical advice. It is for informational purposes only.
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
                        <div className="w-24 h-24 mx-auto bg-teal-500 rounded-full flex items-center justify-center">
                          <Mic size={32} className="text-white" />
                        </div>
                        <Button
                          onClick={handleStartInterview}
                          size="lg"
                          className="bg-teal-500 hover:bg-teal-600"
                        >
                          Start Medical Intake
                        </Button>
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
                          <Button
                            onClick={resetAll}
                            variant="outline"
                            size="sm"
                          >
                            Try Again
                          </Button>
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
            <div className="text-sm text-gray-500">Jake Moroshek | BuildAI © 2025</div>
          </div>
        </div>
      </footer>
    </div>
  );
}