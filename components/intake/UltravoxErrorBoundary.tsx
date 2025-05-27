"use client";

import React from 'react';

interface UltravoxErrorBoundaryProps {
  children: React.ReactNode;
}

interface UltravoxErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class UltravoxErrorBoundary extends React.Component<
  UltravoxErrorBoundaryProps,
  UltravoxErrorBoundaryState
> {
  constructor(props: UltravoxErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Ultravox Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <h3 className="font-bold">Voice AI Connection Error</h3>
          <p>Something went wrong with the voice AI connection.</p>
          <details className="mt-2">
            <summary className="cursor-pointer">Technical Details</summary>
            <pre className="text-xs mt-2 whitespace-pre-wrap">
              {this.state.error?.message}
            </pre>
          </details>
          <button 
            className="mt-3 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            onClick={() => window.location.reload()}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default UltravoxErrorBoundary;