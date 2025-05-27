/**
 * Ultravox-specific debugging utilities
 * 
 * This module contains functions for debugging and testing Ultravox sessions,
 * connections, and transcripts. These utilities help diagnose issues with
 * the voice AI integration.
 */

"use client";

import { UltravoxSession } from 'ultravox-client';

/**
 * Debug information about the current Ultravox session state
 * @param uvSession The current Ultravox session object
 * @param uvStatus Current session status string
 * @param isInterviewActive Whether an interview is currently active
 * @param hasAudioPermission Whether microphone permissions have been granted
 * @param uiState Current UI state of the application
 * @param currentTranscript Array of conversation utterances
 * @param callId Current call ID
 * @param isOnline Whether the device is online
 * @param errorMessage Any current error message
 */
export function debugUltravoxState({
  uvSession,
  uvStatus,
  isInterviewActive,
  hasAudioPermission,
  uiState,
  currentTranscript,
  callId,
  isOnline,
  errorMessage
}: {
  uvSession: any;
  uvStatus: string;
  isInterviewActive: boolean;
  hasAudioPermission: boolean | null;
  uiState: string;
  currentTranscript: Array<{ speaker: string; text: string }>;
  callId: string;
  isOnline: boolean;
  errorMessage: string;
}) {
  console.log("=== ULTRAVOX DEBUG STATE ===");
  console.log("UV Session:", !!uvSession);
  console.log("UV Status:", uvStatus);
  console.log("Is Interview Active:", isInterviewActive);
  console.log("Has Audio Permission:", hasAudioPermission);
  console.log("UI State:", uiState);
  console.log("Transcript Length:", currentTranscript.length);
  console.log("Call ID:", callId);
  console.log("Is Online:", isOnline);
  console.log("Error Message:", errorMessage);

  if (uvSession) {
    console.log("Mic Muted:", uvSession.isMicMuted?.());
    console.log("Speaker Muted:", uvSession.isSpeakerMuted?.());
    console.log("Session Transcripts Length:", uvSession.transcripts?.length || 0);
  }

  // Debug transcript content if available
  if (currentTranscript.length > 0) {
    console.log("--- Transcript Preview ---");
    currentTranscript.slice(0, 3).forEach((utterance, index) => {
      console.log(`${index + 1}. ${utterance.speaker}: "${utterance.text.substring(0, 50)}..."`); 
    });
  }

  console.log("=== END ULTRAVOX DEBUG ===");
}

/**
 * Test WebSocket connectivity to a given URL
 * @param joinUrl The WebSocket URL to test connecting to
 * @returns Promise that resolves when the test is complete
 */
export function testWebSocketConnection(joinUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      console.log("Testing WebSocket connection to:", joinUrl.substring(0, 20) + "...");
      const ws = new WebSocket(joinUrl);
      
      const timeoutId = setTimeout(() => {
        console.log("❌ WebSocket test: TIMEOUT");
        ws.close();
        resolve(false);
      }, 5000);
      
      ws.onopen = () => {
        console.log("✅ WebSocket test: SUCCESS");
        clearTimeout(timeoutId);
        ws.close();
        resolve(true);
      };
      
      ws.onerror = (error) => {
        console.log("❌ WebSocket test: FAILED", error);
        clearTimeout(timeoutId);
        resolve(false);
      };
    } catch (e) {
      console.log("❌ WebSocket test exception:", e);
      resolve(false);
    }
  });
}

/**
 * Check if a message contains indicators that the conversation should end
 * This helps detect when the AI agent is trying to end the call
 * @param message The message object to check
 * @returns boolean indicating if the conversation should end
 */
