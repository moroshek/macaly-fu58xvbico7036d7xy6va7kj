"use client";

import React from 'react';
import { Loader2 } from "lucide-react";

const Area1InitiatingDisplay: React.FC = () => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center space-y-6 w-full">
        <div className="w-24 h-24 rounded-full bg-teal-50 border-4 border-dashed border-teal-300 flex items-center justify-center shadow-md">
          <Loader2 size={36} className="text-teal-500 animate-spin" />
        </div>
        <p className="text-lg font-medium text-teal-700">Connecting to Interview</p>
        <p className="text-sm text-gray-500 text-center">
          Setting up your secure connection and preparing the AI medical assistant.
        </p>
      </div>
    </div>
  );
};

export default Area1InitiatingDisplay;