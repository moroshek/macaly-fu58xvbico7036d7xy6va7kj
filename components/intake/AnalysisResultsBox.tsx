"use client";

import React from 'react';
import FunLoadingAnimation from '@/components/FunLoadingAnimation';

interface AnalysisResultsBoxProps {
  analysisData: string | null;
  isLoading: boolean;
}

const AnalysisResultsBox: React.FC<AnalysisResultsBoxProps> = ({ analysisData, isLoading }) => {
  // Clean up analysis data by removing any Answer tags
  const cleanAnalysisData = React.useMemo(() => {
    if (!analysisData) return null;
    
    // Remove <Answer> or <answer> tags (case insensitive)
    const cleaned = analysisData.replace(/<\/?answer>/gi, '').trim();
    return cleaned;
  }, [analysisData]);

  return (
    <div className="bg-white rounded-lg border border-teal-100 shadow-md overflow-hidden animate-fade-in">
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 py-3 px-4">
        <h2 className="text-white text-lg font-medium">Provider Review Summary</h2>
      </div>
      <div className="p-4 min-h-[100px] max-h-[300px] md:max-h-[400px] lg:max-h-[500px] overflow-y-auto">
        {isLoading ? (
          <FunLoadingAnimation variant="analysis" />
        ) : (
          cleanAnalysisData && cleanAnalysisData.trim() !== '' ? (
            <p className="text-sm text-gray-700 whitespace-pre-line">{cleanAnalysisData}</p>
          ) : (
            <div className="text-gray-500 text-sm space-y-2 text-center">
              <p className="italic">No analysis available yet.</p>
              <p className="text-xs">Start an interview to collect patient information.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default AnalysisResultsBox;