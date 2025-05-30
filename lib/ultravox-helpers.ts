/**
 * Helper functions for working with the Ultravox API
 */

/**
 * Checks if a message contains indicators that the conversation should end
 * This helps detect when the AI agent is trying to end the call
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
