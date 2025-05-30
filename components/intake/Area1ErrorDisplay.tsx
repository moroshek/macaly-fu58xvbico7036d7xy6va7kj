"use client";

import React from 'react';
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface Area1ErrorDisplayProps {
  onReset: () => void;
}

const Area1ErrorDisplay: React.FC<Area1ErrorDisplayProps> = ({ onReset }) => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center space-y-6 w-full">
        <div className="w-24 h-24 rounded-full bg-red-50 border-2 border-red-300 flex items-center justify-center">
          <X size={36} className="text-red-500" />
        </div>
        <p className="text-lg font-medium text-red-700">Something went wrong</p>
        <p className="text-sm text-gray-500 text-center">
          There was a problem with your interview. Please try again.
        </p>
        <Button
          onClick={onReset}
          className="bg-teal-500 hover:bg-teal-600 text-white"
        >
          Try Again
        </Button>
      </div>
    </div>
  );
};

export default Area1ErrorDisplay;