/**
 * Enhanced network utility functions with circuit breaker pattern and better error handling
 */

"use client";

import axios, { AxiosRequestConfig } from 'axios';

/**
 * Tests basic internet connectivity and access to key services
 * @returns Promise resolving to a boolean indicating if connectivity is good
 */
export async function testNetworkConnectivity(): Promise<boolean> {
  try {
    // Test basic internet
    await fetch('https://www.google.com/favicon.ico', { method: 'HEAD' });
    console.log("✅ Internet connectivity: OK");
    
    // Test Ultravox domain
    await fetch('https://api.ultravox.ai', { method: 'HEAD' });
    console.log("✅ Ultravox API reachable: OK");
    
    return true;
  } catch (error) {
    console.error("❌ Network connectivity issue:", error);
    return false;
  }
}

/**
 * Circuit breaker pattern implementation
 */
class CircuitBreaker {
  private failures: number = 0;
  private lastFailTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private failureThreshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) { }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailTime < this.timeout) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState() {
    return this.state;
  }

  reset() {
    this.failures = 0;
    this.lastFailTime = 0;
    this.state = 'CLOSED';
  }
}

const networkCircuitBreaker = new CircuitBreaker();

/**
 * Enhanced API connectivity check with exponential backoff
 */
export async function checkApiConnectivityWithRetry(
  apiBaseUrl: string,
  maxRetries: number = 3
): Promise<{
  success: boolean;
  status?: number;
  message: string;
  latency?: number;
  retryCount?: number;
}> {
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      const startTime = Date.now();

      const result = await networkCircuitBreaker.execute(async () => {
        console.log(`Testing API connectivity (attempt ${retryCount + 1}/${maxRetries + 1}):`, apiBaseUrl);

        const response = await axios.get(`${apiBaseUrl}/health`, {
          timeout: 10000,
          headers: {
            'Cache-Control': 'no-cache',
            'X-Request-ID': `health-check-${Date.now()}`
          }
        });

        return response;
      });

      const latency = Date.now() - startTime;

      return {
        success: true,
        status: result.status,
        message: `API connected successfully. Status: ${result.status}, Latency: ${latency}ms`,
        latency,
        retryCount
      };

    } catch (error) {
      retryCount++;

      if (retryCount > maxRetries) {
        console.warn('API connectivity test failed after all retries:', error);

        let message = 'Could not connect to API service after multiple attempts';
        let status: number | undefined;

        if (axios.isAxiosError(error)) {
          if (error.response) {
            status = error.response.status;
            message = `API error: ${error.response.status} ${error.response.statusText}`;
          } else if (error.request) {
            message = 'API request timeout or CORS issue';
          } else {
            message = `API request setup error: ${error.message}`;
          }
        }

        return {
          success: false,
          status,
          message,
          retryCount: retryCount - 1
        };
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, retryCount - 1) * 1000;
      console.log(`Retrying API connectivity test in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript requires it
  return {
    success: false,
    message: 'Unexpected error in retry logic',
    retryCount: maxRetries
  };
}

/**
 * Enhanced browser compatibility checking
 */
export interface EnhancedCompatibilityResult {
  compatible: boolean;
  criticalIssues: string[];
  warnings: string[];
  details: {
    mediaDevices: boolean;
    webSockets: boolean;
    webAudio: boolean;
    permissions: boolean;
    webRTC: boolean;
    localStorage: boolean;
    serviceWorker: boolean;
  };
  recommendations: string[];
}

export function checkEnhancedBrowserCompatibility(): EnhancedCompatibilityResult {
  const criticalIssues: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Initialize details with checks for global object availability
  const details = {
    mediaDevices: typeof navigator !== 'undefined' && !!navigator.mediaDevices,
    webSockets: typeof window !== 'undefined' && !!window.WebSocket,
    webAudio: typeof window !== 'undefined' && (!!(window as any).AudioContext || !!(window as any).webkitAudioContext),
    permissions: false,
    webRTC: false,
    localStorage: false,
    permissions: typeof navigator !== 'undefined' && !!navigator.permissions,
    webRTC: typeof window !== 'undefined' && (!!(window as any).RTCPeerConnection || !!(window as any).webkitRTCPeerConnection),
    localStorage: typeof window !== 'undefined' && !!window.localStorage,
    serviceWorker: typeof navigator !== 'undefined' && ('serviceWorker' in navigator)
  };

  // Critical checks
  if (!details.mediaDevices) {
    criticalIssues.push("MediaDevices API not available - microphone access impossible");
    recommendations.push("Please use a modern browser like Chrome 53+, Firefox 36+, or Safari 11+");
  }

  if (!details.webSockets) {
    criticalIssues.push("WebSocket not available - real-time communication impossible");
    recommendations.push("Please update your browser to support WebSocket");
  }

  if (!details.webAudio) {
    criticalIssues.push("Web Audio API not available - audio processing impossible");
    recommendations.push("Please use a browser that supports Web Audio API");
  }

  // WebRTC check
  if (!details.webRTC) {
    warnings.push("WebRTC not fully supported - some features may not work");
  }

  // Optional but useful checks
  if (!details.permissions) {
    warnings.push("Permissions API not available - permission management will use fallbacks");
  }

  if (!details.localStorage) {
    warnings.push("localStorage not available - settings won't persist");
  }

  if (!details.serviceWorker) {
    warnings.push("Service Worker not available - offline functionality disabled");
  }

  // Browser-specific recommendations
  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent;
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    if (!userAgent.includes('Safari')) {
      recommendations.push("For best iOS experience, use Safari browser");
    }
    warnings.push("iOS devices may require user interaction before audio can play");
  }

  if (userAgent.includes('Chrome') && userAgent.includes('Mobile')) {
    recommendations.push("Chrome mobile has excellent support for this application");
  }

  return {
    compatible: criticalIssues.length === 0,
    criticalIssues,
    warnings,
    details,
    recommendations
  };
}

/**
 * Network quality monitoring class
 */
export class NetworkQualityMonitor {
  private measurements: Array<{
    timestamp: number;
    latency: number;
    success: boolean;
  }> = [];

  private intervalId: ReturnType<typeof setTimeout> | null = null; // More generic timer ID type

  constructor(private testUrl: string = 'https://www.google.com/favicon.ico') { }

  start(intervalMs: number = 30000) {
    this.stop(); 
    if (typeof window === 'undefined' || typeof fetch === 'undefined' || typeof AbortSignal === 'undefined' || typeof setInterval === 'undefined') {
      console.warn("NetworkQualityMonitor: Browser environment features (window, fetch, AbortSignal, setInterval) not available. Monitoring will not start.");
      return;
    }
    this.intervalId = setInterval(() => this.measureLatency(), intervalMs);
    this.measureLatency(); // Initial measurement
    console.log("NetworkQualityMonitor started.");
  }

  stop() {
    if (this.intervalId && typeof clearInterval !== 'undefined') {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("NetworkQualityMonitor stopped.");
    }
  }

  private async measureLatency() {
    if (typeof fetch === 'undefined' || typeof AbortSignal === 'undefined') {
        console.warn("NetworkQualityMonitor: fetch or AbortSignal is not available. Cannot measure latency.");
        this.measurements.push({ timestamp: Date.now(), latency: -1, success: false });
        this._trimMeasurements(); // Call internal trim method
        return;
    }
    const startTime = Date.now();

    try {
      const response = await fetch(this.testUrl, { // Store response
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      if (!response.ok) throw new Error(`Status ${response.status}`); // Check response status

      const latency = Date.now() - startTime;

      this.measurements.push({
        timestamp: Date.now(),
        latency,
        success: true
      });

    } catch (error) {
      this.measurements.push({
        timestamp: Date.now(),
        latency: -1,
        success: false
      });
    }
    this._trimMeasurements(); // Call internal trim method
  }

  // Renamed to avoid conflict with potential user-defined properties if class is extended
  private _trimMeasurements() {
    // Keep only last 20 measurements
    if (this.measurements.length > 20) {
      this.measurements = this.measurements.slice(-20);
    }
  }

  getNetworkQuality(): {
    quality: 'excellent' | 'good' | 'poor' | 'offline';
    avgLatency: number;
    successRate: number;
    lastMeasurement: number;
  } {
    if (this.measurements.length === 0) {
      return {
        quality: 'offline',
        avgLatency: -1,
        successRate: 0,
        lastMeasurement: Date.now()
      };
    }

    const recentMeasurements = this.measurements.slice(-10); // Last 10 measurements
    const successfulMeasurements = recentMeasurements.filter(m => m.success);
    const successRate = successfulMeasurements.length / recentMeasurements.length;

    if (successRate < 0.5) {
      return {
        quality: 'offline',
        avgLatency: -1,
        successRate,
        lastMeasurement: recentMeasurements[recentMeasurements.length - 1]?.timestamp || Date.now()
      };
    }

    const avgLatency = successfulMeasurements.reduce((sum, m) => sum + m.latency, 0) / successfulMeasurements.length;

    let quality: 'excellent' | 'good' | 'poor';
    if (avgLatency < 100 && successRate > 0.9) {
      quality = 'excellent';
    } else if (avgLatency < 300 && successRate > 0.8) {
      quality = 'good';
    } else {
      quality = 'poor';
    }

    return {
      quality,
      avgLatency,
      successRate,
      lastMeasurement: recentMeasurements[recentMeasurements.length - 1]?.timestamp || Date.now()
    };
  }
}

/**
 * WebSocket connection tester with better error handling
 */
export async function testWebSocketConnectionEnhanced(
  url: string,
  timeoutMs: number = 10000
): Promise<{
  success: boolean;
  latency?: number; // in ms
  error?: string;
  protocolSupported?: boolean; // Indicates if WebSocket API itself is available
}> {
  if (typeof WebSocket === 'undefined') {
    return Promise.resolve({ success: false, error: 'WebSocket API not supported.', protocolSupported: false });
  }
    
  return new Promise((resolve) => {
    const startTime = Date.now();
    let ws: WebSocket;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanupAndResolve = (result: {
        success: boolean; latency?: number; error?: string; protocolSupported?: boolean;
    }) => {
      if (timer) clearTimeout(timer);
      timer = null; // Prevent multiple resolves
      if (ws) {
        // Remove event listeners to prevent actions on an already handled socket
        ws.onopen = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }
      resolve(result);
    };

    timer = setTimeout(() => {
        // Check if already resolved to prevent errors from closing an already closed socket
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
             cleanupAndResolve({
                success: false,
                error: `WebSocket connection timeout after ${timeoutMs}ms`,
                protocolSupported: true
            });
        } else if (!ws || ws.readyState !== WebSocket.CLOSED) { // If not open or connecting, and not already closed
             cleanupAndResolve({ // It likely failed to even start connecting properly or already handled
                success: false,
                error: `WebSocket connection timeout after ${timeoutMs}ms (socket not open/connecting)`,
                protocolSupported: true
            });
        }
    }, timeoutMs);

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        if (!timer) return; // Already timed out or resolved
        const latency = Date.now() - startTime;
        cleanupAndResolve({ success: true, latency, protocolSupported: true });
      };

      ws.onerror = (event) => { // This is a simple Event, not an Error object
        if (!timer) return; // Already timed out or resolved
        cleanupAndResolve({
            success: false,
            // Provide a generic error as Event type doesn't have detailed error info
            error: `WebSocket connection error. (Check browser console for details if any)`, 
            protocolSupported: true
        });
      };

      ws.onclose = (event) => { // event is CloseEvent
        if (!timer) return; // Already timed out or resolved
        cleanupAndResolve({
            success: false, 
            error: `WebSocket closed unexpectedly. Code: ${event.code}, Reason: ${event.reason || 'N/A'}. Clean: ${event.wasClean}`,
            protocolSupported: true
        });
      };

    } catch (error) { // Catches errors from new WebSocket() constructor (e.g. invalid URL)
        if (timer) { // Only resolve if not already handled by timeout
            cleanupAndResolve({
                success: false,
                error: `WebSocket instantiation error: ${error instanceof Error ? error.message : String(error)}`,
                // Instantiation error might mean no support or bad URL, could be false
                protocolSupported: !(error instanceof TypeError) 
            });
        }
    }
  });
}

/**
 * Export the existing functions for backwards compatibility
 */
/**
 * Checks if the backend API is accessible
 * @param apiBaseUrl The base URL of the backend API
 * @returns Promise resolving to a boolean indicating if the API is accessible
 */
export async function checkApiConnectivity(apiBaseUrl: string): Promise<{
  success: boolean;
  status?: number;
  message: string;
}> {
  try {
    console.log('Testing API connectivity to:', apiBaseUrl);
    const response = await axios.get(`${apiBaseUrl}/health`, { timeout: 10000 });
    return {
      success: true,
      status: response.status,
      message: `API connected successfully. Status: ${response.status}`
    };
  } catch (error) {
    console.warn('API connectivity test failed (basic check):', error); // Added (basic check) for clarity
    let message = 'Could not connect to API service';
    
    if (axios.isAxiosError(error)) {
      if (error.response) {
        message = `API error: ${error.response.status} ${error.response.statusText}`;
        return {
          success: false,
          status: error.response.status,
          message
        };
      } else if (error.request) {
        message = 'API request made but no response received (timeout or CORS issue)';
      } else {
        message = `API request setup error: ${error.message}`;
      }
    }
    
    return {
      success: false,
      message
    };
  }
}

/**
 * Tests a specific API endpoint (internal helper)
 * @param baseUrl Base URL of the API
 * @param path Path to the endpoint
 * @param method HTTP method to use
 * @param data Optional data to send with the request
 * @returns Object containing test results
 */
async function testEndpoint(baseUrl: string, path: string, method: string, data?: any) {
  try {
    const url = `${baseUrl}${path}`;
    console.log(`Testing ${method} ${url}`);
    
    const config: AxiosRequestConfig = { // Ensured AxiosRequestConfig is used
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    };
    
    let response;
    if (method === 'GET') {
      response = await axios.get(url, config);
    } else if (method === 'POST') {
      response = await axios.post(url, data || {}, config);
    } else {
      return { success: false, message: `Unsupported method: ${method}` };
    }
    
    return {
      success: true,
      status: response.status,
      message: `${method} ${path} succeeded with status ${response.status}`
    };
  } catch (error) {
    console.warn(`Error testing ${method} ${path}:`, error);
    
    if (axios.isAxiosError(error)) {
      if (error.response) {
        return {
          success: false,
          status: error.response.status,
          message: `${method} ${path} failed with status ${error.response.status}`
        };
      } else if (error.request) {
        return {
          success: false,
          message: `${method} ${path} request made but no response received`
        };
      }
    }
    
    return {
      success: false,
      message: `${method} ${path} failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Test all critical application endpoints
 * @param apiBaseUrl Base URL for the API
 * @returns Object containing test results for each endpoint
 */
export async function testAllEndpoints(apiBaseUrl: string) {
  const results = {
    health: await testEndpoint(apiBaseUrl, '/health', 'GET'),
    initiateIntake: await testEndpoint(apiBaseUrl, '/api/v1/initiate-intake', 'POST'),
    submitTranscript: await testEndpoint(apiBaseUrl, '/api/v1/submit-transcript', 'POST', {
      callId: 'test-call-id',
      transcript: 'Agent: Hello\nUser: Test transcript'
    })
  };
  
  console.log('API endpoint test results:', results);
  return results;
}

/**
 * Checks the device's online status using navigator.onLine
 * @returns Current online status
 */
export function getOnlineStatus(): boolean {
  // Ensure navigator is defined (for server-side rendering or non-browser environments)
  return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
    ? navigator.onLine
    : true; // Assume online if navigator or navigator.onLine is not available
}

/**
 * Sets up online/offline event listeners using window events.
 * @param setIsOnline State setter for online status (e.g., a React state setter)
 * @param onOnline Optional callback for when device comes online
 * @param onOffline Optional callback for when device goes offline
 * @returns Cleanup function to remove event listeners. Returns a no-op if window is not defined.
 */
export function setupNetworkListeners(
  setIsOnline: (isOnline: boolean) => void,
  onOnline?: () => void,
  onOffline?: () => void
): () => void {
  // Ensure window is defined (for server-side rendering or non-browser environments)
  if (typeof window === 'undefined') {
    console.warn("setupNetworkListeners: window object not found. Listeners not attached.");
    return () => {}; // Return a no-op function if window is not available
  }

  const handleOnline = () => {
    console.log('Network connection restored');
    setIsOnline(true);
    if (onOnline) onOnline();
  };

  const handleOffline = () => {
    console.log('Network connection lost');
    setIsOnline(false);
    if (onOffline) onOffline();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// Re-exports removed as functions will be merged directly.