export function shouldEndConversation(message: any): boolean {
  // If there's no message, we can't check it
  if (!message) return false;
  
  // Check for explicit hangUp tool calls
  if (message.toolCalls && Array.isArray(message.toolCalls)) {
    const hangUpCall = message.toolCalls.find((call: any) => {
      if (!call) return false;
      
      // Direct name checks
      if (call.toolName === 'hangUp' || call.name === 'hangUp') return true;
      
      // Case-insensitive checks on tool names
      if (typeof call.toolName === 'string' && 
          (call.toolName.toLowerCase() === 'hangup' || 
           call.toolName.toLowerCase() === 'hang_up' || 
           call.toolName.toLowerCase() === 'hang-up')) return true;
      
      if (typeof call.name === 'string' && 
          (call.name.toLowerCase() === 'hangup' || 
           call.name.toLowerCase() === 'hang_up' || 
           call.name.toLowerCase() === 'hang-up')) return true;
      
      // Stringify the call and check for hangUp references
      try {
        const callStr = JSON.stringify(call).toLowerCase();
        return callStr.includes('hangup') || 
               callStr.includes('hang_up') || 
               callStr.includes('hang-up');
      } catch {
        return false;
      }
    });
    
    if (hangUpCall) return true;
  }
  
  // Text phrases that indicate the conversation is ending
  const endPhrases = [
    'hangup', 'hang up', 'hang_up', 'hang-up',
    'end call', 'end of call', 'ending call', 'call ended',
    'interview complete', 'interview is complete', 'interview is now complete',
    'thank you for completing', 'thank you for your time',
    'take care', 'goodbye', 'have a good day',
    'thanks for answering', 'thanks for providing',
    'thank you for providing', 'all done', 'all finished',
    'is there anything else', 'that concludes'
  ];
  
  // Check message.content
  if (message.content && typeof message.content === 'string') {
    const contentLower = message.content.toLowerCase();
    for (const phrase of endPhrases) {
      if (contentLower.includes(phrase)) return true;
    }
  }
  
  // Check message.text
  if (message.text && typeof message.text === 'string') {
    const textLower = message.text.toLowerCase();
    for (const phrase of endPhrases) {
      if (textLower.includes(phrase)) return true;
    }
  }
  
  // As a last resort, stringify the whole message and check
  try {
    const msgStr = JSON.stringify(message).toLowerCase();
    for (const phrase of endPhrases) {
      if (msgStr.includes(phrase)) return true;
    }
    
    // Also check for special JSON keys that might indicate ending
    if (msgStr.includes('"end"') || 
        msgStr.includes('"terminate"') || 
        msgStr.includes('"complete"') ||
        msgStr.includes('"finished"')) {
      return true;
    }
  } catch {
    // If we can't stringify, just continue
  }
  
  return false;
}

/**
 * Validates a UltravoxSession configuration
 * @param config Configuration object for the Ultravox session
 * @returns An object with validation results
 */
export function validateSessionConfig(config: any) {
  const issues: string[] = [];
  
  if (!config) {
    issues.push("No configuration object provided");
    return { valid: false, issues };
  }
  
  // Check if experimentalMessages is set correctly
  if (config.experimentalMessages !== true) {
    issues.push("experimentalMessages should be set to true for proper functionality");
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Debug function to check audio state and test microphone access
 * @returns Promise that resolves when tests are complete
 */
export async function debugAudioState() {
  console.log("=== AUDIO DEBUG STATE ===");
  
  // Test audio context
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    console.log("Audio Context State:", audioContext.state);
    
    // Try to resume if suspended
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        console.log("Audio Context Resume Result:", audioContext.state);
      } catch (e) {
        console.log("Failed to resume AudioContext:", e);
      }
    }
  } catch (e) {
    console.log("Audio Context Error:", e);
  }

  // Test microphone access
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Microphone test: SUCCESS");
    // Print audio tracks info
    stream.getAudioTracks().forEach(track => {
      console.log("Audio Track:", track.label, "- Enabled:", track.enabled);
    });
    // Stop all tracks when done
    stream.getTracks().forEach(track => track.stop());
  } catch (error) {
    console.log("Microphone test: FAILED", error);
  }

  console.log("=== END AUDIO DEBUG ===");
}
