"use client";

import React from 'react';
import { Loader2 } from "lucide-react";

const Area1ProcessingDisplay: React.FC = () => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
      <Loader2 size={32} className="text-teal-500 animate-spin mb-4" />
      <p className="text-lg font-medium text-teal-700">Processing Your Interview...</p>
      <p className="text-sm text-gray-500 mt-1">
        Generating summary and clinical insights.
      </p>
    </div>
  );
};

export default Area1ProcessingDisplay;