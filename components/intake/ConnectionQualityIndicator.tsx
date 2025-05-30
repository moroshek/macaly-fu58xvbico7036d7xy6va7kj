"use client";

import React from 'react';

interface ConnectionQualityIndicatorProps {
  quality: { 
    latency: number | null; 
    status: string 
  };
}

const ConnectionQualityIndicator: React.FC<ConnectionQualityIndicatorProps> = ({ quality }) => {
  const getIndicatorColor = () => {
    switch (quality.status) {
      case 'excellent': return 'bg-green-500';
      case 'good': return 'bg-yellow-500';
      case 'poor': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className={`${getIndicatorColor()} text-white px-3 py-1 rounded-full text-sm flex items-center space-x-2`}>
      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
      <span>
        {quality.latency ? `${quality.latency}ms` : 'Checking...'}
      </span>
    </div>
  );
};

export default ConnectionQualityIndicator;