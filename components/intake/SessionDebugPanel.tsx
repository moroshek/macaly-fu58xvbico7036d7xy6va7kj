"use client";

import React, { useState } from 'react';

interface SessionState {
  callId: string | null;
  sessionStatus: string;
  startTime: number | null;
  lastActivity: number;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

interface SessionDebugPanelProps {
  sessionState: SessionState;
  errorHistory: Array<any>;
}

const SessionDebugPanel: React.FC<SessionDebugPanelProps> = ({ sessionState, errorHistory }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-black bg-opacity-80 text-white text-xs rounded p-2 max-w-xs">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="font-bold text-yellow-400"
      >
        🔧 Session Debug {isExpanded ? '▼' : '▶'}
      </button>
      
      {isExpanded && (
        <div className="mt-2 space-y-1">
          <div>Status: {sessionState.sessionStatus}</div>
          <div>Call ID: {sessionState.callId || 'None'}</div>
          <div>Reconnect Attempts: {sessionState.reconnectAttempts}</div>
          <div>Errors: {errorHistory.length}</div>
          {sessionState.startTime && (
            <div>Session Duration: {Math.floor((Date.now() - sessionState.startTime) / 1000)}s</div>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionDebugPanel;