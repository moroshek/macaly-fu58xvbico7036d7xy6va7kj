"use client";

import React, { useState, createContext } from 'react';
import ConnectionQualityIndicator from './ConnectionQualityIndicator';
import SessionDebugPanel from './SessionDebugPanel';
import useSessionManagement from '@/hooks/useSessionManagement';
import useErrorRecovery from '@/hooks/useErrorRecovery';
import useConnectionQuality from '@/hooks/useConnectionQuality';

// Context for session management
export const SessionContext = createContext<any>(null);

interface MedicalIntakeSessionProps {
  children: React.ReactNode;
}

const MedicalIntakeSession: React.FC<MedicalIntakeSessionProps> = ({ children }) => {
  const { sessionState, setSessionState, handleConnectionLoss, updateActivity } = useSessionManagement();
  const { errorHistory, recordError, attemptRecovery } = useErrorRecovery();
  const [uvSession, setUvSession] = useState<any>(null);
  const connectionQuality = useConnectionQuality(uvSession);

  // Provide session context to children
  const sessionContext = {
    sessionState,
    setSessionState,
    handleConnectionLoss,
    updateActivity,
    errorHistory,
    recordError,
    attemptRecovery,
    connectionQuality,
    uvSession,
    setUvSession
  };

  return (
    <SessionContext.Provider value={sessionContext}>
      <div className="relative">
        {/* Connection quality indicator */}
        {sessionState.sessionStatus !== 'disconnected' && (
          <div className="fixed top-4 right-4 z-50">
            <ConnectionQualityIndicator quality={connectionQuality} />
          </div>
        )}
        
        {/* Session info debug panel (removable in production) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="fixed bottom-4 right-4 z-50">
            <SessionDebugPanel sessionState={sessionState} errorHistory={errorHistory} />
          </div>
        )}
        
        {children}
      </div>
    </SessionContext.Provider>
  );
};

export default MedicalIntakeSession;