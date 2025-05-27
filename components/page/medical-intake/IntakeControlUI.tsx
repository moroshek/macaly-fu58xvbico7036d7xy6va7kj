"use client";

import React from 'react';
import { Mic, X, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UIState, PULSING_ANIMATION_CONFIG, UI_STATES } from '@/lib/config';
import { MicrophonePermissionResult, checkMicrophonePermissions } from '@/lib/browser-compat'; // Assuming this is the correct path and MicrophonePermissionResult is exported

// Define InterviewPulsingAnimation directly in this file
const InterviewPulsingAnimation = () => (
  <div className="w-full h-full flex items-center justify-center">
    <div className="relative flex items-center justify-center">
      {[...Array(PULSING_ANIMATION_CONFIG.count)].map((_, i) => (
        <div
          key={i}
          className="absolute w-32 h-32 bg-teal-400/30 rounded-full animate-pulse"
          style={{
            animationDelay: `${i * PULSING_ANIMATION_CONFIG.delayIncrement}s`,
            animationDuration: `${PULSING_ANIMATION_CONFIG.duration}s`,
            transform: `scale(${1 + i * PULSING_ANIMATION_CONFIG.scaleIncrement})`,
            opacity: PULSING_ANIMATION_CONFIG.initialOpacity - i * PULSING_ANIMATION_CONFIG.opacityDecrement,
          }}
        />
      ))}
      <Mic size={48} className="text-teal-600 relative z-10" />
    </div>
  </div>
);

export interface IntakeControlUIProps {
  uiState: UIState;
  uvStatus: string; // Consider using UltravoxStatusType if defined globally
  hasAudioPermission: boolean | null;
  errorMessage: string;
  currentTranscriptLength: number;
  getStatusText: () => string;
  handleStartInterview: () => Promise<void>;
  handleEndInterview: () => Promise<void>;
  resetAllAndStartNew: () => void;
  resetAll: () => void; // For error state
  // checkMicrophonePermissions is used internally in app/page.tsx for the error button, so pass setters instead
  setAudioPermission: (hasPermission: boolean | null) => void;
  setError: (errorMessage: string) => void;
  // Adding checkMicrophonePermissions to props as it is used by a button in the error UI state
  checkMicrophonePermissions: () => Promise<MicrophonePermissionResult>;
}

const IntakeControlUI: React.FC<IntakeControlUIProps> = ({
  uiState,
  uvStatus,
  hasAudioPermission,
  errorMessage,
  currentTranscriptLength,
  getStatusText,
  handleStartInterview,
  handleEndInterview,
  resetAllAndStartNew,
  resetAll,
  setAudioPermission,
  setError,
  checkMicrophonePermissions,
}) => {
  return (
    <div className="relative h-[400px] rounded-lg overflow-hidden bg-gradient-to-br from-teal-50 to-blue-50 border border-teal-100 shadow-md flex flex-col">
      <div className="p-6 flex-1 flex flex-col items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm font-medium text-gray-600 mb-6">
            {getStatusText()}
          </p>

          {uiState === UI_STATES.IDLE && (
            <div className="space-y-6">
              <button
                onClick={handleStartInterview}
                disabled={hasAudioPermission === false}
                className="w-24 h-24 mx-auto bg-teal-500 rounded-full flex items-center justify-center hover:bg-teal-600 transition-colors cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                aria-label="Start medical intake"
              >
                <Mic size={32} className="text-white" />
              </button>
              <Button
                onClick={handleStartInterview}
                size="lg"
                className="bg-teal-500 hover:bg-teal-600"
                disabled={hasAudioPermission === false}
              >
                Start Medical Intake
              </Button>
              {hasAudioPermission === false && (
                <p className="text-red-500 text-sm mt-2">
                  Microphone access required to start interview
                </p>
              )}
            </div>
          )}

          {uiState === UI_STATES.REQUESTING_PERMISSIONS && (
            <div className="space-y-6">
              <div className="w-24 h-24 mx-auto bg-orange-100 rounded-full flex items-center justify-center">
                <Mic size={32} className="text-orange-500 animate-pulse" />
              </div>
              <div className="space-y-2">
                <p className="text-orange-600 font-medium">Requesting Microphone Access</p>
                <p className="text-sm text-gray-500">Please allow microphone access when prompted</p>
              </div>
            </div>
          )}

          {uiState === UI_STATES.INITIATING && (
            <div className="space-y-6">
              <div className="w-24 h-24 mx-auto bg-teal-100 rounded-full flex items-center justify-center">
                <Loader2 size={32} className="text-teal-500 animate-spin" />
              </div>
              <p className="text-gray-500">Connecting to AI assistant...</p>
            </div>
          )}

          {uiState === UI_STATES.INTERVIEWING && (
            <div className="space-y-6">
              <InterviewPulsingAnimation />
              <div className="space-y-2">
                <p className="text-green-600 font-medium">Interview Active</p>
                <p className="text-sm text-gray-500">Status: {uvStatus}</p>
                <Button
                  onClick={handleEndInterview}
                  variant="destructive"
                  size="sm"
                >
                  End Interview
                </Button>
              </div>
            </div>
          )}

          {uiState === UI_STATES.PROCESSING_TRANSCRIPT && (
            <div className="space-y-6">
              <div className="w-24 h-24 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                <Loader2 size={32} className="text-blue-500 animate-spin" />
              </div>
              <div className="space-y-2">
                <p className="text-blue-600 font-medium">Processing Interview</p>
                <p className="text-sm text-gray-500">
                  Analyzing conversation and generating summary...
                </p>
              </div>
            </div>
          )}

          {uiState === UI_STATES.DISPLAYING_RESULTS && (
            <div className="space-y-6">
              <div className="w-24 h-24 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <div className="space-y-2">
                <p className="text-green-600 font-medium">Interview Complete</p>
                <Button
                  onClick={resetAllAndStartNew}
                  variant="outline"
                  size="sm"
                >
                  Start New Interview
                </Button>
              </div>
            </div>
          )}

          {uiState === UI_STATES.ERROR && (
            <div className="space-y-6">
              <div className="w-24 h-24 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                <X size={32} className="text-red-500" />
              </div>
              <div className="space-y-2">
                <p className="text-red-600 font-medium">Error Occurred</p>
                {errorMessage && (
                  <p className="text-sm text-red-500 px-4">{errorMessage}</p>
                )}
                <div className="space-y-2">
                  <Button
                    onClick={resetAll}
                    variant="outline"
                    size="sm"
                  >
                    Try Again
                  </Button>
                  {hasAudioPermission === false && (
                    <Button
                      onClick={async () => {
                        const result = await checkMicrophonePermissions(); // Directly call the passed prop
                        setAudioPermission(result.granted);
                        if (!result.granted && result.error) {
                          setError(result.error);
                        }
                      }}
                      variant="outline"
                      size="sm"
                    >
                      Request Microphone Access
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {currentTranscriptLength > 0 && (
            <div className="mt-6">
              <p className="text-xs text-gray-500 mb-2">
                Conversation: {currentTranscriptLength} messages
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntakeControlUI;
