"use client";

import React from 'react';
// Removed Button import as it's not used directly in this component's JSX
// The parent button element handles the click.

interface Area1IdleDisplayProps {
  onStartInterview: () => void;
}

const Area1IdleDisplay: React.FC<Area1IdleDisplayProps> = ({ onStartInterview }) => {
  return (
    <button
      onClick={onStartInterview}
      className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-teal-50/50 active:scale-[0.99] w-full"
      aria-label="Start Interview"
    >
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="flex items-center justify-center space-x-1 h-32 mb-6">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className={`w-2 bg-teal-500 rounded-full opacity-70 animate-pulse`}
              style={{
                height: `${Math.sin(i / 3) * 30 + 40}px`,
                animationDelay: `${i * 50}ms`,
                animationDuration: `${800 + (i % 4) * 300}ms`,
              }}
            ></div>
          ))}
        </div>
        <div className="text-center">
          <p className="text-lg font-medium text-teal-700">Start Interview</p>
          <p className="text-sm text-gray-500 mt-2">Our AI assistant is ready to listen</p>
        </div>
      </div>
    </button>
  );
};

export default Area1IdleDisplay;