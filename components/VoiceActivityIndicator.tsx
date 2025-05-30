"use client";

import React from 'react';
import { Mic, Volume2, Brain, Wifi } from 'lucide-react';

// Define the possible statuses for Ultravox
export type UltravoxStatusType = 
  | 'listening' 
  | 'speaking' 
  | 'thinking' 
  | 'connected' 
  | 'idle' 
  | 'disconnected' 
  | 'error' 
  | 'connecting' // Explicitly add based on default text
  | 'unknown'    // From useUltravoxSession
  | string; // Allow other string values for flexibility

export interface VoiceActivityIndicatorProps {
  uvStatus: UltravoxStatusType;
  isInterviewActive: boolean;
}

const VoiceActivityIndicator: React.FC<VoiceActivityIndicatorProps> = ({ uvStatus, isInterviewActive }) => {
  if (!isInterviewActive) return null;

  // Define a type for the status configuration object
  type StatusConfig = {
    icon: JSX.Element;
    text: string;
    bgColor: string;
    pulseColor: string;
    textColor: string;
    bgOpacity: string;
    isActive: boolean;
  };

  const getStatusConfig = (): StatusConfig => {
    switch (uvStatus) {
      case 'listening':
        return {
          icon: <Mic className="w-5 h-5" />,
          text: 'Listening to you...',
          bgColor: 'bg-red-500',
          pulseColor: 'bg-red-400',
          textColor: 'text-red-700',
          bgOpacity: 'bg-red-50',
          isActive: true,
        };
      case 'speaking':
        return {
          icon: <Volume2 className="w-5 h-5" />,
          text: 'AI is speaking...',
          bgColor: 'bg-blue-500',
          pulseColor: 'bg-blue-400',
          textColor: 'text-blue-700',
          bgOpacity: 'bg-blue-50',
          isActive: true,
        };
      case 'thinking': // Also known as 'processing' in some contexts
        return {
          icon: <Brain className="w-5 h-5" />,
          text: 'AI is thinking...',
          bgColor: 'bg-purple-500',
          pulseColor: 'bg-purple-400',
          textColor: 'text-purple-700',
          bgOpacity: 'bg-purple-50',
          isActive: true,
        };
      case 'connected':
      case 'idle':
        return {
          icon: <Wifi className="w-5 h-5" />,
          text: 'Connected - Ready',
          bgColor: 'bg-green-500',
          pulseColor: 'bg-green-400',
          textColor: 'text-green-700',
          bgOpacity: 'bg-green-50',
          isActive: false,
        };
      case 'disconnected':
      case 'error':
        return {
          icon: <Wifi className="w-5 h-5 text-red-500" />, // Indicate error state
          text: uvStatus === 'error' ? 'Error occurred' : 'Disconnected',
          bgColor: 'bg-red-500',
          pulseColor: 'bg-red-400',
          textColor: 'text-red-700',
          bgOpacity: 'bg-red-50',
          isActive: false,
        };
      default: // Covers 'connecting', 'unknown', and any other string
        return {
          icon: <Wifi className="w-5 h-5" />,
          text: 'Connecting...', // Default or specific like uvStatus
          bgColor: 'bg-gray-500',
          pulseColor: 'bg-gray-400',
          textColor: 'text-gray-700',
          bgOpacity: 'bg-gray-50',
          isActive: false,
        };
    }
  };

  const config: StatusConfig = getStatusConfig();

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className={`${config.bgOpacity} backdrop-blur-md rounded-full px-6 py-3 shadow-lg border border-white/20 transition-all duration-300`}>
        <div className="flex items-center space-x-3">
          {/* Animated Icon Container */}
          <div className="relative">
            {config.isActive && (
              <>
                {/* Pulsing rings animation */}
                <div className={`absolute inset-0 ${config.pulseColor} rounded-full animate-ping opacity-25`} />
                <div className={`absolute inset-0 ${config.pulseColor} rounded-full animate-ping opacity-25 animation-delay-200`} />
              </>
            )}
            <div className={`relative ${config.bgColor} text-white rounded-full p-2 transition-all duration-300`}>
              {config.icon}
            </div>
          </div>

          {/* Status Text */}
          <div className="flex flex-col">
            <span className={`font-medium ${config.textColor} text-sm`}>
              {config.text}
            </span>
            {config.isActive && (
              <div className="flex space-x-1 mt-1">
                {/* Animated voice bars */}
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 ${config.bgColor} rounded-full animate-pulse`}
                    style={{
                      height: `${Math.random() * 12 + 8}px`,
                      animationDelay: `${i * 100}ms`,
                      animationDuration: `${600 + i * 100}ms`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceActivityIndicator;