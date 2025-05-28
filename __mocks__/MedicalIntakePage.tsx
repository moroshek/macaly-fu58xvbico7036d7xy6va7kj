import React from 'react';

// Lightweight mock of MedicalIntakePage to prevent memory leaks in tests
const MedicalIntakePageMock = () => {
  return (
    <div data-testid="medical-intake-page">
      <h1>Medical Intake System</h1>
      <div data-testid="audio-controls">
        <button data-testid="start-interview">Start Interview</button>
        <button data-testid="stop-interview">Stop Interview</button>
      </div>
      <div data-testid="permission-status">
        <span>Microphone Access: Granted</span>
      </div>
      <div data-testid="transcript-area">
        <h2>Transcript</h2>
        <div data-testid="transcript-content">Mock transcript content</div>
      </div>
      <div data-testid="summary-area">
        <h2>Summary</h2>
        <div data-testid="summary-content">Mock summary content</div>
      </div>
      <div data-testid="analysis-area">
        <h2>Analysis</h2>
        <div data-testid="analysis-content">Mock analysis content</div>
      </div>
    </div>
  );
};

export default MedicalIntakePageMock;
