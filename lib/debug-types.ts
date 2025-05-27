/**
 * Shared TypeScript types for debugging utilities
 */

/**
 * Interface for Ultravox session debug state
 */
export interface UltravoxDebugState {
  uvSession: any;
  uvStatus: string;
  isInterviewActive: boolean;
  hasAudioPermission: boolean | null;
  uiState: string;
  currentTranscript: Array<{ speaker: string; text: string }>;
  callId: string;
  isOnline: boolean;
  errorMessage: string;
}

/**
 * Interface for network connectivity test results
 */
export interface NetworkTestResult {
  success: boolean;
  status?: number;
  message: string;
  latency?: number;
  timestamp?: number;
}

/**
 * Interface for WebSocket connection test results
 */
export interface WebSocketTestResult {
  success: boolean;
  latency?: number;
  error?: string;
  protocolSupported?: boolean;
}

/**
 * Interface for browser compatibility test results
 */
export interface BrowserCompatibilityResult {
  compatible: boolean;
  issues: string[];
  details: {
    mediaDevices: boolean;
    webSockets: boolean;
    webAudio: boolean;
    permissions: boolean;
  };
}

/**
 * Interface for microphone permission test results
 */
export interface MicrophonePermissionResult {
  granted: boolean;
  state?: PermissionState;
  error?: string;
}

/**
 * Interface for audio device test results
 */
export interface AudioDeviceResult {
  microphone: boolean;
  speaker: boolean;
  devices?: MediaDeviceInfo[];
  error?: string;
}

/**
 * Interface for audio support test results
 */
export interface AudioSupportResult {
  supported: boolean;
  state?: string;
  sampleRate?: number;
  error?: string;
}

/**
 * Interface for debug mode options
 */
export interface DebugModeOptions {
  enabled: boolean;
  verboseLogging: boolean;
  showDevTools: boolean;
  logToConsole: boolean;
  monitorNetwork: boolean;
  trackPerformance: boolean;
}
