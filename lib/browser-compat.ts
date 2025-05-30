// lib/browser-compat.ts

export interface MicrophonePermissionResult {
  granted: boolean;
  error?: string;
}

export function checkBrowserCompatibility(): { compatible: boolean; issues: string[] } {
  console.log('checkBrowserCompatibility() called');
  const issues: string[] = [];
  
  // Check for required browser features
  if (typeof window === 'undefined') {
    issues.push('Not running in a browser environment');
  } else {
    if (!navigator.mediaDevices) {
      issues.push('MediaDevices API not available');
    }
    
    if (!window.WebSocket) {
      issues.push('WebSocket API not available');
    }
    
    if (!window.AudioContext && !(window as any).webkitAudioContext) {
      issues.push('Web Audio API not available');
    }
    
    if (!navigator.permissions) {
      issues.push('Permissions API not available (fallback will be used)');
    }
  }
  
  return { 
    compatible: issues.filter(issue => !issue.includes('fallback')).length === 0, 
    issues 
  };
}

export async function checkMicrophonePermissions(): Promise<MicrophonePermissionResult> {
  console.log('checkMicrophonePermissions() called');
  
  try {
    // First try to check permission status using Permissions API
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (result.state === 'denied') {
          return { 
            granted: false, 
            error: 'Microphone access was previously denied. Please check your browser settings.' 
          };
        }
      } catch (e) {
        // Permissions API might not support 'microphone' query in some browsers
        console.log('Permissions API query failed, falling back to getUserMedia test');
      }
    }
    
    // Try to get user media to check actual permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Stop all tracks immediately as we're just checking permission
    stream.getTracks().forEach(track => track.stop());
    
    return { granted: true };
    
  } catch (error) {
    console.error('Microphone permission check failed:', error);
    
    let errorMessage = 'Microphone access denied';
    
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          errorMessage = 'Microphone access denied. Please allow microphone access to use this application.';
          break;
        case 'NotFoundError':
          errorMessage = 'No microphone found. Please connect a microphone and try again.';
          break;
        case 'NotReadableError':
          errorMessage = 'Microphone is already in use by another application.';
          break;
        case 'SecurityError':
          errorMessage = 'Microphone access blocked due to insecure context (HTTPS required).';
          break;
        default:
          errorMessage = `Microphone access error: ${error.message}`;
      }
    }
    
    return { granted: false, error: errorMessage };
  }
}
