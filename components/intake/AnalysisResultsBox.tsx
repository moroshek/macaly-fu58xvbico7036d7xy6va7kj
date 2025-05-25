"use client";

import React from 'react';
import { Loader2 } from "lucide-react";

interface AnalysisResultsBoxProps {
  analysisData: string | null;
  isLoading: boolean;
}

const AnalysisResultsBox: React.FC<AnalysisResultsBoxProps> = ({ analysisData, isLoading }) => {
  return (
    <div className="bg-white rounded-lg border border-teal-100 shadow-md overflow-hidden">
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 py-3 px-4">
        <h2 className="text-white text-lg font-medium">Clinical Insights</h2>
      </div>
      <div className="p-4 min-h-[100px] flex items-center justify-center">
        {isLoading ? (
          <Loader2 size={24} className="text-blue-500 animate-spin" />
        ) : (
          analysisData && analysisData.trim() !== '' ? (
            <p className="text-sm text-gray-700 whitespace-pre-line">{analysisData}</p>
          ) : (
            <p className="text-sm text-gray-500 italic">No clinical analysis available.</p>
          )
        )}
      </div>
    </div>
  );
};

export default AnalysisResultsBox;