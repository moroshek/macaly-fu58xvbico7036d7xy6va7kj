/**
 * Defines shared TypeScript types used across the application.
 */

export type Utterance = {
  speaker: string; // Typically 'user' or 'agent'
  text: string;
};

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
