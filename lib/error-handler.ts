/**
 * Enhanced error handling system for the Medical Intake application
 */

import axios from 'axios';

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public category: 'network' | 'permission' | 'api' | 'ultravox' | 'validation' | 'unknown',
    public recoverable: boolean = true,
    public userMessage?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorLog: Array<{
    timestamp: number;
    error: AppError;
    context?: any;
  }> = [];

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  handle(error: unknown, context?: any): AppError {
    const appError = this.normalizeError(error);

    this.logError(appError, context);

    // Send to monitoring service in production
    if (process.env.NODE_ENV === 'production') {
      this.sendToMonitoring(appError, context);
    }

    return appError;
  }

  private normalizeError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      if (!error.response) {
        return new AppError(
          'Network connection failed',
          'NETWORK_ERROR',
          'network',
          true,
          'Please check your internet connection and try again.'
        );
      }

      const status = error.response.status;
      if (status === 503) {
        // Service Unavailable - likely cold start or missing API keys
        const errorData = error.response.data;
        const detail = errorData?.detail || '';
        
        let userMessage = 'The processing service is temporarily unavailable. ';
        if (detail.includes('AI#2') || detail.includes('AI#3')) {
          userMessage += 'The AI service is not ready. Please try again in 10-15 seconds.';
        } else {
          userMessage += 'This is often due to the service warming up. Please try again in 10-15 seconds.';
        }
        
        return new AppError(
          `Service unavailable: ${detail || 'Unknown reason'}`,
          'SERVICE_UNAVAILABLE',
          'api',
          true,
          userMessage
        );
      } else if (status >= 500) {
        return new AppError(
          `Server error: ${status}`,
          'SERVER_ERROR',
          'api',
          true,
          'The server is experiencing issues. Please try again in a few moments.'
        );
      } else if (status === 429) {
        return new AppError(
          'Rate limit exceeded',
          'RATE_LIMIT',
          'api',
          true,
          'Too many requests. Please wait a moment and try again.'
        );
      } else if (status >= 400) {
        return new AppError(
          `Client error: ${status}`,
          'CLIENT_ERROR',
          'api',
          false,
          'There was an issue with your request. Please try again.'
        );
      }
    }

    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          return new AppError(
            'Permission denied',
            'PERMISSION_DENIED',
            'permission',
            true,
            'Please allow microphone access and try again.'
          );
        case 'NotFoundError':
          return new AppError(
            'Microphone not found',
            'MIC_NOT_FOUND',
            'permission',
            false,
            'No microphone detected. Please connect a microphone and try again.'
          );
        case 'NotReadableError':
          return new AppError(
            'Microphone in use',
            'MIC_IN_USE',
            'permission',
            true,
            'Microphone is in use by another application. Please close other apps and try again.'
          );
      }
    }

    return new AppError(
      error instanceof Error ? error.message : String(error),
      'UNKNOWN_ERROR',
      'unknown',
      true,
      'An unexpected error occurred. Please try again.'
    );
  }

  private logError(error: AppError, context?: any) {
    console.error(`[${error.category}] ${error.code}: ${error.message}`, context);

    this.errorLog.push({
      timestamp: Date.now(),
      error,
      context
    });

    // Keep only last 50 errors
    if (this.errorLog.length > 50) {
      this.errorLog = this.errorLog.slice(-50);
    }
  }

  private sendToMonitoring(error: AppError, context?: any) {
    // Implement your monitoring service integration here
    // e.g., Sentry, LogRocket, etc.
    console.log('Would send to monitoring:', { error, context });
  }

  getRecentErrors(limit: number = 10) {
    return this.errorLog.slice(-limit);
  }

  getErrorsByCategory(category: AppError['category']) {
    return this.errorLog.filter(entry => entry.error.category === category);
  }

  clearErrors() {
    this.errorLog = [];
  }
}