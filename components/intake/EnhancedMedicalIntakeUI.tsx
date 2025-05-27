"use client";

import React, { useState, useEffect, useContext } from 'react';
import { toast } from 'sonner';
import StatusIndicator from './StatusIndicator';
import LiveTranscriptDisplay from './LiveTranscriptDisplay';
import UltravoxErrorBoundary from './UltravoxErrorBoundary';
import useMicrophonePermission from '@/hooks/useMicrophonePermission';
import usePrivacyCompliance from '@/hooks/usePrivacyCompliance';
import useEmergencyDetection from '@/hooks/useEmergencyDetection';
import useAccessibilityFeatures from '@/hooks/useAccessibilityFeatures';
import { SessionContext } from './MedicalIntakeSession';
import DebugButton from './DebugButton';
import { Utterance } from '@/lib/types'; // Updated import path for Utterance
import { SCREEN_READER_ANNOUNCEMENT_MAX_LENGTH, UIState } from '@/lib/config'; // Imported UIState
import { UltravoxStatusType } from '../VoiceActivityIndicator'; // Imported UltravoxStatusType

interface EnhancedMedicalIntakeUIProps {
  children?: React.ReactNode;
  onStartInterview?: () => void;
  onEndInterview?: () => void;
  currentTranscript: Utterance[];
  uvStatus: UltravoxStatusType; // Used UltravoxStatusType
  uiState: UIState; // Used UIState
}

const EnhancedMedicalIntakeUI: React.FC<EnhancedMedicalIntakeUIProps> = ({
  children, 
  onStartInterview,
  onEndInterview,
  currentTranscript,
  uvStatus,
  uiState
}) => {
  const { hasPermission, permissionError, requestPermission } = useMicrophonePermission();
  const { privacyAccepted, requestPrivacyConsent } = usePrivacyCompliance();
  const { detectEmergency } = useEmergencyDetection();
  const { announceToScreenReader, highContrast, reducedMotion } = useAccessibilityFeatures();
  const [isRecording, setIsRecording] = useState(false);
  const sessionContext = useContext(SessionContext);

  // Set recording state based on uvStatus
  useEffect(() => {
    setIsRecording(uvStatus === 'listening');
  }, [uvStatus]);

  // Emergency detection when new user messages are added
  useEffect(() => {
    if (currentTranscript.length > 0) {
      const lastUtterance = currentTranscript[currentTranscript.length - 1];
      if (lastUtterance.speaker === 'user') {
        detectEmergency(lastUtterance.text);
      }

      // Announce to screen readers
      const announcementText = lastUtterance.text.substring(0, SCREEN_READER_ANNOUNCEMENT_MAX_LENGTH);
      const fullAnnouncement = `${lastUtterance.speaker === 'user' ? 'You said' : 'AI said'}: ${announcementText}${lastUtterance.text.length > SCREEN_READER_ANNOUNCEMENT_MAX_LENGTH ? '...' : ''}`;
      announceToScreenReader(fullAnnouncement);
    }
  }, [currentTranscript, detectEmergency, announceToScreenReader]);

  // Debug function to log current state
  const debugTranscriptState = () => {
    console.log('=== TRANSCRIPT DEBUG STATE ===');
    console.log(`Current transcript length: ${currentTranscript.length}`);
    console.log(`Connection status: ${uvStatus}`);
    console.log(`UI State: ${uiState}`);
    console.log('Current transcript state:', currentTranscript);
    
    if (sessionContext?.uvSession) {
      console.log(`Session status: ${sessionContext.sessionState.sessionStatus}`);
      console.log('Session data:', sessionContext.sessionState);
    }
    
    console.log('=== END DEBUG STATE ===');
    
    // Show toast for user feedback
    toast.info('Debug info logged to console', {
      description: `Transcript has ${currentTranscript.length} messages`
    });
  };

  // Privacy consent check
  useEffect(() => {
    if (!privacyAccepted && onStartInterview) {
      requestPrivacyConsent().then(accepted => {
        if (!accepted) {
          toast.error('Privacy consent required', {
            description: 'You must accept the privacy terms to use this feature.'
          });
        }
      });
    }
  }, [privacyAccepted, requestPrivacyConsent, onStartInterview]);

  if (permissionError) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          <h3 className="font-bold">Microphone Access Required</h3>
          <p className="mt-2">{permissionError}</p>
          <button 
            className="mt-3 bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
            onClick={requestPermission}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <UltravoxErrorBoundary>
      <div className={`
        max-w-4xl mx-auto p-6 space-y-6 
        ${highContrast ? 'bg-black text-white' : ''}
        ${reducedMotion ? '' : 'transition-all duration-300'}
      `}>
        {process.env.NODE_ENV === 'development' && (
          <DebugButton onClick={debugTranscriptState} />
        )}

        <StatusIndicator 
          status={uvStatus}
          isRecording={isRecording}
          transcriptLength={currentTranscript.length}
        />
        
        <LiveTranscriptDisplay transcript={currentTranscript} />
        
        {/* Main content from parent */}
        {children}
        
        {/* Emergency warning banner */}
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
          <strong>⚠️ Important:</strong> If this is a medical emergency, call 911 immediately.
        </div>
      </div>
    </UltravoxErrorBoundary>
  );
};

export default EnhancedMedicalIntakeUI;