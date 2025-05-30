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
  
  // Connection state management to prevent 4409 conflicts
  activeConnectionCallId: string | null;
  connectionAttemptInProgress: boolean;
  lastConnectionAttempt: number | null;

  // Actions
  setUiState: (uiState: string) => void;
  setUvClientStatus: (uvClientStatus: string) => void;
  setAppCallId: (appCallId: string | null) => void;
  setAppJoinUrl: (appJoinUrl: string | null) => void;
  setAppErrorMessage: (appErrorMessage: string | null) => void;
  setCurrentTranscript: (currentTranscript: Utterance[]) => void;
  setIsInterviewActive: (isInterviewActive: boolean) => void;
  setActiveConnectionCallId: (callId: string | null) => void;
  setConnectionAttemptInProgress: (inProgress: boolean) => void;
  setLastConnectionAttempt: (timestamp: number | null) => void;
  isConnectionAllowed: (callId: string) => boolean;
  resetState: () => void;
}

const initialState: Omit<AppState, 'setUiState' | 'setUvClientStatus' | 'setAppCallId' | 'setAppJoinUrl' | 'setAppErrorMessage' | 'setCurrentTranscript' | 'setIsInterviewActive' | 'setActiveConnectionCallId' | 'setConnectionAttemptInProgress' | 'setLastConnectionAttempt' | 'isConnectionAllowed' | 'resetState'> = {
  uiState: 'idle',
  uvClientStatus: 'disconnected',
  appCallId: null,
  appJoinUrl: null,
  appErrorMessage: null,
  currentTranscript: [],
  isInterviewActive: false,
  activeConnectionCallId: null,
  connectionAttemptInProgress: false,
  lastConnectionAttempt: null,
};

export const useAppState = create<AppState>()((set, get) => ({
  ...initialState,

  // Actions
  setUiState: (uiState: string) => set({ uiState }),
  setUvClientStatus: (uvClientStatus: string) => set({ uvClientStatus }),
  setAppCallId: (appCallId: string | null) => set({ appCallId }),
  setAppJoinUrl: (appJoinUrl: string | null) => set({ appJoinUrl }),
  setAppErrorMessage: (appErrorMessage: string | null) => set({ appErrorMessage }),
  setCurrentTranscript: (currentTranscript: Utterance[]) => set({ currentTranscript }),
  setIsInterviewActive: (isInterviewActive: boolean) => set({ isInterviewActive }),
  setActiveConnectionCallId: (callId: string | null) => set({ activeConnectionCallId: callId }),
  setConnectionAttemptInProgress: (inProgress: boolean) => set({ connectionAttemptInProgress: inProgress }),
  setLastConnectionAttempt: (timestamp: number | null) => set({ lastConnectionAttempt: timestamp }),
  
  // Connection management logic
  isConnectionAllowed: (callId: string) => {
    const state = get();
    const now = Date.now();
    
    // Don't allow if same call is already being attempted
    if (state.activeConnectionCallId === callId && state.connectionAttemptInProgress) {
      return false;
    }
    
    // Don't allow if a connection attempt was made in the last 1 second (reduced from 2)
    // But only if it's for the same callId that's still active
    if (state.lastConnectionAttempt && 
        state.activeConnectionCallId === callId &&
        (now - state.lastConnectionAttempt) < 1000) {
      return false;
    }
    
    return true;
  },
  
  resetState: () => set(initialState),
  
  // Clear connection state to allow retries after errors
  clearConnectionState: () => set({ 
    activeConnectionCallId: null, 
    connectionAttemptInProgress: false, 
    lastConnectionAttempt: null 
  }),
}));

// Log creation and description
console.log('Updated store/useAppState.ts: Zustand store with connection state management to prevent 4409 WebSocket conflicts.');
