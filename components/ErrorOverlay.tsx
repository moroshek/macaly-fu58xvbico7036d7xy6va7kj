// components/ErrorOverlay.tsx
'use client';

import React from 'react'; // Required for JSX

interface ErrorOverlayProps {
  message: string;
  onRetry: () => void;
  onReset?: () => void; // Optional reset handler
}

export function ErrorOverlay(props: ErrorOverlayProps) {
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000, // Ensure it's on top
    color: '#333', // Default text color for content within
  };

  const contentStyle: React.CSSProperties = {
    backgroundColor: 'white',
    padding: '30px', // Increased padding
    borderRadius: '8px',
    textAlign: 'center',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)', // Added a subtle shadow
    maxWidth: '80%', // Prevent it from being too wide on large screens
  };

  const messageStyle: React.CSSProperties = {
    margin: '0 0 20px 0', // Margin below the message
    fontSize: '1.1em',
    color: '#E74C3C', // Error message in red
  };
  
  const titleStyle: React.CSSProperties = {
      margin: '0 0 10px 0',
      color: '#333', // Darker color for title
  };

  const buttonStyle: React.CSSProperties = {
    margin: '10px 5px', // Adjusted margin for buttons
    padding: '12px 25px', // Adjusted padding
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '1em',
    fontWeight: 'bold',
  };
  
  const retryButtonStyle: React.CSSProperties = {
      ...buttonStyle,
      backgroundColor: '#3498DB', // Blue for retry
      color: 'white',
  };

  const resetButtonStyle: React.CSSProperties = {
      ...buttonStyle,
      backgroundColor: '#95A5A6', // Grey for reset
      color: 'white',
  };

  if (!props.message) {
    return null; // Don't render anything if there's no message
  }

  return (
    <div style={overlayStyle} data-testid="error-overlay">
      <div style={contentStyle}>
        <h2 style={titleStyle}>Application Error</h2>
        <p style={messageStyle} data-testid="error-message">{props.message}</p>
        <div>
          <button onClick={props.onRetry} style={retryButtonStyle} data-testid="retry-button">
            Retry
          </button>
          {props.onReset && (
            <button onClick={props.onReset} style={resetButtonStyle} data-testid="reset-button">
              Reset Application
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Log creation and description
console.log('Created components/ErrorOverlay.tsx: A UI component to display error messages with "Retry" and optional "Reset" actions.');
