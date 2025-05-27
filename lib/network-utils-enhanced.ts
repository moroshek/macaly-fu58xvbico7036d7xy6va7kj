/**
 * Enhanced network utility functions with circuit breaker pattern and better error handling
 */

import axios, { AxiosRequestConfig } from 'axios';

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

  const details = {
    mediaDevices: false,
    webSockets: false,
    webAudio: false,
    permissions: false,
    webRTC: false,
    localStorage: false,
    serviceWorker: false
  };

  // Critical checks
  if (!navigator.mediaDevices) {
    criticalIssues.push("MediaDevices API not available - microphone access impossible");
    recommendations.push("Please use a modern browser like Chrome 53+, Firefox 36+, or Safari 11+");
  } else {
    details.mediaDevices = true;
  }

  if (!window.WebSocket) {
    criticalIssues.push("WebSocket not available - real-time communication impossible");
    recommendations.push("Please update your browser to support WebSocket");
  } else {
    details.webSockets = true;
  }

  if (!window.AudioContext && !(window as any).webkitAudioContext) {
    criticalIssues.push("Web Audio API not available - audio processing impossible");
    recommendations.push("Please use a browser that supports Web Audio API");
  } else {
    details.webAudio = true;
  }

  // WebRTC check
  if (!window.RTCPeerConnection && !(window as any).webkitRTCPeerConnection) {
    warnings.push("WebRTC not fully supported - some features may not work");
  } else {
    details.webRTC = true;
  }

  // Optional but useful checks
  if (!navigator.permissions) {
    warnings.push("Permissions API not available - permission management will use fallbacks");
  } else {
    details.permissions = true;
  }

  if (!window.localStorage) {
    warnings.push("localStorage not available - settings won't persist");
  } else {
    details.localStorage = true;
  }

  if (!('serviceWorker' in navigator)) {
    warnings.push("Service Worker not available - offline functionality disabled");
  } else {
    details.serviceWorker = true;
  }

  // Browser-specific recommendations
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

  private intervalId: NodeJS.Timeout | null = null;

  constructor(private testUrl: string = 'https://www.google.com/favicon.ico') { }

  start(intervalMs: number = 30000) {
    this.stop(); // Ensure no duplicate intervals

    this.intervalId = setInterval(() => {
      this.measureLatency();
    }, intervalMs);

    // Initial measurement
    this.measureLatency();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async measureLatency() {
    const startTime = Date.now();

    try {
      await fetch(this.testUrl, {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

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
  latency?: number;
  error?: string;
  protocolSupported?: boolean;
}> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let ws: WebSocket;

    const cleanup = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve({
        success: false,
        error: `WebSocket connection timeout after ${timeoutMs}ms`
      });
    }, timeoutMs);

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        const latency = Date.now() - startTime;
        clearTimeout(timeoutId);
        cleanup();

        resolve({
          success: true,
          latency,
          protocolSupported: true
        });
      };

      ws.onerror = (error) => {
        clearTimeout(timeoutId);
        cleanup();

        resolve({
          success: false,
          error: `WebSocket connection error: ${error}`,
          protocolSupported: true // WebSocket API exists, but connection failed
        });
      };

      ws.onclose = (event) => {
        clearTimeout(timeoutId);

        if (event.wasClean) {
          resolve({
            success: true,
            latency: Date.now() - startTime,
            protocolSupported: true
          });
        } else {
          resolve({
            success: false,
            error: `WebSocket closed unexpectedly: ${event.code} ${event.reason}`,
            protocolSupported: true
          });
        }
      };

    } catch (error) {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: `WebSocket not supported: ${error}`,
        protocolSupported: false
      });
    }
  });
}

/**
 * Export the existing functions for backwards compatibility
 */
export {
  testNetworkConnectivity,
  checkApiConnectivity,
  getOnlineStatus,
  setupNetworkListeners
} from './network-utils';