"use client";

import React from 'react';
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";

interface Area1InterviewingDisplayProps {
  uvStatus: string;
  onEndInterview: () => void;
  InterviewPulsingAnimationComponent: React.FC;
}

const Area1InterviewingDisplay: React.FC<Area1InterviewingDisplayProps> = ({
  uvStatus,
  onEndInterview,
  InterviewPulsingAnimationComponent,
}) => {
  return (
    <div className="absolute inset-0 flex flex-col p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${uvStatus === 'speaking' ? 'bg-green-500 animate-pulse' :
              uvStatus === 'listening' ? 'bg-red-500 animate-pulse' :
                uvStatus === 'thinking' ? 'bg-yellow-500 animate-pulse' :
                  'bg-gray-300'}`
          }></div>
          <span className="text-sm font-medium text-gray-700">
            {uvStatus === 'speaking' ? 'AI is speaking...' :
              uvStatus === 'listening' ? 'Listening to you...' :
                uvStatus === 'thinking' ? 'AI is thinking...' :
                  'Ready'}
          </span>
        </div>
        <Button
          onClick={onEndInterview}
          variant="outline"
          size="sm"
          className="text-red-500 border-red-200 hover:bg-red-50"
        >
          End Interview & Submit
        </Button>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <InterviewPulsingAnimationComponent />
      </div>

      <div className="flex justify-center pt-4">
        <div className="w-full max-w-xs flex items-center justify-center py-2 text-sm text-gray-500">
          <Mic className="mr-2 h-4 w-4 text-teal-500" />
          Microphone is active
        </div>
      </div>
    </div>
  );
};

export default Area1InterviewingDisplay;