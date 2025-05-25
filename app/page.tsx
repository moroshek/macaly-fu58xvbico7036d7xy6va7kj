"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Mic, MicOff, X, Loader2, WifiOff, Send, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import axios from "axios";
import axiosRetry from 'axios-retry';
import { UltravoxSession } from 'ultravox-client';
import DevTray from "@/components/DevTray";

// Type definition for backend communication logs
type BackendCommLog = {
  timestamp: string;
  serviceTarget: string;
  method: string;
  outcome: string;
  statusCode?: number;
};

/**
 * Backend API URL - In a production environment, this would be stored in environment variables
 * For multi-environment setups (dev/staging/prod), use process.env.NEXT_PUBLIC_API_BASE_URL
 */
const API_BASE_URL = 'https://ai-medical-intake-service-d3jme76qea-uc.a.run.app';

// Configure axios with retry capability
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Only retry on network errors, not on 4xx responses
    return Boolean(
      axiosRetry.isNetworkOrIdempotentRequestError(error) || 
      (error.code === 'ECONNABORTED') ||
      (error.response && error.response.status >= 500)
    );
  },
  onRetry: (retryCount, error, requestConfig) => {
    console.log(`Retry attempt ${retryCount} for ${requestConfig.url}`);
    // Removed toast in favor of network status drawer
  }
});

// Add a response interceptor for better error logging
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

// Define types for the transcript, summary and analysis data
type Utterance = {
  speaker: string;
  text: string;
};

type SummaryData = {
  chiefComplaint: string | null;
  historyOfPresentIllness: string | null;
  associatedSymptoms: string | null;
  pastMedicalHistory: string | null;
  medications: string | null;
  allergies: string | null;
  notesOnInteraction: string | null;
  [key: string]: string | null | undefined;
};

