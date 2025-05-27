/**
 * Browser compatibility check utilities
 * 
 * This module contains functions for checking browser compatibility with
 * features required by the application, like WebRTC, AudioContext, and WebSockets.
 */

"use client";

/**
 * Type for browser compatibility check results
 */
export interface CompatibilityCheckResult {
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
 * Checks if the current browser supports all required features
 * @returns Object with compatibility check results
 */
export function checkBrowserCompatibility(): CompatibilityCheckResult {
  const issues: string[] = [];
  const details = {
    mediaDevices: false,
    webSockets: false,
    webAudio: false,
    permissions: false
  };
  
  // Check MediaDevices API (for microphone access)
  if (!navigator.mediaDevices) {
    issues.push("MediaDevices API not available");
  } else {
    details.mediaDevices = true;
  }
  
  // Check WebSocket support
  if (!window.WebSocket) {
    issues.push("WebSocket not available");
  } else {
    details.webSockets = true;
  }
  
  // Check Web Audio API
  if (!window.AudioContext && !(window as any).webkitAudioContext) {
    issues.push("Web Audio API not available");
  } else {
    details.webAudio = true;
  }
  
  // Check Permissions API (optional)
  if (!navigator.permissions) {
    // This is not critical but useful for better UX
    console.log("Permissions API not available - will use fallback methods");
  } else {
    details.permissions = true;
  }
  
  if (issues.length > 0) {
    console.error("❌ Browser compatibility issues:", issues);
    return {
      compatible: false,
      issues,
      details
    };
  }
  
  console.log("✅ Browser compatibility: OK");
  return {
    compatible: true,
    issues: [],
    details
  };
}

/**
 * Checks if Web Audio API is supported and functional
 * @returns Promise resolving to a check result object
 */
export async function validateAudioSupport(): Promise<{
  supported: boolean;
  state?: string;
  sampleRate?: number;
  error?: string;
}> {
  if (!window.AudioContext && !(window as any).webkitAudioContext) {
    return { supported: false, error: "Web Audio API not supported" };
  }
  
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextClass();
    
    // Try to resume the context if it's suspended
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (e) {
        return { 
          supported: true, 
          state: audioContext.state,
          sampleRate: audioContext.sampleRate,
          error: `Context resume failed: ${e instanceof Error ? e.message : String(e)}`
        };
      }
    }
    
    const result = { 
      supported: true, 
      state: audioContext.state,
      sampleRate: audioContext.sampleRate 
    };
    
    // Clean up
    if (audioContext.close) {
      await audioContext.close();
    }
    
    return result;
  } catch (e) {
    return { 
      supported: false, 
      error: `Audio context creation failed: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

/**
 * Checks if microphone permissions are granted
 * @returns Promise resolving to a check result
 */
export async function checkMicrophonePermissions(): Promise<{
  granted: boolean;
  state?: PermissionState;
  error?: string;
}> {
  // Try to use the Permissions API first if available
  if (navigator.permissions) {
    try {
      const permissionStatus = await navigator.permissions.query({ 
        name: 'microphone' as PermissionName 
      });
      
      return {
        granted: permissionStatus.state === 'granted',
        state: permissionStatus.state
      };
    } catch (e) {
      console.log("Permissions API failed, falling back to getUserMedia", e);
      // Fall back to getUserMedia if Permissions API fails
    }
  }
  
  // Fall back to getUserMedia
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Permission granted, stop the stream immediately
    stream.getTracks().forEach(track => track.stop());
    return { granted: true };
  } catch (e) {
    const error = e as Error;
    let errorMessage = "Microphone access denied";
    
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          errorMessage = "Microphone access denied by user. Please allow microphone access and try again.";
          break;
        case 'NotFoundError':
          errorMessage = "No microphone found on this device. Please connect a microphone and try again.";
          break;
        case 'NotReadableError':
          errorMessage = "Microphone is already in use by another application. Please close other applications and try again.";
          break;
        case 'OverconstrainedError':
          errorMessage = "Microphone constraints not supported. Please try with a different microphone.";
          break;
        case 'SecurityError':
          errorMessage = "Microphone access blocked by security settings. Please check your browser security settings.";
          break;
        default:
          errorMessage = `Microphone error: ${error.name} - ${error.message}`;
      }
    }
    
    return {
      granted: false,
      error: errorMessage
    };
  }
}

/**
 * Checks if the device has both a microphone and speaker (for full audio support)
 * @returns Promise resolving to a check result
 */
export async function checkAudioDevices(): Promise<{
  microphone: boolean;
  speaker: boolean;
  devices?: MediaDeviceInfo[];
  error?: string;
}> {
  try {
    // First check if we have permission to enumerate devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // Filter for audio devices
    const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
    const audioOutputDevices = devices.filter(device => device.kind === 'audiooutput');
    
    return {
      microphone: audioInputDevices.length > 0,
      speaker: audioOutputDevices.length > 0,
      devices: [...audioInputDevices, ...audioOutputDevices]
    };
  } catch (e) {
    return {
      microphone: false,
      speaker: false,
      error: `Failed to enumerate audio devices: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}
