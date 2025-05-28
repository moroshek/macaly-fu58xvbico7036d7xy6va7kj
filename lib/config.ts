/**
 * Centralized configuration for the Medical Intake application
 */

export interface AppConfig {
  apiBaseUrl: string;
  ultravoxTimeoutMs: number;
  transcriptSubmissionTimeoutMs: number;
  maxRetries: number;
  rateLimitRequests: number;
  rateLimitWindowMs: number;
  networkQualityCheckIntervalMs: number;
  enableDebugLogging: boolean;
  enableAnalytics: boolean;
  ultravoxApiBaseUrl: string;
  geminiApiBaseUrl: string;
  ultravoxAgentId: string;
  ai2GeminiModelName: string;
  ai3HfEndpointUrl: string;
}

const defaultConfig: AppConfig = {
  apiBaseUrl: process.env.NEXT_PUBLIC_BACKEND_API_URL || '',
  ultravoxTimeoutMs: 30000,
  transcriptSubmissionTimeoutMs: 120000,
  maxRetries: 3,
  rateLimitRequests: 10,
  rateLimitWindowMs: 60000,
  networkQualityCheckIntervalMs: 30000,
  enableDebugLogging: process.env.NODE_ENV === 'development',
  enableAnalytics: process.env.NODE_ENV === 'production',
  ultravoxApiBaseUrl: "https://api.ultravox.ai/api",
  geminiApiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
  ultravoxAgentId: process.env.NEXT_PUBLIC_ULTRAVOX_AGENT_ID || "fb42f359-003c-4875-b1a1-06c4c1c87376",
  ai2GeminiModelName: process.env.NEXT_PUBLIC_AI2_GEMINI_MODEL_NAME || "gemini-2.5-flash-preview-05-20",
  ai3HfEndpointUrl: process.env.NEXT_PUBLIC_AI3_HF_ENDPOINT_URL || "https://vvgxd2ms1kn7p2sq.us-east4.gcp.endpoints.huggingface.cloud"
};

export function getConfig(): AppConfig {
  return { ...defaultConfig };
}

export const API_ENDPOINTS = {
  HEALTH: '/health',
  INITIATE_INTAKE: '/api/v1/initiate-intake',
  SUBMIT_TRANSCRIPT: '/api/v1/submit-transcript'
} as const;

export const UI_STATES = {
  IDLE: 'idle',
  REQUESTING_PERMISSIONS: 'requesting_permissions',
  INITIATING: 'initiating',
  INTERVIEWING: 'interviewing',
  PROCESSING_TRANSCRIPT: 'processing_transcript',
  DISPLAYING_RESULTS: 'displaying_results',
  ERROR: 'error'
} as const;

export type UIState = typeof UI_STATES[keyof typeof UI_STATES];

// Constants for UI behavior and display
export const CALL_ID_DISPLAY_LENGTH = 8;
export const DISPLAY_RESULTS_DELAY_MS = 500;
export const START_INTERVIEW_DELAY_MS = 100;
export const Z_INDEX_DEBUG_BUTTON = 9999;
export const SCREEN_READER_ANNOUNCEMENT_MAX_LENGTH = 50;

export const PULSING_ANIMATION_CONFIG = {
  count: 3,
  delayIncrement: 0.3, // seconds
  duration: 2, // seconds
  scaleIncrement: 0.3,
  initialOpacity: 0.7,
  opacityDecrement: 0.15,
} as const;