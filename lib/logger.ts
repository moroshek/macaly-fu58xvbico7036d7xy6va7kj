// lib/logger.ts

const getTimestamp = (): string => new Date().toISOString();

export const logger = {
  log: (...args: any[]): void => {
    console.log(`[${getTimestamp()}] [LOG]`, ...args);
  },
  warn: (...args: any[]): void => {
    console.warn(`[${getTimestamp()}] [WARN]`, ...args);
  },
  error: (...args: any[]): void => {
    console.error(`[${getTimestamp()}] [ERROR]`, ...args);
  },
};

// Example Usage (optional, for testing)
// logger.log('This is a log message.');
// logger.warn('This is a warning message.');
// logger.error('This is an error message.', new Error('Example Error'));
