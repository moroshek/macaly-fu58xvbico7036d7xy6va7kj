/**
 * Service for processing and validating transcripts
 */

import { Utterance } from '@/app/page';

export interface TranscriptProcessingResult {
  isValid: boolean;
  cleanedTranscript: string;
  stats: {
    totalUtterances: number;
    userUtterances: number;
    agentUtterances: number;
    averageLength: number;
    totalLength: number;
  };
  warnings: string[];
}

export class TranscriptService {
  private static instance: TranscriptService;

  static getInstance(): TranscriptService {
    if (!TranscriptService.instance) {
      TranscriptService.instance = new TranscriptService();
    }
    return TranscriptService.instance;
  }

  /**
   * Process transcript for submission
   */
  processTranscriptForSubmission(transcript: Utterance[]): TranscriptProcessingResult {
    const warnings: string[] = [];

    // Filter and clean transcript
    const validUtterances = transcript.filter((utterance) => {
      if (
        !utterance ||
        typeof utterance.speaker !== 'string' ||
        typeof utterance.text !== 'string'
      ) {
        warnings.push('Invalid utterance found and removed');
        return false;
      }

      const cleanText = utterance.text.trim();
      if (cleanText.length === 0) {
        warnings.push('Empty utterance found and removed');
        return false;
      }

      if (cleanText.length > 1000) {
        warnings.push('Very long utterance found (>1000 chars)');
      }

      return true;
    });

    // Remove duplicate consecutive utterances
    const deduplicatedUtterances = validUtterances.filter((utterance, index) => {
      if (index === 0) return true;

      const prev = validUtterances[index - 1];
      const isDuplicate =
        prev.speaker === utterance.speaker && prev.text.trim() === utterance.text.trim();

      if (isDuplicate) {
        warnings.push('Duplicate utterance found and removed');
        return false;
      }

      return true;
    });

    // Calculate stats
    const userUtterances = deduplicatedUtterances.filter((u) => u.speaker === 'user').length;
    const agentUtterances = deduplicatedUtterances.filter((u) => u.speaker === 'agent').length;
    const totalLength = deduplicatedUtterances.reduce((sum, u) => sum + u.text.length, 0);
    const averageLength =
      deduplicatedUtterances.length > 0 ? totalLength / deduplicatedUtterances.length : 0;

    // Validation
    const isValid =
      deduplicatedUtterances.length >= 2 && // At least 2 utterances
      userUtterances >= 1 && // At least 1 user utterance
      totalLength >= 20; // At least 20 characters total

    if (!isValid) {
      if (deduplicatedUtterances.length < 2) warnings.push('Too few utterances for processing');
      if (userUtterances < 1) warnings.push('No user utterances found');
      if (totalLength < 20) warnings.push('Transcript too short for meaningful processing');
    }

    // Create cleaned transcript string
    const cleanedTranscript = deduplicatedUtterances
      .map(
        (utterance) =>
          `${utterance.speaker === 'agent' ? 'Agent' : 'User'}: ${utterance.text.trim()}`
      )
      .join('\n');

    return {
      isValid,
      cleanedTranscript,
      stats: {
        totalUtterances: deduplicatedUtterances.length,
        userUtterances,
        agentUtterances,
        averageLength,
        totalLength,
      },
      warnings,
    };
  }

  /**
   * Validate transcript for minimum requirements
   */
  validateTranscript(transcript: Utterance[]): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!Array.isArray(transcript)) {
      errors.push('Transcript is not an array');
      return { isValid: false, errors };
    }

    if (transcript.length === 0) {
      errors.push('Transcript is empty');
      return { isValid: false, errors };
    }

    const userUtterances = transcript.filter((u) => u.speaker === 'user');
    if (userUtterances.length === 0) {
      errors.push('No user utterances in transcript');
    }

    const totalText = transcript.reduce((sum, u) => sum + (u.text || '').length, 0);
    if (totalText < 20) {
      errors.push('Transcript content too short (less than 20 characters)');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Extract key information from transcript
   */
  extractKeyInformation(transcript: Utterance[]): {
    firstUserStatement: string | null;
    lastAgentStatement: string | null;
    totalDuration: number;
    keyTopics: string[];
  } {
    const userUtterances = transcript.filter((u) => u.speaker === 'user');
    const agentUtterances = transcript.filter((u) => u.speaker === 'agent');

    const firstUserStatement = userUtterances.length > 0 ? userUtterances[0].text : null;
    const lastAgentStatement =
      agentUtterances.length > 0 ? agentUtterances[agentUtterances.length - 1].text : null;

    // Estimate duration based on text length (rough approximation)
    const totalWords = transcript.reduce(
      (sum, u) => sum + u.text.split(' ').length,
      0
    );
    const totalDuration = Math.round(totalWords / 150); // Assume 150 words per minute

    // Extract potential medical topics (simplified)
    const medicalKeywords = [
      'pain',
      'ache',
      'hurt',
      'fever',
      'cough',
      'medication',
      'allergy',
      'symptom',
      'doctor',
      'hospital',
      'treatment',
      'diagnosis',
    ];

    const keyTopics = [...new Set(
      transcript
        .flatMap((u) =>
          u.text
            .toLowerCase()
            .split(/\s+/)
            .filter((word) => medicalKeywords.includes(word))
        )
    )];

    return {
      firstUserStatement,
      lastAgentStatement,
      totalDuration,
      keyTopics,
    };
  }

  /**
   * Create a summary preview from transcript
   */
  createTranscriptPreview(transcript: Utterance[], maxLength: number = 200): string {
    if (transcript.length === 0) return 'No transcript available';

    const preview = transcript
      .slice(0, 3)
      .map((u) => `${u.speaker}: ${u.text.substring(0, 50)}...`)
      .join('\n');

    return preview.length > maxLength ? preview.substring(0, maxLength) + '...' : preview;
  }
}