export default function LandingPage() {
  // Start in idle state to show the animation to begin an audio conversation
  const [uiState, setUiState] = useState<'idle' | 'initiating' | 'interviewing' | 'processing_transcript' | 'displaying_results' | 'error'>('idle');
  
  // State for UI management
  
  // State for Ultravox session
  // Using 'any' type because the UltravoxSession type definition doesn't expose all methods we need
  // In a production environment, we would create proper type definitions for the library
  const [uvSession, setUvSession] = useState<any>(null);
  const [callId, setCallId] = useState<string>("");
  const [isInterviewActive, setIsInterviewActive] = useState<boolean>(false);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(true);
  const [uvStatus, setUvStatus] = useState<string>("");
  
  // State for transcript and results
  const [currentTranscript, setCurrentTranscript] = useState<Utterance[]>([
    { speaker: 'agent', text: 'Hello, I\'m your AI medical intake assistant. What brings you in today?' },
    { speaker: 'user', text: 'I\'ve had a pretty bad headache for about 3 days now.' },
    { speaker: 'agent', text: 'I\'m sorry to hear that. Can you describe the headache? Where is it located and how would you rate the pain?' },
    { speaker: 'user', text: 'It\'s mostly in the front of my head. The pain comes and goes but it\'s pretty bad, maybe a 6 out of 10. It gets worse when I\'m in bright light or when I move around too much.' },
    { speaker: 'agent', text: 'Thank you. Are you experiencing any other symptoms along with the headache?' },
    { speaker: 'user', text: 'I feel a bit nauseous and I\'m sensitive to light and sound. But no vomiting or anything like that.' }
  ]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [analysisData, setAnalysisData] = useState<string>('');
  
  // Network status monitoring
  const [isOnline, setIsOnline] = useState(true);
  const [networkChecking, setNetworkChecking] = useState(false);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [isDrawerHidden, setIsDrawerHidden] = useState(true); // Start hidden for presentations
  const pendingRequestsRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // DevTray state variables
  const [backendCommsLog, setBackendCommsLog] = useState<BackendCommLog[]>([]);
  const [clientEventsLog, setClientEventsLog] = useState<string[]>([]);
  const [submittedTranscriptLength, setSubmittedTranscriptLength] = useState<number | null>(null);
  
  // Function to add event to client logs
  const logClientEvent = (event: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `${timestamp}: ${event}`;
    setClientEventsLog(prev => [logEntry, ...prev].slice(0, 20)); // Keep last 20 events
    console.log(logEntry);
  };
  
  // Function to add API communication to backend logs
  const logBackendComm = (serviceTarget: string, method: string, outcome: string, statusCode?: number) => {
    const timestamp = new Date().toLocaleTimeString();
    setBackendCommsLog(prev => [
      { timestamp, serviceTarget, method, outcome, statusCode },
      ...prev
    ].slice(0, 10)); // Keep last 10 API communications
  };
  
  // Function to actively check connectivity to the API endpoint
  const checkApiConnectivity = async () => {
    try {
      setNetworkChecking(true);
      logClientEvent('Checking API connectivity');
      
      // UPDATED: Send a GET request to the new /health endpoint for robust connectivity check
      const timestamp = new Date().getTime();
      const response = await axios.get(
        `${API_BASE_URL}/health?_=${timestamp}`,
        { timeout: 15000 } // Increased timeout to 15 seconds for reliability
      );
      
      logBackendComm('health', 'GET', 'success', response.status);
      
      if (!isOnline) {
        logClientEvent('API connectivity restored');
        setIsOnline(true);
        // Removed toast in favor of the non-intrusive drawer indicator
      }
      return true;
    } catch (error) {
      logClientEvent('API connectivity failed');
      logBackendComm('health', 'GET', 'failed');
      console.warn('API connectivity test failed:', error);
      
      if (isOnline) {
        setIsOnline(false);
        // Only show drawer if it wasn't manually hidden by the user
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
    // Set initial online status
    setIsOnline(navigator.onLine);
    
    // Handle online/offline events
    const handleOnline = async () => {
      console.log('Browser reports network connection restored');
      // When browser reports online, verify actual API connectivity
      if (pendingRequestsRef.current > 0) {
        await checkApiConnectivity();
      } else {
        setIsOnline(true);
        // Network drawer will show restored status
      }
    };
    
    const handleOffline = () => {
      console.log('Browser reports network connection lost');
      setIsOnline(false);
      // Only show drawer if it wasn't manually hidden by the user
      if (!isDrawerHidden) {
        setDrawerExpanded(true);
      }
    };
    
    // Periodic connection check for active requests
    const connectionCheckInterval = setInterval(() => {
      if (pendingRequestsRef.current > 0 && !isOnline) {
        // Only perform the check if we have pending requests and we're currently offline
        checkApiConnectivity();
      }
    }, 10000); // Check every 10 seconds if there are pending requests
    
    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Perform an initial connectivity check
    if (navigator.onLine) {
      checkApiConnectivity();
    }
    
    return () => {
      // Clean up event listeners and intervals
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(connectionCheckInterval);
    };
  }, [isOnline, isDrawerHidden]);

  // Clean up any active Ultravox session when component unmounts
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

  /**
   * Initialize the Ultravox session with the provided joinUrl
   * This sets up the WebRTC connection for the conversational AI interview
   * and configures all event listeners for the session
   */
  const initUltravoxSession = async (joinUrl: string) => {
    try {
      console.log("Initializing Ultravox session");
      
      // Create a new Ultravox session
      const session = new UltravoxSession();
      setUvSession(session);
      
      // Define TypeScript interfaces for Ultravox events
      interface UltravoxStatusEvent {
        data: 'connecting' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'disconnected';
      }
      
      interface UltravoxTranscriptEvent {
        data: {
          isFinal: boolean;
          speaker: 'agent' | 'user';
          text: string;
        };
      }
      
      interface UltravoxErrorEvent {
        data: any;
      }
      
      // Set up event listeners for Ultravox session
      // Note: TypeScript doesn't recognize the 'on' method due to incomplete type definitions
      // We would need to create custom type definitions for production use
      (session as any).on('status', (event: UltravoxStatusEvent) => {
        console.log("Ultravox status:", event.data);
        setUvStatus(event.data);
        
        // Update UI based on Ultravox status
        if (event.data === 'disconnected') {
          setIsInterviewActive(false);
          setIsMicMuted(true);
          
          // If we have transcript data and disconnected, automatically submit
          if (currentTranscript.length > 0) {
            console.log("Ultravox disconnected with transcript data, auto-submitting");
            assembleAndSubmitTranscript();
          } else {
            console.log("Ultravox disconnected without transcript data");
            setUiState('idle');
          }
        } else if (event.data === 'connecting') {
          // Just update the status, keep the UI state as 'initiating'
        } else if (['idle', 'listening', 'thinking', 'speaking'].includes(event.data)) {
          setUiState('interviewing');
          setIsInterviewActive(true);
        }
      });
      
      (session as any).on('transcripts', (event: UltravoxTranscriptEvent) => {
        if (event.data.isFinal) {
          console.log("Received final transcript:", event.data);
          setCurrentTranscript(prev => [
            ...prev, 
            { speaker: event.data.speaker, text: event.data.text }
          ]);
        }
      });
      
      (session as any).on('error', (event: UltravoxErrorEvent) => {
        console.error("Ultravox error:", event.data);
        toast.error("Interview Error", {
          description: "There was a problem with the interview. Please try again."
        });
        setUiState('error');
      });
      
      // Join the call with the provided URL
      console.log("Joining Ultravox call with URL:", joinUrl);
      await session.joinCall(joinUrl);
      
      // Initially mute the microphone
      session.muteMic();
      setIsMicMuted(true);
      
      return true;
    } catch (error) {
      console.error("Error initializing Ultravox session:", error);
      toast.error("Connection Error", {
        description: "Could not connect to the interview service. Please try again."
      });
      return false;
    }
  };

  // Handle the Start Interview button click
  const handleStartInterview = async () => {
    try {
      setUiState('initiating');
      logClientEvent("Starting interview initialization");
      
      // Verify we have network connectivity
      if (!navigator.onLine) {
        logClientEvent("Interview start failed: Offline");
        throw new Error("You appear to be offline. Please check your connection.");
      }
      
      // Increment pending requests count
      pendingRequestsRef.current++;
      
      // Request microphone permissions first to ensure they're granted
      try {
        logClientEvent("Requesting microphone access");
        await navigator.mediaDevices.getUserMedia({ audio: true });
        logClientEvent("Microphone access granted");
      } catch (micError) {
        logClientEvent("Microphone access denied");
        console.error("Microphone access denied:", micError);
        throw new Error("Microphone access is required for the interview. Please grant permission.");
      }
      
      // Make a POST request to initiate-intake endpoint
      logClientEvent("Calling initiate-intake API");
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/initiate-intake`,
        {},
        { timeout: 30000 }
      );
      
      logBackendComm('initiate-intake', 'POST', 'success', response.status);
      logClientEvent("Received initiate-intake response");
      
      // Extract joinUrl and callId from response
      const { joinUrl, callId } = response.data;
      
      if (!joinUrl || !callId) {
        logClientEvent("Invalid API response: Missing joinUrl or callId");
        throw new Error("Invalid response from server. Missing joinUrl or callId.");
      }
      
      // Store callId for later use
      setCallId(callId);
      logClientEvent(`Call ID received: ${callId.substring(0, 8)}...`);
      
      // Initialize Ultravox session with joinUrl
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
      
      // Set appropriate error message
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

  // Toggle microphone mute/unmute
  const toggleMicMute = () => {
    if (!uvSession) return;
    
    try {
      if (isMicMuted) {
        console.log("Unmuting microphone");
        uvSession.unmuteMic();
        setIsMicMuted(false);
      } else {
        console.log("Muting microphone");
        uvSession.muteMic();
        setIsMicMuted(true);
      }
    } catch (error) {
      console.error("Error toggling microphone:", error);
      toast.error("Microphone Error", {
        description: "Could not change microphone state. Please try again."
      });
    }
  };

  // End interview and leave the call
  const handleEndInterview = async () => {
    if (!uvSession) return;
    
    try {
      console.log("Ending interview");
      await uvSession.leaveCall();
      setIsInterviewActive(false);
      
      // If we have transcript data, submit it
      if (currentTranscript.length > 0) {
        assembleAndSubmitTranscript();
      } else {
        toast.error("Empty Interview", {
          description: "No conversation data was recorded. Please try again."
        });
        setUiState('idle');
      }
    } catch (error) {
      console.error("Error ending interview:", error);
      toast.error("Error", {
        description: "There was a problem ending the interview. Please try again."
      });
    }
  };

  // Assemble transcript and submit to backend
  const assembleAndSubmitTranscript = async () => {
    try {
      setUiState('processing_transcript');
      logClientEvent("Assembling and submitting transcript");
      
      // Verify we have transcript data
      if (!currentTranscript.length) {
        logClientEvent("Error: No transcript data available");
        throw new Error("No transcript data available.");
      }
      
      // Verify we have a callId
      if (!callId) {
        logClientEvent("Error: Missing call ID");
        throw new Error("Missing call ID.");
      }
      
      // Assemble full transcript string
      const fullTranscript = currentTranscript.map(utterance => 
        `${utterance.speaker === 'agent' ? 'Agent' : 'User'}: ${utterance.text}`
      ).join('\n');
      
      // Store transcript length for DevTray
      setSubmittedTranscriptLength(fullTranscript.length);
      logClientEvent(`Assembled transcript (${fullTranscript.length} characters)`); 
      
      // Increment pending requests count
      pendingRequestsRef.current++;
      
      // Create abort controller for timeout
      abortControllerRef.current = new AbortController();
      
      // Submit transcript to backend
      logClientEvent("Calling submit-transcript API");
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/submit-transcript`,
        {
          callId: callId,
          transcript: fullTranscript
        },
        {
          timeout: 60000,
          signal: abortControllerRef.current.signal
        }
      );
      
      logBackendComm('submit-transcript', 'POST', 'success', response.status);
      logClientEvent("Received submit-transcript response");
      
      // Extract summary and analysis from response
      const { summary, analysis } = response.data;
      
      if (!summary || !analysis) {
        logClientEvent("Error: Invalid API response - Missing summary or analysis");
        throw new Error("Invalid response from server. Missing summary or analysis.");
      }
      
      // Ensure summary is properly formatted with all expected fields
      const validatedSummary: SummaryData = {
        chiefComplaint: summary.chiefComplaint ?? null,
        historyOfPresentIllness: summary.historyOfPresentIllness ?? null,
        associatedSymptoms: summary.associatedSymptoms ?? null,
        pastMedicalHistory: summary.pastMedicalHistory ?? null,
        medications: summary.medications ?? null,
        allergies: summary.allergies ?? null,
        notesOnInteraction: summary.notesOnInteraction ?? null
      };
      
      // Log received data for DevTray
      const summaryFieldCount = Object.values(validatedSummary).filter(v => v !== null).length;
      logClientEvent(`Received summary data (${summaryFieldCount} fields)`); 
      logClientEvent(`Received analysis (${analysis.length} characters)`); 
      
      // Update state with validated response data
      setSummaryData(validatedSummary);
      setAnalysisData(analysis);
      
      // Update UI state to display results
      setUiState('displaying_results');
      
      toast.success("Interview Complete", {
        description: "Your medical intake interview has been processed successfully."
      });
      
    } catch (error: any) {
      console.error("Error submitting transcript:", error);
      logClientEvent(`Transcript submission error: ${error.message || 'Unknown error'}`); 
      
      // Set appropriate error message
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
      
      toast.error("Processing Error", {
        description: errorMessage
      });
      
      setUiState('error');
    } finally {
      pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
    }
  };

  // Reset all state variables
  const resetAll = () => {
    // Clean up Ultravox session if active
    if (uvSession) {
      try {
        uvSession.leaveCall();
      } catch (error) {
        console.error("Error leaving Ultravox call during reset:", error);
      }
    }
    
    // Reset all state variables
    setUvSession(null);
    setCallId("");
    setIsInterviewActive(false);
    setIsMicMuted(true);
    setUvStatus("");
    setCurrentTranscript([]);
    setSummaryData(null);
    setAnalysisData("");
    setUiState('idle');
  };

  // Start a new interview after reset
  const resetAllAndStartNew = () => {
    resetAll();
    setTimeout(() => handleStartInterview(), 500); // Small delay to ensure reset is complete
  };

  // Format a summary field value with proper handling for empty/null values
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
            
            {/* Main interaction area (Area 1) - can expand to full width on larger screens when displaying results */}
            <div className={`${uiState === 'displaying_results' ? 'md:col-span-2' : ''} ${uiState === 'displaying_results' ? 'md:grid md:grid-cols-2 md:gap-8' : 'relative'}`}>
              
              {/* AREA 1: Audio Interaction & Live Transcript */}
              <div className={`${uiState === 'displaying_results' ? 'md:col-span-1' : ''} relative h-[400px] rounded-lg overflow-hidden bg-gradient-to-br from-teal-50 to-blue-50 border border-teal-100 shadow-md`}>
                {/* IDLE STATE: Start Interview Button */}
                {uiState === 'idle' && (
                  <button 
                    onClick={handleStartInterview}
                    className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-teal-50/50 active:scale-[0.99]"
                  >
                    <div className="w-full max-w-md flex flex-col items-center">
                      {/* Audio waveform animation */}
                      <div className="flex items-center justify-center space-x-1 h-32 mb-6">
                        {[...Array(20)].map((_, i) => (
                          <div
                            key={i}
                            className={`w-2 bg-teal-500 rounded-full opacity-70 animate-pulse`}
                            style={{
                              height: `${Math.sin(i / 3) * 30 + 40}px`,
                              animationDelay: `${i * 50}ms`,
                              animationDuration: `${800 + (i % 4) * 300}ms`,
                            }}
                          ></div>
                        ))}
                      </div>

                      {/* Text prompt */}
                      <div className="text-center">
                        <p className="text-lg font-medium text-teal-700">Start Interview</p>
                        <p className="text-sm text-gray-500 mt-2">Our AI assistant is ready to listen</p>
                      </div>
                    </div>
                  </button>
                )}
                
                {/* INITIATING STATE: Connecting to Interview */}
                {uiState === 'initiating' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                    <div className="flex flex-col items-center space-y-6 w-full">
                      <div className="w-24 h-24 rounded-full bg-teal-50 border-4 border-dashed border-teal-300 flex items-center justify-center shadow-md">
                        <Loader2 size={36} className="text-teal-500 animate-spin" />
                      </div>
                      <p className="text-lg font-medium text-teal-700">Connecting to Interview</p>
                      <p className="text-sm text-gray-500 text-center">
                        Setting up your secure connection and preparing the AI medical assistant.
                      </p>
                    </div>
                  </div>
                )}
                
                {/* INTERVIEWING STATE: Live Interview with Ultravox */}
                {uiState === 'interviewing' && (
                  <div className="absolute inset-0 flex flex-col p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${uvStatus === 'speaking' ? 'bg-green-500 animate-pulse' : uvStatus === 'listening' ? 'bg-red-500 animate-pulse' : uvStatus === 'thinking' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-300'}`}></div>
                        <span className="text-sm font-medium text-gray-700">
                          {uvStatus === 'speaking' ? 'AI is speaking...' : 
                           uvStatus === 'listening' ? 'Listening to you...' : 
                           uvStatus === 'thinking' ? 'AI is thinking...' : 
                           'Ready'}
                        </span>
                      </div>
                      <Button
                        onClick={handleEndInterview}
                        variant="outline"
                        size="sm"
                        className="text-red-500 border-red-200 hover:bg-red-50"
                      >
                        End Interview & Submit
                      </Button>
                    </div>
                    
                    {/* Live transcript display - scrollable area */}
                    <div className="flex-1 overflow-y-auto mb-4 bg-white/80 backdrop-blur-sm rounded-md p-4 border border-teal-100">
                      {currentTranscript.length > 0 ? (
                        currentTranscript.map((utterance, index) => (
                          <div key={index} className="mb-3">
                            <div className={`text-xs font-medium ${utterance.speaker === 'agent' ? 'text-teal-600' : 'text-blue-600'}`}>
                              {utterance.speaker === 'agent' ? 'AI Assistant' : 'You'}
                            </div>
                            <div className="text-sm text-gray-800">{utterance.text}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500 italic text-center mt-4">
                          Your conversation will appear here. Please speak when prompted by the AI assistant.
                        </div>
                      )}
                    </div>
                    
                    {/* Mic mute/unmute controls */}
                    <div className="flex justify-center">
                      <Button
                        onClick={toggleMicMute}
                        className={`w-full max-w-xs ${isMicMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-teal-500 hover:bg-teal-600'}`}
                      >
                        {isMicMuted ? (
                          <>
                            <MicOff className="mr-2 h-4 w-4" />
                            Mic Muted (Click to Unmute)
                          </>
                        ) : (
                          <>
                            <Mic className="mr-2 h-4 w-4" />
                            Mic Active (Click to Mute)
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
                
                {/* PROCESSING STATE: Submitting and Processing Transcript */}
                {uiState === 'processing_transcript' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                    <div className="flex flex-col items-center space-y-6 w-full">
                      <div className="w-24 h-24 rounded-full bg-teal-50 border-4 border-dashed border-teal-300 flex items-center justify-center shadow-md">
                        <Loader2 size={36} className="text-teal-500 animate-spin" />
                      </div>
                      <p className="text-lg font-medium text-teal-700">Processing Interview</p>
                      <div className="w-full max-w-xs mt-2">
                        <div className="relative pt-1">
                          <div className="overflow-hidden h-2 text-xs flex rounded bg-teal-100">
                            <div className="animate-progress-bar shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-teal-500"></div>
                          </div>
                          <div className="mt-2 flex justify-between text-xs text-gray-400">
                            <span>Analyzing Transcript</span>
                            <span>Generating Summary</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 text-center">
                        AI is analyzing your interview and preparing a detailed medical summary.
                      </p>
                    </div>
                  </div>
                )}
                
                {/* ERROR STATE */}
                {uiState === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                    <div className="flex flex-col items-center space-y-6 w-full">
                      <div className="w-24 h-24 rounded-full bg-red-50 border-2 border-red-300 flex items-center justify-center">
                        <X size={36} className="text-red-500" />
                      </div>
                      <p className="text-lg font-medium text-red-700">Something went wrong</p>
                      <p className="text-sm text-gray-500 text-center">
                        There was a problem with your interview. Please try again.
                      </p>
                      <Button
                        onClick={resetAll}
                        className="bg-teal-500 hover:bg-teal-600 text-white"
                      >
                        Try Again
                      </Button>
                    </div>
                  </div>
                )}
                
                {/* DISPLAYING RESULTS STATE - AREA 1 (Interview Complete Status) */}
                {uiState === 'displaying_results' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                    <div className="flex flex-col items-center space-y-6 w-full">
                      <div className="w-24 h-24 rounded-full bg-green-50 border-2 border-green-300 flex items-center justify-center">
                        <CheckCircle size={36} className="text-green-500" />
                      </div>
                      <p className="text-lg font-medium text-green-700">Interview Complete</p>
                      <p className="text-sm text-gray-500 text-center">
                        Your medical intake interview has been successfully processed.
                      </p>
                      <Button
                        onClick={resetAllAndStartNew}
                        className="bg-teal-500 hover:bg-teal-600 text-white"
                      >
                        Start New Interview
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              
              {/* AREA 2 & 3: Intake Summary and Clinical Insights (Only visible in 'displaying_results' state) */}
              {uiState === 'displaying_results' && (
                <div className="md:col-span-1 space-y-8">
                  {/* AREA 2: Intake Summary Box */}
                  <div className="bg-white rounded-lg border border-teal-100 shadow-md overflow-hidden">
                    <div className="bg-gradient-to-r from-teal-500 to-teal-600 py-3 px-4">
                      <h2 className="text-white text-lg font-medium">Medical Intake Summary</h2>
                    </div>
                    <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
                      {summaryData && Object.entries(summaryData).map(([key, value]) => {
                        // Skip rendering if value is null or empty
                        if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
                        
                        // Format the key for display (convert camelCase to Title Case with Spaces)
                        const formattedKey = key
                          .replace(/([A-Z])/g, ' $1')
                          .replace(/^./, str => str.toUpperCase());
                        
                        return (
                          <div key={key} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                            <h3 className="text-sm font-semibold text-teal-700">{formattedKey}</h3>
                            <p className="text-sm text-gray-700 mt-1">{formatSummaryField(value)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* AREA 3: Clinical Insights Box */}
                  <div className="bg-white rounded-lg border border-teal-100 shadow-md overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 py-3 px-4">
                      <h2 className="text-white text-lg font-medium">Clinical Insights</h2>
                    </div>
                    <div className="p-4">
                      {analysisData ? (
                        <p className="text-sm text-gray-700 whitespace-pre-line">{analysisData}</p>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No clinical analysis available.</p>
                      )}
                    </div>
                  </div>
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
                  Speak naturally with our AI assistant or type your responses to medical questions.
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
      
      {/* Network Status Drawer - Tiny Carrot Version with Hide Button */}
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
            {/* Simple carrot character instead of icons */}
            ^
          </div>
          
          <div className="network-status-panel bg-white rounded-lg border shadow-sm">
            <div className="absolute top-1 right-1">
              <button 
                onClick={() => {
                  // Permanently hide the drawer until the page is refreshed
                  setIsDrawerHidden(true);
                  // Also make sure drawer is collapsed
                  setDrawerExpanded(false);
                  // Log for debugging
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
      
      {/* Developer Intelligence Tray */}
      <DevTray
        appPhase={uiState}
        sessionStatus={uvStatus || 'N/A'}
        sessionId={callId || null}
        isSessionActive={isInterviewActive}
        micStatus={isMicMuted ? 'Muted' : 'Unmuted'}
        utteranceCount={currentTranscript.length}
        lastUtteranceSource={currentTranscript.length > 0 ? 
          (currentTranscript[currentTranscript.length - 1].speaker === 'agent' ? 'Agent' : 'User') : 
          null
        }
        submittedDataLength={submittedTranscriptLength}
        backendCommsLog={backendCommsLog}
        outputSet1Received={!!summaryData}
        outputSet1FieldCount={summaryData ? 
          Object.values(summaryData).filter(value => value !== null && value !== '').length : 
          null
        }
        outputSet2Received={!!analysisData && analysisData.length > 0}
        outputSet2ApproxLength={analysisData ? analysisData.length : null}
        clientEventsLog={clientEventsLog}
      />
    </div>
  );
}