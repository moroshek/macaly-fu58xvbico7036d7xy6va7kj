"use client";

import React from 'react';

interface DebugButtonProps {
  onClick: () => void;
  label?: string;
}

const DebugButton: React.FC<DebugButtonProps> = ({ onClick, label = 'Debug Transcript State' }) => {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  return (
    <button 
      onClick={onClick}
      style={{ 
        position: 'fixed', 
        top: '10px', 
        right: '10px', 
        zIndex: 1000,
        background: 'red',
        color: 'white',
        padding: '10px',
        borderRadius: '4px',
        fontSize: '12px'
      }}
    >
      {label}
    </button>
  );
};

export default DebugButton;