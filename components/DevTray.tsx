"use client";

import { useState, useRef, useEffect } from "react";
import { Settings, ChevronDown, ChevronUp, X } from "lucide-react";

// Define prop types for the DevTray component
type BackendCommLog = {
  timestamp: string;
  serviceTarget: string;
  method: string;
  outcome: string;
  statusCode?: number;
};

type DevTrayProps = {
  appPhase: string;
  sessionStatus: string;
  sessionId: string | null;
  isSessionActive: boolean;
  micStatus: string;
  utteranceCount: number;
  lastUtteranceSource: string | null;
  submittedDataLength: number | null;
  backendCommsLog: BackendCommLog[];
  outputSet1Received: boolean;
  outputSet1FieldCount: number | null;
  outputSet2Received: boolean;
  outputSet2ApproxLength: number | null;
  clientEventsLog: string[];
};

export default function DevTray({
  appPhase,
  sessionStatus,
  sessionId,
  isSessionActive,
  micStatus,
  utteranceCount,
  lastUtteranceSource,
  submittedDataLength,
  backendCommsLog,
  outputSet1Received,
  outputSet1FieldCount,
  outputSet2Received,
  outputSet2ApproxLength,
  clientEventsLog,
}: DevTrayProps) {
  // State for expanded/collapsed tray
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  
  // Ref for tray element (used for handling clicks outside)
  const trayRef = useRef<HTMLDivElement>(null);
  
  // Handle clicks outside the tray to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (trayRef.current && !trayRef.current.contains(event.target as Node) && isTrayOpen) {
        setIsTrayOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTrayOpen]);
  
  // Format boolean values for display
  const formatBoolean = (value: boolean) => {
    return value ? "Yes" : "No";
  };
  
  // Format nullable values for display
  const formatNullable = <T,>(value: T | null, formatter?: (val: T) => string) => {
    if (value === null) return "N/A";
    return formatter ? formatter(value) : String(value);
  };
  
  return (
    <div ref={trayRef} className="fixed bottom-4 right-4 z-50">
      {/* Toggle button */}
      <button
        onClick={() => setIsTrayOpen(!isTrayOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800/80 text-white shadow-lg hover:bg-gray-700/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-all duration-200"
        aria-label="Toggle developer tray"
      >
        {isTrayOpen ? <X size={18} /> : <Settings size={18} />}
      </button>
      
      {/* Tray panel */}
      {isTrayOpen && (
        <div className="absolute bottom-12 right-0 w-80 max-h-[70vh] bg-gray-900/90 backdrop-blur-md text-gray-200 rounded-lg shadow-xl overflow-y-auto overflow-x-hidden border border-gray-700/50 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="sticky top-0 bg-gradient-to-r from-teal-900/90 to-blue-900/90 backdrop-blur-sm px-4 py-3 flex justify-between items-center border-b border-gray-700/50">
            <h3 className="font-mono text-sm font-semibold text-gray-100 flex items-center">
              <Settings size={14} className="mr-2 text-teal-400" />
              Dev Tray
            </h3>
            <button 
              onClick={() => setIsTrayOpen(false)}
              className="text-gray-400 hover:text-white"
              aria-label="Close developer tray"
            >
              {isTrayOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>
          
          <div className="p-3 space-y-4 font-mono text-xs">
            {/* App Phase Section */}
            <div className="space-y-2">
              <h4 className="text-teal-400 font-semibold uppercase tracking-wider text-[10px]">App Phase</h4>
              <div className="pl-2 py-1 border-l-2 border-teal-800/50">
                <div className="flex justify-between">
                  <span className="text-gray-400">Current Phase:</span>
                  <span className="text-teal-300 font-medium">{appPhase}</span>
                </div>
              </div>
            </div>
            
            {/* Interactive Session Section */}
            <div className="space-y-2">
              <h4 className="text-teal-400 font-semibold uppercase tracking-wider text-[10px]">Interactive Session</h4>
              <div className="pl-2 py-1 border-l-2 border-teal-800/50 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">Session Status:</span>
                  <span className="text-teal-300 font-medium">{sessionStatus}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Session ID:</span>
                  <span className="text-teal-300 font-medium truncate max-w-[140px]" title={sessionId || "N/A"}>
                    {sessionId ? sessionId.slice(0, 8) + '...' : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Session Active:</span>
                  <span className="text-teal-300 font-medium">{formatBoolean(isSessionActive)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Mic Status:</span>
                  <span className="text-teal-300 font-medium">{micStatus}</span>
                </div>
              </div>
            </div>
            
            {/* Interaction Log Section */}
            <div className="space-y-2">
              <h4 className="text-teal-400 font-semibold uppercase tracking-wider text-[10px]">Interaction Log</h4>
              <div className="pl-2 py-1 border-l-2 border-teal-800/50 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">Utterance Count:</span>
                  <span className="text-teal-300 font-medium">{utteranceCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Utterance By:</span>
                  <span className="text-teal-300 font-medium">{lastUtteranceSource || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Submitted Data Size:</span>
                  <span className="text-teal-300 font-medium">
                    {formatNullable(submittedDataLength, val => `${val} chars`)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Backend Communications Section */}
            <div className="space-y-2">
              <h4 className="text-teal-400 font-semibold uppercase tracking-wider text-[10px]">Backend Communications</h4>
              <div className="pl-2 py-1 border-l-2 border-teal-800/50">
                <span className="text-gray-400 block mb-1">Backend Comm Log:</span>
                {backendCommsLog.length > 0 ? (
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1 bg-black/20 p-2 rounded">
                    {backendCommsLog.slice(-5).map((log, index) => (
                      <div key={index} className="text-[10px] leading-tight">
                        <span className="text-gray-500">{log.timestamp}</span>
                        <span className="text-blue-400"> {log.serviceTarget === 'Backend' ? 'Cloud Application Back-End' : log.serviceTarget}</span>
                        <span className="text-teal-300"> {log.method}</span>
                        <span className={`${log.outcome === 'success' ? 'text-green-400' : 'text-red-400'}`}> {log.outcome}</span>
                        {log.statusCode && <span className="text-yellow-400"> ({log.statusCode})</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-500 text-[10px] italic">No API calls recorded</span>
                )}
              </div>
            </div>
            
            {/* Processed Outputs Section */}
            <div className="space-y-2">
              <h4 className="text-teal-400 font-semibold uppercase tracking-wider text-[10px]">Processed Outputs</h4>
              <div className="pl-2 py-1 border-l-2 border-teal-800/50 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">Data Output 1:</span>
                  <span className={`${outputSet1Received ? 'text-green-400' : 'text-yellow-500'} font-medium`}>
                    {outputSet1Received ? "Received" : "Pending"}
                    {outputSet1Received && outputSet1FieldCount !== null && ` (Fields: ${outputSet1FieldCount})`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Data Output 2:</span>
                  <span className={`${outputSet2Received ? 'text-green-400' : 'text-yellow-500'} font-medium`}>
                    {outputSet2Received ? "Received" : "Pending"}
                    {outputSet2Received && outputSet2ApproxLength !== null && ` (Approx. Chars: ${outputSet2ApproxLength})`}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Client Events Section */}
            <div className="space-y-2">
              <h4 className="text-teal-400 font-semibold uppercase tracking-wider text-[10px]">Client Events</h4>
              <div className="pl-2 py-1 border-l-2 border-teal-800/50">
                <span className="text-gray-400 block mb-1">Client Event Log:</span>
                {clientEventsLog.length > 0 ? (
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1 bg-black/20 p-2 rounded">
                    {clientEventsLog.slice(-5).map((log, index) => (
                      <div key={index} className="text-[10px] leading-tight text-gray-300">
                        {log}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-500 text-[10px] italic">No client events recorded</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-gray-900/70 px-3 py-2 text-[10px] text-gray-500 border-t border-gray-800">
            Build info: Development | {new Date().toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
}
