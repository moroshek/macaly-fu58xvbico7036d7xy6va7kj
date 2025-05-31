"use client";

import React from 'react';
import FunLoadingAnimation from '@/components/FunLoadingAnimation';
import { SummaryData } from '@/lib/types';

interface SummaryResultsBoxProps {
  summaryData: SummaryData | null;
  isLoading: boolean;
  formatSummaryField: (value: string | null | undefined) => string;
}

const SummaryResultsBox: React.FC<SummaryResultsBoxProps> = ({ summaryData, isLoading, formatSummaryField }) => {
  return (
    <div className="bg-white rounded-lg border border-teal-100 shadow-md overflow-hidden animate-fade-in">
      <div className="bg-gradient-to-r from-teal-500 to-teal-600 py-3 px-4">
        <h2 className="text-white text-lg font-medium">Medical Intake Summary</h2>
      </div>
      <div className="p-4 space-y-4 min-h-[150px] max-h-[300px] md:max-h-[400px] lg:max-h-[500px] overflow-y-auto">
        {isLoading ? (
          <FunLoadingAnimation variant="summary" />
        ) : (
          summaryData && Object.values(summaryData).some(value => value !== null && (typeof value === 'string' ? value.trim() !== '' : true)) ? (
            Object.entries(summaryData).map(([key, value], index) => {
              if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
              const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
              return (
                <div 
                  key={key} 
                  className="w-full border-b border-gray-100 pb-3 last:border-0 last:pb-0 animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <h3 className="text-sm font-semibold text-teal-700">{formattedKey}</h3>
                  <p className="text-sm text-gray-700 mt-1">{formatSummaryField(value)}</p>
                </div>
              );
            })
          ) : (
            <div className="text-gray-500 text-sm space-y-2 text-center">
              <p className="italic">No summary available yet.</p>
              <p className="text-xs">Complete an interview to generate a structured medical summary.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default SummaryResultsBox;