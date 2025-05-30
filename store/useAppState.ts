// store/useAppState.ts
import { create } from 'zustand';
import { Utterance } from '@/lib/types'; // Assuming @ is aliased to the root src or similar

interface AppState {
  uiState: string;
  uvClientStatus: string;
  appCallId: string | null;
  appJoinUrl: string | null;
  appErrorMessage: string | null;
  currentTranscript: Utterance[];
  isInterviewActive: boolean;

  // Actions
  setUiState: (uiState: string) => void;
  setUvClientStatus: (uvClientStatus: string) => void;
  setAppCallId: (appCallId: string | null) => void;
  setAppJoinUrl: (appJoinUrl: string | null) => void;
  setAppErrorMessage: (appErrorMessage: string | null) => void;
  setCurrentTranscript: (currentTranscript: Utterance[]) => void;
  setIsInterviewActive: (isInterviewActive: boolean) => void;
  resetState: () => void;
}

const initialState: Omit<AppState, 'setUiState' | 'setUvClientStatus' | 'setAppCallId' | 'setAppJoinUrl' | 'setAppErrorMessage' | 'setCurrentTranscript' | 'setIsInterviewActive' | 'resetState'> = {
  uiState: 'idle',
  uvClientStatus: 'disconnected',
  appCallId: null,
  appJoinUrl: null,
  appErrorMessage: null,
  currentTranscript: [],
  isInterviewActive: false,
};

export const useAppState = create<AppState>()((set) => ({
  ...initialState,

  // Actions
  setUiState: (uiState: string) => set({ uiState }),
  setUvClientStatus: (uvClientStatus: string) => set({ uvClientStatus }),
  setAppCallId: (appCallId: string | null) => set({ appCallId }),
  setAppJoinUrl: (appJoinUrl: string | null) => set({ appJoinUrl }),
  setAppErrorMessage: (appErrorMessage: string | null) => set({ appErrorMessage }),
  setCurrentTranscript: (currentTranscript: Utterance[]) => set({ currentTranscript }),
  setIsInterviewActive: (isInterviewActive: boolean) => set({ isInterviewActive }),
  
  resetState: () => set(initialState),
}));

// Log creation and description
console.log('Created store/useAppState.ts: Zustand store for managing global application state including UI state, call details, transcript, and error messages.');
