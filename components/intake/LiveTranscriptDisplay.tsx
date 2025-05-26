"use client";

import React, { useRef, useEffect } from 'react';
import { Utterance } from '@/app/page'; // Import the Utterance type from your page

interface LiveTranscriptDisplayProps {
  transcript: Utterance[];
}

const LiveTranscriptDisplay: React.FC<LiveTranscriptDisplayProps> = ({ transcript }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  if (transcript.length === 0) {
    return (
      <div className="bg-gray-100 p-4 rounded-lg">
        <p className="text-gray-500 italic">Conversation will appear here...</p>
      </div>
    );
  }

  return (
    <div 
      ref={scrollRef}
      className="bg-gray-50 border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2"
    >
      <h4 className="font-semibold text-gray-700 mb-2">Live Conversation:</h4>
      {transcript.map((item, index) => (
        <div 
          key={index} 
          className={`p-2 rounded ${
            item.speaker === 'user' 
              ? 'bg-blue-100 text-blue-800 ml-4' 
              : 'bg-green-100 text-green-800 mr-4'
          }`}
        >
          <span className="font-semibold">
            {item.speaker === 'user' ? 'You' : 'AI Doctor'}:
          </span>
          <span className="ml-2">{item.text}</span>
        </div>
      ))}
    </div>
  );
};

export default LiveTranscriptDisplay;