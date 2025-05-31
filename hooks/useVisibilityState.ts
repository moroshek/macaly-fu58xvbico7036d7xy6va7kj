// hooks/useVisibilityState.ts
import { useEffect, useRef, useCallback } from 'react';
import { logger } from '@/lib/logger';

interface VisibilityStateCallbacks {
  onVisible: () => void;
  onHidden: () => void;
  onVisibilityChange?: (isVisible: boolean) => void;
}

interface VisibilityState {
  isVisible: boolean;
  lastHiddenTime: number | null;
  hiddenDuration: number | null;
}

export function useVisibilityState(callbacks: VisibilityStateCallbacks) {
  const stateRef = useRef<VisibilityState>({
    isVisible: true,
    lastHiddenTime: null,
    hiddenDuration: null
  });

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const handleVisibilityChange = useCallback(() => {
    const isHidden = document.hidden || document.visibilityState === 'hidden';
    const prevState = stateRef.current;
    
    logger.log('[useVisibilityState] Visibility changed:', {
      isHidden,
      visibilityState: document.visibilityState,
      wasVisible: prevState.isVisible
    });

    if (isHidden && prevState.isVisible) {
      // Transitioning from visible to hidden
      stateRef.current = {
        isVisible: false,
        lastHiddenTime: Date.now(),
        hiddenDuration: null
      };
      
      logger.log('[useVisibilityState] Page hidden - screen likely turned off or app backgrounded');
      callbacksRef.current.onHidden();
      callbacksRef.current.onVisibilityChange?.(false);
      
    } else if (!isHidden && !prevState.isVisible) {
      // Transitioning from hidden to visible
      const hiddenDuration = prevState.lastHiddenTime 
        ? Date.now() - prevState.lastHiddenTime 
        : null;
        
      stateRef.current = {
        isVisible: true,
        lastHiddenTime: prevState.lastHiddenTime,
        hiddenDuration
      };
      
      logger.log('[useVisibilityState] Page visible again', {
        hiddenDurationMs: hiddenDuration,
        hiddenDurationSeconds: hiddenDuration ? (hiddenDuration / 1000).toFixed(1) : null
      });
      
      callbacksRef.current.onVisible();
      callbacksRef.current.onVisibilityChange?.(true);
    }
  }, []);

  // Handle various visibility change events for cross-browser compatibility
  useEffect(() => {
    // Standard visibility change event
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Additional events for mobile browsers
    window.addEventListener('pagehide', () => {
      logger.log('[useVisibilityState] pagehide event fired');
      if (stateRef.current.isVisible) {
        handleVisibilityChange();
      }
    });
    
    window.addEventListener('pageshow', () => {
      logger.log('[useVisibilityState] pageshow event fired');
      if (!stateRef.current.isVisible) {
        handleVisibilityChange();
      }
    });
    
    // iOS-specific events
    window.addEventListener('blur', () => {
      logger.log('[useVisibilityState] window blur event fired');
      // On iOS, blur often indicates app backgrounding
      if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
        setTimeout(() => {
          // Check if page is actually hidden after a small delay
          if (document.hidden) {
            handleVisibilityChange();
          }
        }, 100);
      }
    });
    
    window.addEventListener('focus', () => {
      logger.log('[useVisibilityState] window focus event fired');
      // On iOS, focus indicates app foregrounding
      if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
        if (!stateRef.current.isVisible && !document.hidden) {
          handleVisibilityChange();
        }
      }
    });

    // Initial state check
    if (document.hidden) {
      logger.log('[useVisibilityState] Initial state is hidden');
      stateRef.current.isVisible = false;
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleVisibilityChange);
      window.removeEventListener('pageshow', handleVisibilityChange);
      window.removeEventListener('blur', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [handleVisibilityChange]);

  const getHiddenDuration = useCallback((): number | null => {
    if (!stateRef.current.isVisible && stateRef.current.lastHiddenTime) {
      return Date.now() - stateRef.current.lastHiddenTime;
    }
    return stateRef.current.hiddenDuration;
  }, []);

  const isCurrentlyVisible = useCallback((): boolean => {
    return stateRef.current.isVisible;
  }, []);

  return {
    getHiddenDuration,
    isCurrentlyVisible,
    visibilityState: stateRef.current
  };
}