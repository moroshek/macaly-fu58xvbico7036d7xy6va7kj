"use client";

import React from 'react';
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

interface Area1CompleteDisplayProps {
  onStartNewInterview: () => void;
}

const Area1CompleteDisplay: React.FC<Area1CompleteDisplayProps> = ({ onStartNewInterview }) => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
      <CheckCircle size={36} className="text-green-500 mb-4" />
      <p className="text-lg font-medium text-green-700">Interview Complete</p>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        Your medical intake has been processed.
      </p>
      <Button
        onClick={onStartNewInterview}
        className="bg-teal-500 hover:bg-teal-600 text-white"
      >
        Start New Interview
      </Button>
    </div>
  );
};

export default Area1CompleteDisplay;