"use client";

import React from 'react';
import { Loader2 } from "lucide-react";
import { SummaryData } from '@/app/page'; // Assuming SummaryData is exported from app/page.tsx

interface SummaryResultsBoxProps {
  summaryData: SummaryData | null;
  isLoading: boolean;
  formatSummaryField: (value: string | null | undefined) => string;
}

const SummaryResultsBox: React.FC<SummaryResultsBoxProps> = ({ summaryData, isLoading, formatSummaryField }) => {
  return (
    <div className="bg-white rounded-lg border border-teal-100 shadow-md overflow-hidden">
      <div className="bg-gradient-to-r from-teal-500 to-teal-600 py-3 px-4">
        <h2 className="text-white text-lg font-medium">Medical Intake Summary</h2>
      </div>
      <div className="p-4 space-y-4 min-h-[150px] max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="text-teal-500 animate-spin" />
          </div>
        ) : (
          summaryData && Object.values(summaryData).some(value => value !== null && (typeof value === 'string' ? value.trim() !== '' : true)) ? (
            Object.entries(summaryData).map(([key, value]) => {
              if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
              const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
              return (
                <div key={key} className="w-full border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <h3 className="text-sm font-semibold text-teal-700">{formattedKey}</h3>
                  <p className="text-sm text-gray-700 mt-1">{formatSummaryField(value)}</p>
                </div>
              );
            })
          ) : (<p className="text-sm text-gray-500 italic text-center">No summary details reported.</p>)
        )}
      </div>
    </div>
  );
};

export default SummaryResultsBox;