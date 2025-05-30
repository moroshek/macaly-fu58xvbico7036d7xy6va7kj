"use client";

import React from 'react';
import { UIState, UI_STATES } from '@/lib/config'; // Import UIState and UI_STATES
import { SummaryData } from '@/lib/types';

export interface ResultsDisplayProps {
  uiState: UIState;
  summaryData: SummaryData | null;
  analysisData: string | null;
  formatSummaryField: (value: string | null | undefined) => string;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  uiState,
  summaryData,
  analysisData,
  formatSummaryField,
}) => {
  return (
    <div className={`space-y-8 ${!(uiState === UI_STATES.PROCESSING_TRANSCRIPT || uiState === UI_STATES.DISPLAYING_RESULTS) ? 'opacity-50' : ''}`}>
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Medical Summary</h3>
          {uiState === UI_STATES.PROCESSING_TRANSCRIPT ? (
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
            </div>
          ) : summaryData ? (
            <div className="space-y-4 text-sm">
              {summaryData.chiefComplaint && (
                <div>
                  <strong>Chief Complaint:</strong>
                  <p className="mt-1 text-gray-600">{summaryData.chiefComplaint}</p>
                </div>
              )}
              {summaryData.historyOfPresentIllness && (
                <div>
                  <strong>History of Present Illness:</strong>
                  <p className="mt-1 text-gray-600">{summaryData.historyOfPresentIllness}</p>
                </div>
              )}
              {summaryData.associatedSymptoms && (
                <div>
                  <strong>Associated Symptoms:</strong>
                  <p className="mt-1 text-gray-600">{formatSummaryField(summaryData.associatedSymptoms)}</p>
                </div>
              )}
              {summaryData.pastMedicalHistory && (
                <div>
                  <strong>Past Medical History:</strong>
                  <p className="mt-1 text-gray-600">{formatSummaryField(summaryData.pastMedicalHistory)}</p>
                </div>
              )}
              {summaryData.medications && (
                <div>
                  <strong>Medications:</strong>
                  <p className="mt-1 text-gray-600">{formatSummaryField(summaryData.medications)}</p>
                </div>
              )}
              {summaryData.allergies && (
                <div>
                  <strong>Allergies:</strong>
                  <p className="mt-1 text-gray-600">{formatSummaryField(summaryData.allergies)}</p>
                </div>
              )}
               {summaryData.notesOnInteraction && ( // Added notesOnInteraction
                <div>
                  <strong>Notes on Interaction:</strong>
                  <p className="mt-1 text-gray-600">{formatSummaryField(summaryData.notesOnInteraction)}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              Summary will appear here after the interview is completed.
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Clinical Analysis</h3>
          {uiState === UI_STATES.PROCESSING_TRANSCRIPT ? (
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-4/5" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-3/5" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
            </div>
          ) : analysisData ? (
            <div className="text-sm text-gray-600">
              {analysisData.split('\n').map((paragraph, index) => (
                <p key={index} className="mb-2">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              Clinical insights will appear here after the interview is completed.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;
