/**
 * Transcript persistence service to prevent data loss during server warm-up
 */

import { Utterance } from '@/lib/types';
import { logger } from '@/lib/logger';

interface StoredTranscript {
  callId: string;
  transcript: Utterance[];
  timestamp: number;
  transcriptText?: string;
}

export class TranscriptPersistence {
  private static instance: TranscriptPersistence;
  private readonly STORAGE_KEY = 'medical_intake_transcript_backup';
  private readonly MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  static getInstance(): TranscriptPersistence {
    if (!TranscriptPersistence.instance) {
      TranscriptPersistence.instance = new TranscriptPersistence();
    }
    return TranscriptPersistence.instance;
  }

  /**
   * Save transcript to localStorage for backup
   */
  saveTranscript(callId: string, transcript: Utterance[], transcriptText?: string): void {
    try {
      const data: StoredTranscript = {
        callId,
        transcript,
        transcriptText,
        timestamp: Date.now()
      };
      
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        logger.log('[TranscriptPersistence] Transcript saved to localStorage', {
          callId,
          utteranceCount: transcript.length,
          hasTranscriptText: !!transcriptText
        });
      }
    } catch (error) {
      logger.error('[TranscriptPersistence] Failed to save transcript:', error);
    }
  }

  /**
   * Retrieve transcript from localStorage
   */
  getTranscript(callId?: string): StoredTranscript | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (!stored) return null;

        const data: StoredTranscript = JSON.parse(stored);
        
        // Check if data is too old
        if (Date.now() - data.timestamp > this.MAX_AGE_MS) {
          this.clearTranscript();
          return null;
        }

        // If callId provided, verify it matches
        if (callId && data.callId !== callId) {
          return null;
        }

        logger.log('[TranscriptPersistence] Retrieved transcript from localStorage', {
          callId: data.callId,
          utteranceCount: data.transcript.length,
          age: Date.now() - data.timestamp
        });

        return data;
      }
    } catch (error) {
      logger.error('[TranscriptPersistence] Failed to retrieve transcript:', error);
    }
    return null;
  }

  /**
   * Clear stored transcript
   */
  clearTranscript(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(this.STORAGE_KEY);
        logger.log('[TranscriptPersistence] Cleared stored transcript');
      }
    } catch (error) {
      logger.error('[TranscriptPersistence] Failed to clear transcript:', error);
    }
  }

  /**
   * Format transcript for submission
   */
  formatTranscriptText(transcript: Utterance[]): string {
    return transcript
      .filter(utt => utt.transcript && utt.transcript.trim())
      .map(utt => {
        const speakerLabel = utt.speaker === 'agent' ? 'AI Assistant' : 'Patient';
        return `${speakerLabel}: ${utt.transcript.trim()}`;
      })
      .join('\n');
  }
}

export const transcriptPersistence = TranscriptPersistence.getInstance();