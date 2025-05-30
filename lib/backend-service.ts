/**
 * Backend API service for handling all API interactions
 */

import axios, { AxiosInstance } from 'axios';
import { getConfig, API_ENDPOINTS } from '@/lib/config';
import { ErrorHandler } from '@/lib/error-handler';
import { SummaryData } from '@/lib/types'; // Corrected import path

export interface InitiateIntakeResponse {
  joinUrl: string;
  callId: string;
}

export interface SubmitTranscriptResponse {
  message: string; // Or consider if this field is actually present/needed
  summary: SummaryData | null; // Allow null as per task and existing logic
  analysis: string | null; // Allow null as per task
}

export class BackendService {
  private static instance: BackendService;
  private axiosInstance: AxiosInstance;
  private errorHandler = ErrorHandler.getInstance();
  private config = getConfig();

  private constructor() {
    this.axiosInstance = axios.create({
      baseURL: this.config.apiBaseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[API] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.log(`[API] Response ${response.status} from ${response.config.url}`);
        return response;
      },
      (error) => {
        const appError = this.errorHandler.handle(error, {
          url: error.config?.url,
          method: error.config?.method,
        });
        return Promise.reject(appError);
      }
    );
  }

  static getInstance(): BackendService {
    if (!BackendService.instance) {
      BackendService.instance = new BackendService();
    }
    return BackendService.instance;
  }

  /**
   * Check API health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get(API_ENDPOINTS.HEALTH);
      return response.status === 200;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Initiate a new intake session
   */
  async initiateIntake(): Promise<InitiateIntakeResponse> {
    try {
      const response = await this.axiosInstance.post<InitiateIntakeResponse>(
        API_ENDPOINTS.INITIATE_INTAKE,
        {}
      );

      if (!response.data.joinUrl || !response.data.callId) {
        throw new Error('Invalid response from server. Missing joinUrl or callId.');
      }

      return response.data;
    } catch (error) {
      console.error('Failed to initiate intake:', error);
      throw error;
    }
  }

  /**
   * Submit transcript for processing with improved retry logic for 503 errors
   */
  async submitTranscript(
    callId: string,
    transcript: string,
    retryCount: number = 0,
    onRetryProgress?: (attempt: number, totalAttempts: number) => void
  ): Promise<SubmitTranscriptResponse> {
    const maxRetries = 5; // Increased from 3 to give more time for warm-up
    
    try {
      const payload = {
        callId: callId.trim(),
        transcript: transcript,
      };
      
      console.log('[BackendService] Submitting transcript payload:', {
        callId: payload.callId,
        transcriptLength: payload.transcript.length,
        transcriptSample: payload.transcript.substring(0, 200) + '...',
        attempt: retryCount + 1,
        maxAttempts: maxRetries + 1
      });
      
      const response = await this.axiosInstance.post<SubmitTranscriptResponse>(
        API_ENDPOINTS.SUBMIT_TRANSCRIPT,
        payload,
        {
          timeout: this.config.transcriptSubmissionTimeoutMs,
          headers: {
            'X-Request-ID': `${callId}-${Date.now()}`,
          },
        }
      );

      if (!response.data) {
        throw new Error('Empty response from server');
      }

      // Ensure response.data matches the updated SubmitTranscriptResponse structure.
      // The existing logic already handles potential undefined/null for summary and analysis,
      // and normalizes summary fields.
      const responseData = response.data;

      // If the server might not return summary or analysis, ensure they are at least null
      if (typeof responseData.summary === 'undefined') {
        responseData.summary = null;
      }
      if (typeof responseData.analysis === 'undefined') {
        responseData.analysis = null;
      }
      
      if (responseData.summary === null && responseData.analysis === null) {
         // Optional: depending on strictness, could throw error or just return as is
         console.warn('Response from server missing both summary and analysis data.');
      }

      // Validate and normalize the summary data if it exists
      if (responseData.summary) {
        const requiredFields = [
          'chiefComplaint',
          'historyOfPresentIllness',
          'associatedSymptoms',
          'pastMedicalHistory',
          'medications',
          'allergies',
          'notesOnInteraction',
        ];
        
        const currentSummary = responseData.summary; // Work with a local variable for type safety

        const missingFields = requiredFields.filter((field) => !(field in currentSummary) || currentSummary[field] === undefined);

        if (missingFields.length > 0) {
          console.warn(`Summary missing fields: ${missingFields.join(', ')}. Setting them to null.`);
          missingFields.forEach((field) => {
            (currentSummary as any)[field] = null;
          });
        }
      }
      
      // Debug logging for analysis content
      if (responseData.analysis) {
        console.log('[BackendService] Analysis data received:', {
          analysisLength: responseData.analysis.length,
          analysisPreview: responseData.analysis.substring(0, 200) + '...',
          analysisType: typeof responseData.analysis,
          analysisFullContent: responseData.analysis
        });
      } else {
        console.log('[BackendService] No analysis data in response');
      }
      
      return responseData;
    } catch (error: any) {
      console.error('Failed to submit transcript:', error);
      
      // Retry logic for 503 Service Unavailable (Cloud Run cold start)
      if (error.response?.status === 503 && retryCount < maxRetries) {
        // Exponential backoff with jitter: 2s, 4s, 8s, 16s, 32s
        const baseDelay = Math.min(2000 * Math.pow(2, retryCount), 32000);
        const jitter = Math.random() * 1000; // Add up to 1s of jitter
        const delay = baseDelay + jitter;
        
        console.log(`[BackendService] Got 503 (Service Unavailable), retrying in ${Math.round(delay)}ms (attempt ${retryCount + 2}/${maxRetries + 1})...`);
        console.log(`[BackendService] 503 Error details:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          headers: error.response?.headers,
        });
        
        // Notify progress if callback provided
        if (onRetryProgress) {
          onRetryProgress(retryCount + 2, maxRetries + 1);
        }
        
        // Try to warm up the service before retry (but don't wait too long)
        const warmupPromise = this.checkHealth().catch(err => {
          console.warn('[BackendService] Health check failed during retry:', err);
        });
        
        // Wait for either the delay or warmup (whichever comes first)
        await Promise.race([
          new Promise(resolve => setTimeout(resolve, delay)),
          warmupPromise.then(() => new Promise(resolve => setTimeout(resolve, 1000))) // If warmup succeeds, wait 1s more
        ]);
        
        return this.submitTranscript(callId, transcript, retryCount + 1, onRetryProgress);
      }
      
      // For non-503 errors or after max retries, throw the error
      throw error;
    }
  }

  /**
   * Set custom timeout for specific operations
   */
  setRequestTimeout(timeout: number) {
    this.axiosInstance.defaults.timeout = timeout;
  }

  /**
   * Get the current API base URL
   */
  getApiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }
}