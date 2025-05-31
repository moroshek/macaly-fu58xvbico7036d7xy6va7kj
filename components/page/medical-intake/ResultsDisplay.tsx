"use client";

import React from 'react';
import { UIState, UI_STATES } from '@/lib/config'; // Import UIState and UI_STATES
import { SummaryData } from '@/lib/types';
import FunLoadingAnimation from '@/components/FunLoadingAnimation';

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
        <div className="p-4 md:p-6 max-h-[400px] md:max-h-[500px] lg:max-h-[600px] overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4">Medical Summary</h3>
          {uiState === UI_STATES.PROCESSING_TRANSCRIPT ? (
            <FunLoadingAnimation variant="summary" />
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
            <div className="text-gray-500 text-sm space-y-2">
              <p className="font-medium">This section will display a structured summary of the patient interview.</p>
              <p>Information collected will include:</p>
              <ul className="list-disc list-inside ml-2 text-xs space-y-1">
                <li>Chief complaint and symptoms</li>
                <li>History of present illness</li>
                <li>Medications and allergies</li>
                <li>Relevant medical history</li>
              </ul>
              <p className="text-xs mt-2 italic">Summary will be generated after the interview is completed.</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-4 md:p-6 max-h-[400px] md:max-h-[500px] lg:max-h-[600px] overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4">Information Summary for Provider Review</h3>
          {uiState === UI_STATES.PROCESSING_TRANSCRIPT ? (
            <FunLoadingAnimation variant="analysis" />
          ) : analysisData ? (
            <div className="text-sm text-gray-600 prose prose-sm max-w-none">
              {(() => {
                try {
                  const parsed = JSON.parse(analysisData);
                  return (
                    <div className="space-y-3">
                      {parsed.differential && (
                        <div>
                          <h4 className="font-semibold text-gray-800 mb-1">Differential Diagnosis</h4>
                          <p className="text-gray-600 leading-relaxed">{parsed.differential}</p>
                        </div>
                      )}
                      {parsed.workup && (
                        <div>
                          <h4 className="font-semibold text-gray-800 mb-1">Recommended Workup</h4>
                          <p className="text-gray-600 leading-relaxed">{parsed.workup}</p>
                        </div>
                      )}
                      {parsed.urgency && (
                        <div>
                          <h4 className="font-semibold text-gray-800 mb-1">Urgency Level</h4>
                          <p className="text-gray-600 leading-relaxed">{parsed.urgency}</p>
                        </div>
                      )}
                      {parsed.additionalNotes && (
                        <div>
                          <h4 className="font-semibold text-gray-800 mb-1">Additional Notes</h4>
                          <p className="text-gray-600 leading-relaxed">{parsed.additionalNotes}</p>
                        </div>
                      )}
                    </div>
                  );
                } catch (e) {
                  // If not JSON, display as formatted paragraphs
                  return analysisData.split('\n').map((paragraph, index) => (
                    <p key={index} className="mb-3 leading-relaxed">
                      {paragraph}
                    </p>
                  ));
                }
              })()}
            </div>
          ) : (
            <div className="text-gray-500 text-sm space-y-2">
              <p className="font-medium">This section will provide organized information for healthcare provider review.</p>
              <p>The AI assistant will structure the interview data to help providers with:</p>
              <ul className="list-disc list-inside ml-2 text-xs space-y-1">
                <li>Organized symptom presentation</li>
                <li>Structured clinical information</li>
                <li>Key points from the patient interview</li>
                <li>Formatted notes for provider review</li>
              </ul>
              <p className="text-xs mt-2 italic">This is an information gathering tool only. All medical decisions should be made by qualified healthcare providers.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;
