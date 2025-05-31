// lib/logger.ts

import { getConfig } from './config';

const getTimestamp = (): string => new Date().toISOString();

export const logger = {
  log: (...args: any[]): void => {
    console.log(`[${getTimestamp()}] [LOG]`, ...args);
  },
  debug: (...args: any[]): void => {
    const config = getConfig();
    if (config.enableDebugLogging) {
      console.log(`[${getTimestamp()}] [DEBUG]`, ...args);
    }
  },
  warn: (...args: any[]): void => {
    console.warn(`[${getTimestamp()}] [WARN]`, ...args);
  },
  error: (...args: any[]): void => {
    console.error(`[${getTimestamp()}] [ERROR]`, ...args);
  },
};
