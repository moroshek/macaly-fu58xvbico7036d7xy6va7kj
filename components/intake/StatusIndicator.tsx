"use client";

import React from 'react';

interface StatusIndicatorProps {
  status: string;
  isRecording: boolean;
  transcriptLength: number;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ 
  status, 
  isRecording, 
  transcriptLength 
}) => {
  const getStatusInfo = () => {
    switch (status) {
      case 'connecting':
        return { 
          color: 'bg-yellow-500', 
          text: 'Connecting to AI doctor...', 
          icon: '🔄' 
        };
      case 'idle':
        return { 
          color: 'bg-blue-500', 
          text: 'Connected. Ready to start.', 
          icon: '✅' 
        };
      case 'listening':
        return { 
          color: isRecording ? 'bg-green-500 animate-pulse' : 'bg-gray-500', 
          text: isRecording ? 'Listening... Please speak' : 'AI is ready. Click Record to speak', 
          icon: isRecording ? '🎤' : '⏸️' 
        };
      case 'thinking':
        return { 
          color: 'bg-purple-500 animate-pulse', 
          text: 'AI is thinking...', 
          icon: '🤔' 
        };
      case 'speaking':
        return { 
          color: 'bg-orange-500 animate-pulse', 
          text: 'AI is speaking. You can interrupt anytime.', 
          icon: '🗣️' 
        };
      case 'disconnected':
        return { 
          color: 'bg-gray-400', 
          text: transcriptLength > 0 ? 'Interview completed' : 'Disconnected', 
          icon: '⭕' 
        };
      default:
        return { 
          color: 'bg-gray-400', 
          text: 'Unknown status', 
          icon: '❓' 
        };
    }
  };

  const { color, text, icon } = getStatusInfo();

  return (
    <div className={`${color} text-white p-4 rounded-lg flex items-center space-x-3 transition-all duration-300`}>
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="font-semibold">{text}</p>
        {transcriptLength > 0 && (
          <p className="text-sm opacity-80">
            Conversation: {transcriptLength} exchanges recorded
          </p>
        )}
      </div>
    </div>
  );
};

export default StatusIndicator;