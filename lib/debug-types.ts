/**
 * Shared TypeScript types for debugging utilities
 */

/**
 * UltravoxDebugInfo: Type for Ultravox session debug information
 */
export interface UltravoxDebugInfo {
  hasSession: boolean;
  status: string;
  isActive: boolean;
  micPermission: boolean | null;
  uiState: string;
  transcriptLength: number;
  callId: string | null;
  isOnline: boolean;
  errorMessage: string | null;
  micMuted?: boolean;
  speakerMuted?: boolean;
  sessionTranscriptsLength?: number;
}

/**
 * NetworkTestResult: Type for network connectivity test results
 */
export interface NetworkTestResult {
  internet: boolean;
  ultravoxApi: boolean;
  backendApi: boolean;
  webSocket: boolean;
  timestamp: number;
  details?: {
    latency?: number;
    errors?: string[];
    endpoints?: Record<string, {
      success: boolean;
      status?: number;
      message: string;
    }>;
  };
}

/**
 * BrowserCompatResult: Type for browser compatibility test results
 */
export interface BrowserCompatResult {
  compatible: boolean;
  issues: string[];
  features: {
    mediaDevices: boolean;
    webSockets: boolean;
    webAudio: boolean;
    permissions: boolean;
  };
  audio?: {
    contextState?: string;
    sampleRate?: number;
    microphoneAccess?: boolean;
    outputDevices?: number;
    inputDevices?: number;
  };
}

/**
 * AudioDeviceInfo: Type for audio device information
 */
export interface AudioDeviceInfo {
  microphone: {
    available: boolean;
    count: number;
    labels: string[];
  };
  speaker: {
    available: boolean;
    count: number;
    labels: string[];
  };
  permission: {
    granted: boolean;
    state?: string;
  };
}

/**
 * EndpointTestInfo: Type for API endpoint test results
 */
export interface EndpointTestInfo {
  url: string;
  method: string;
  success: boolean;
  status?: number;
  latency?: number;
  error?: string;
  timestamp: number;
}
