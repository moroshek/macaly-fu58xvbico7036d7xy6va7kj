/**
 * Centralized state management hook using useReducer
 */

import { useReducer, useCallback } from 'react';
import { UIState } from '@/lib/config';
import { Utterance, SummaryData } from '@/app/page';

interface AppState {
  uiState: UIState;
  uvSession: any;
  callId: string;
  isInterviewActive: boolean;
  uvStatus: string;
  currentTranscript: Utterance[];
  summaryData: SummaryData | null;
  analysisData: string | null;
  isOnline: boolean;
  hasAudioPermission: boolean | null;
  errorMessage: string;
}

type AppAction =
  | { type: 'SET_UI_STATE'; payload: AppState['uiState'] }
  | { type: 'SET_SESSION'; payload: any }
  | { type: 'SET_CALL_ID'; payload: string }
  | { type: 'SET_INTERVIEW_ACTIVE'; payload: boolean }
  | { type: 'SET_UV_STATUS'; payload: string }
  | { type: 'ADD_TRANSCRIPT'; payload: Utterance }
  | { type: 'SET_TRANSCRIPT'; payload: Utterance[] }
  | { type: 'SET_SUMMARY'; payload: SummaryData }
  | { type: 'SET_ANALYSIS'; payload: string }
  | { type: 'SET_ONLINE'; payload: boolean }
  | { type: 'SET_AUDIO_PERMISSION'; payload: boolean | null }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET_INTERVIEW' }
  | { type: 'RESET_ALL' };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_UI_STATE':
      return { ...state, uiState: action.payload };
    case 'SET_SESSION':
      return { ...state, uvSession: action.payload };
    case 'SET_CALL_ID':
      return { ...state, callId: action.payload };
    case 'SET_INTERVIEW_ACTIVE':
      return { ...state, isInterviewActive: action.payload };
    case 'SET_UV_STATUS':
      return { ...state, uvStatus: action.payload };
    case 'ADD_TRANSCRIPT':
      return {
        ...state,
        currentTranscript: [...state.currentTranscript, action.payload]
      };
    case 'SET_TRANSCRIPT':
      return { ...state, currentTranscript: action.payload };
    case 'SET_SUMMARY':
      return { ...state, summaryData: action.payload };
    case 'SET_ANALYSIS':
      return { ...state, analysisData: action.payload };
    case 'SET_ONLINE':
      return { ...state, isOnline: action.payload };
    case 'SET_AUDIO_PERMISSION':
      return { ...state, hasAudioPermission: action.payload };
    case 'SET_ERROR':
      return { ...state, errorMessage: action.payload, uiState: 'error' };
    case 'CLEAR_ERROR':
      return { ...state, errorMessage: '' };
    case 'RESET_INTERVIEW':
      return {
        ...state,
        uvSession: null,
        callId: '',
        isInterviewActive: false,
        uvStatus: '',
        currentTranscript: [],
        summaryData: null,
        analysisData: null,
      };
    case 'RESET_ALL':
      return {
        ...initialState,
        isOnline: state.isOnline, // Preserve network state
      };
    default:
      return state;
  }
}

const initialState: AppState = {
  uiState: 'idle',
  uvSession: null,
  callId: '',
  isInterviewActive: false,
  uvStatus: '',
  currentTranscript: [],
  summaryData: null,
  analysisData: null,
  isOnline: true,
  hasAudioPermission: null,
  errorMessage: '',
};

export function useAppState() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Memoized dispatch helpers
  const setUiState = useCallback((uiState: UIState) => {
    dispatch({ type: 'SET_UI_STATE', payload: uiState });
  }, []);

  const setSession = useCallback((session: any) => {
    dispatch({ type: 'SET_SESSION', payload: session });
  }, []);

  const setCallId = useCallback((callId: string) => {
    dispatch({ type: 'SET_CALL_ID', payload: callId });
  }, []);

  const setInterviewActive = useCallback((active: boolean) => {
    dispatch({ type: 'SET_INTERVIEW_ACTIVE', payload: active });
  }, []);

  const setUvStatus = useCallback((status: string) => {
    dispatch({ type: 'SET_UV_STATUS', payload: status });
  }, []);

  const addTranscriptItem = useCallback((utterance: Utterance) => {
    dispatch({ type: 'ADD_TRANSCRIPT', payload: utterance });
  }, []);

  const setTranscript = useCallback((transcript: Utterance[]) => {
    dispatch({ type: 'SET_TRANSCRIPT', payload: transcript });
  }, []);

  const setSummaryData = useCallback((summary: SummaryData) => {
    dispatch({ type: 'SET_SUMMARY', payload: summary });
  }, []);

  const setAnalysisData = useCallback((analysis: string) => {
    dispatch({ type: 'SET_ANALYSIS', payload: analysis });
  }, []);

  const setOnline = useCallback((online: boolean) => {
    dispatch({ type: 'SET_ONLINE', payload: online });
  }, []);

  const setAudioPermission = useCallback((permission: boolean | null) => {
    dispatch({ type: 'SET_AUDIO_PERMISSION', payload: permission });
  }, []);

  const setError = useCallback((error: string) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const resetInterview = useCallback(() => {
    dispatch({ type: 'RESET_INTERVIEW' });
  }, []);

  const resetAll = useCallback(() => {
    dispatch({ type: 'RESET_ALL' });
  }, []);

  return {
    state,
    dispatch,
    // Helper functions
    setUiState,
    setSession,
    setCallId,
    setInterviewActive,
    setUvStatus,
    addTranscriptItem,
    setTranscript,
    setSummaryData,
    setAnalysisData,
    setOnline,
    setAudioPermission,
    setError,
    clearError,
    resetInterview,
    resetAll,
  };
}