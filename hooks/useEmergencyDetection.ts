"use client";

import { useCallback } from 'react';

const useEmergencyDetection = () => {
  const emergencyKeywords = [
    'chest pain', 'can\'t breathe', 'shortness of breath', 'heart attack',
    'stroke', 'unconscious', 'severe pain', 'bleeding heavily', 
    'suicidal', 'overdose', 'can\'t feel', 'numbness', 'confusion',
    'dizzy', 'faint', 'emergency', 'call 911', 'ambulance'
  ];

  const detectEmergency = useCallback((text: string) => {
    const lowercaseText = text.toLowerCase();
    const detectedKeywords = emergencyKeywords.filter(keyword => 
      lowercaseText.includes(keyword)
    );

    if (detectedKeywords.length > 0) {
      console.warn('[Emergency Detection] Potential emergency keywords detected:', detectedKeywords);
      
      // Show emergency notice
      const shouldCall911 = window.confirm(`
        🚨 EMERGENCY NOTICE 🚨
        
        You mentioned: "${detectedKeywords.join(', ')}"
        
        If this is a medical emergency:
        • Call 911 immediately
        • Go to the nearest emergency room
        • This AI interview cannot replace emergency medical care
        
        Click OK if you need emergency help (will show 911 info)
        Click Cancel to continue with the interview
      `);

      if (shouldCall911) {
        showEmergencyInstructions();
        return true;
      }
    }
    
    return false;
  }, [emergencyKeywords]);

  const showEmergencyInstructions = () => {
    alert(`
      🚨 CALL 911 IMMEDIATELY 🚨
      
      For life-threatening emergencies:
      📞 Call: 911
      
      Tell them:
      • Your location
      • Nature of emergency
      • Number of people involved
      
      Stay on the line until help arrives.
    `);
  };

  return { detectEmergency };
};

export default useEmergencyDetection;