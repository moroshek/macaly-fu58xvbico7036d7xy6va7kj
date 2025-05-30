/**
 * Defines shared TypeScript types used across the application.
 */

export interface Utterance { // Changed from type to interface
  speaker: string;       // Typically 'user' or 'agent'
  transcript: string;    // Changed from text to transcript
  timestamp: number;     // Added timestamp
}

export type SummaryData = {
  chiefComplaint: string | null;
  historyOfPresentIllness: string | null;
  associatedSymptoms: string | null;
  pastMedicalHistory: string | null;
  medications: string | null;
  allergies: string | null;
  notesOnInteraction: string | null;
  // Allows for additional, unspecified string fields if needed
  [key: string]: string | null | undefined; 
};

// Add other shared types here as the application grows.
