/**
 * Network utility functions for testing connectivity
 * 
 * This module contains functions for checking network connectivity,
 * testing API endpoints, and validating WebSocket connections.
 */

"use client";

import axios from 'axios';

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
    console.warn('API connectivity test failed:', error);
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
 * Test all endpoints needed for the application to function
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
 * Tests a specific API endpoint
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
    
    const config = {
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
 * Checks the device's online status
 * @returns Current online status
 */
export function getOnlineStatus(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
    ? navigator.onLine
    : true; // Assume online if we can't detect
}

/**
 * Sets up online/offline event listeners
 * @param setIsOnline State setter for online status
 * @param onOnline Callback for when device comes online
 * @param onOffline Callback for when device goes offline
 * @returns Cleanup function to remove event listeners
 */
export function setupNetworkListeners(
  setIsOnline: (isOnline: boolean) => void,
  onOnline?: () => void,
  onOffline?: () => void
): () => void {
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
