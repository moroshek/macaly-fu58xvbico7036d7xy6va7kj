import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import MedicalIntakePage from '../app/page'; // Import the actual page
import { UI_STATES } from '@/lib/config';

// Mock dependencies
vi.mock('@/lib/backend-service', () => ({
  BackendService: {
    getInstance: vi.fn(() => ({
      initiateIntake: vi.fn(),
      submitTranscript: vi.fn(),
    })),
  },
}));

vi.mock('@/hooks/useUltravoxSession', () => ({
  useUltravoxSession: vi.fn(() => ({
    initializeSession: vi.fn(),
    endSession: vi.fn(),
    getTranscripts: vi.fn(() => []),
    // Add any other properties/methods returned by the actual hook
    // and used by MedicalIntakePage or its children, with default mock implementations
  })),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

vi.mock('@/hooks/useAppLogger', () => ({
  useAppLogger: vi.fn(() => ({
    logClientEvent: vi.fn(),
    logApiCall: vi.fn(),
    logError: vi.fn(),
    getBackendComms: vi.fn(() => []),
    getClientEvents: vi.fn(() => []),
    clearLogs: vi.fn(),
  })),
}));

vi.mock('@/lib/transcript-service', () => ({
  TranscriptService: {
    getInstance: vi.fn(() => ({
      processTranscriptForSubmission: vi.fn((transcript) => ({
        isValid: true,
        cleanedTranscript: transcript,
        stats: { totalLength: 0, totalUtterances: 0 },
        warnings: [],
      })),
    })),
  },
}));

vi.mock('@/lib/error-handler', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => ({
      handle: vi.fn((error, context) => ({
        message: error.message,
        userMessage: `An error occurred: ${error.message}`,
        context,
      })),
    })),
  },
}));

vi.mock('@/utils/network-utils', () => ({
  setupNetworkListeners: vi.fn(() => () => {}), // Returns a cleanup function
}));

// Mock browser compatibility checks
vi.mock('@/lib/browser-compat', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual, // Import and retain default exports
    checkBrowserCompatibility: vi.fn(() => ({
      compatible: true,
      issues: [],
      details: {
        mediaDevices: true,
        webSockets: true,
        webAudio: true,
        permissions: true,
      },
    })),
    // checkMicrophonePermissions will be spied on and mocked per test
    // We need the actual implementation for some tests, and mock for others.
    // For simplicity, we'll spy on global navigator methods directly.
  };
});


// Global navigator mocks
global.navigator.mediaDevices = {
  ...global.navigator.mediaDevices, // Preserve other properties if any
  getUserMedia: vi.fn(),
};
global.navigator.permissions = {
  ...global.navigator.permissions, // Preserve other properties if any
  query: vi.fn(),
};

describe('MedicalIntakePage Microphone Permission Scenarios', () => {
  let mockGetMedia: ReturnType<typeof vi.spyOn>;
  let mockPermQuery: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default success mocks for permissions
    mockGetMedia = vi.spyOn(navigator.mediaDevices, 'getUserMedia');
    mockPermQuery = vi.spyOn(navigator.permissions, 'query');

    mockPermQuery.mockResolvedValue({ state: 'granted' } as unknown as PermissionStatus);
    mockGetMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream);

    // Default success mock for BackendService
    const backendServiceMock = vi.mocked(BackendService.getInstance());
    backendServiceMock.initiateIntake.mockResolvedValue({
      callId: 'test-call-id',
      joinUrl: 'test-join-url',
    });

    // Default success mock for useUltravoxSession
    const ultravoxSessionMock = vi.mocked(useUltravoxSession({
        onTranscriptUpdate: vi.fn(),
        onStatusChange: vi.fn(),
        onSessionEnd: vi.fn(),
        onError: vi.fn(),
    }));
    ultravoxSessionMock.initializeSession.mockResolvedValue(true);

    // Mock online status
    Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
    });
  });

  afterEach(() => {
    mockGetMedia.mockRestore();
    mockPermQuery.mockRestore();
  });

  // Helper function to click the start button
  const clickStartButton = async () => {
    const startButton = await screen.findByRole('button', { name: /Start Medical Intake/i });
    fireEvent.click(startButton);
  };

  // Scenario 1: Permission Granted via Permissions API
  it('Scenario 1: should grant permission and transition UI when Permissions API returns "granted"', async () => {
    mockPermQuery.mockResolvedValueOnce({ state: 'granted' } as unknown as PermissionStatus);

    render(<MedicalIntakePage />);
    await clickStartButton();

    // Check UI transition (example: to initiating)
    // The actual status text is "Connecting to AI assistant..." for 'initiating'
    await waitFor(() => {
      expect(screen.getByText(/Connecting to AI assistant.../i)).toBeInTheDocument();
    });
    
    // Check that no error message related to microphone is shown
    // This can be inferred by checking that the error UI state is not active
    // For example, the "Error Occurred" title would not be present
    expect(screen.queryByText(/Error Occurred/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Microphone access denied/i)).not.toBeInTheDocument();

    // Further check if it moves to interviewing state if initializeSession is successful
    // useUltravoxSession's onStatusChange would typically trigger this
    // For this test, we focus on the permission part and initial transition.
    // The `useUltravoxSession` mock's `initializeSession` returns true,
    // and `useInterviewManager` calls `setInterviewActive(true)`.
    // `MedicalIntakePage` uses `appState.uvStatus` and `appState.isInterviewActive`
    // which are updated by `useUltravoxSession`'s callbacks.
    // We can simulate this callback or check for an element that appears in 'interviewing' state.
    // The status text for interviewing is "Interview in progress - speak clearly"
    // However, the state transition to 'interviewing' depends on uvStatus updates.
    // Let's assume for now that 'initiating' is sufficient to show permission was granted.
  });

  // Scenario 2: Permission Granted via getUserMedia Fallback
  it('Scenario 2: should grant permission via getUserMedia fallback and transition UI', async () => {
    mockPermQuery.mockRejectedValueOnce(new Error('Permissions API failed')); // or return { state: 'prompt' }
    mockGetMedia.mockResolvedValueOnce({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream);

    render(<MedicalIntakePage />);
    await clickStartButton();
    
    await waitFor(() => {
      expect(screen.getByText(/Connecting to AI assistant.../i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Error Occurred/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Microphone access denied/i)).not.toBeInTheDocument();
  });

  // Scenario 3: Permission Denied via Permissions API (Previously Denied)
  it('Scenario 3: should show error and disable start when Permissions API returns "denied"', async () => {
    mockPermQuery.mockResolvedValueOnce({ state: 'denied' } as unknown as PermissionStatus);

    render(<MedicalIntakePage />);
    await clickStartButton();

    await waitFor(() => {
      // Status text for error state: "Error occurred - please try again"
      // Or the specific error message. Let's check for the specific error message.
      expect(screen.getByText(/Microphone access denied\. Please allow microphone access and try again\./i)).toBeInTheDocument();
    });
    
    // Check for "Error Occurred" title which is part of the error UI block
    expect(screen.getByText(/Error Occurred/i)).toBeInTheDocument();

    const startButton = screen.getByRole('button', { name: /Start Medical Intake/i });
    expect(startButton).toBeDisabled();

    expect(screen.getByRole('button', { name: /Request Microphone Access/i })).toBeInTheDocument();
  });

  // Scenario 4: User Denies Permission via getUserMedia Prompt
  it('Scenario 4: should show error for NotAllowedError from getUserMedia', async () => {
    mockPermQuery.mockResolvedValueOnce({ state: 'prompt' } as unknown as PermissionStatus);
    mockGetMedia.mockRejectedValueOnce(new DOMException('Permission denied by user', 'NotAllowedError'));

    render(<MedicalIntakePage />);
    await clickStartButton();

    await waitFor(() => {
      expect(screen.getByText(/Microphone access denied by user\. Please allow microphone access and try again\./i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Error Occurred/i)).toBeInTheDocument();
    const startButton = screen.getByRole('button', { name: /Start Medical Intake/i });
    expect(startButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /Request Microphone Access/i })).toBeInTheDocument();
  });

  // Scenario 5: No Microphone Found (NotFoundError)
  it('Scenario 5: should show error for NotFoundError from getUserMedia', async () => {
    mockPermQuery.mockResolvedValueOnce({ state: 'prompt' } as unknown as PermissionStatus); // Or rejected
    mockGetMedia.mockRejectedValueOnce(new DOMException('No microphone found', 'NotFoundError'));

    render(<MedicalIntakePage />);
    await clickStartButton();

    await waitFor(() => {
      expect(screen.getByText(/No microphone found on this device\. Please connect a microphone and try again\./i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Error Occurred/i)).toBeInTheDocument();
    const startButton = screen.getByRole('button', { name: /Start Medical Intake/i });
    expect(startButton).toBeDisabled();
    // Request microphone access button might still be shown, or a different recovery option
    expect(screen.getByRole('button', { name: /Request Microphone Access/i })).toBeInTheDocument();
  });
  
  // Scenario 6: Microphone In Use (NotReadableError)
  it('Scenario 6: should show error for NotReadableError from getUserMedia', async () => {
    mockPermQuery.mockResolvedValueOnce({ state: 'prompt' } as unknown as PermissionStatus); // Or rejected
    mockGetMedia.mockRejectedValueOnce(new DOMException('Microphone is already in use', 'NotReadableError'));

    render(<MedicalIntakePage />);
    await clickStartButton();

    await waitFor(() => {
      expect(screen.getByText(/Microphone is already in use by another application\. Please close other applications and try again\./i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Error Occurred/i)).toBeInTheDocument();
    const startButton = screen.getByRole('button', { name: /Start Medical Intake/i });
    expect(startButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /Request Microphone Access/i })).toBeInTheDocument();
  });

  // Scenario 7: Successful Re-request via "Request Microphone Access" Button
  it('Scenario 7: should successfully re-request permission and enable start button', async () => {
    // Initial state: Permission denied
    mockPermQuery.mockResolvedValueOnce({ state: 'denied' } as unknown as PermissionStatus);
    
    render(<MedicalIntakePage />);
    await clickStartButton(); // Initial click to get into denied state

    await waitFor(() => {
      expect(screen.getByText(/Microphone access denied\. Please allow microphone access and try again\./i)).toBeInTheDocument();
    });
    const startButton = screen.getByRole('button', { name: /Start Medical Intake/i });
    expect(startButton).toBeDisabled();
    const requestButton = screen.getByRole('button', { name: /Request Microphone Access/i });
    expect(requestButton).toBeInTheDocument();

    // Setup mocks for successful re-request
    // Assuming clicking "Request Microphone Access" internally calls checkMicrophonePermissions again,
    // which uses permissions.query and/or mediaDevices.getUserMedia.
    // Let's assume it first tries permissions.query.
    mockPermQuery.mockResolvedValueOnce({ state: 'granted' } as unknown as PermissionStatus);
    // If it fell back to getUserMedia, this would be the mock:
    // mockGetMedia.mockResolvedValueOnce({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream);


    fireEvent.click(requestButton);

    // Assertions after re-request
    // Error message should clear, or UI should go back to 'idle' state
    // The status text for 'idle' is "Ready to start your medical intake interview"
    await waitFor(() => {
       expect(screen.getByText(/Ready to start your medical intake interview/i)).toBeInTheDocument();
    });
    
    // Error message specific to mic denial should be gone
    expect(screen.queryByText(/Microphone access denied/i)).not.toBeInTheDocument();
    // The "Error Occurred" block should be gone
    expect(screen.queryByText(/Error Occurred/i)).not.toBeInTheDocument();


    // Start button should become enabled
    // It might re-render, so re-query it
    const enabledStartButton = await screen.findByRole('button', { name: /Start Medical Intake/i });
    expect(enabledStartButton).toBeEnabled();
    
    // "Request Microphone Access" button should ideally disappear or change
    // In the current IntakeControlUI, if hasAudioPermission becomes true, this button is not rendered.
    expect(screen.queryByRole('button', { name: /Request Microphone Access/i })).not.toBeInTheDocument();
  });
});

describe('MedicalIntakePage General UI Flow', () => {
  // Re-use beforeEach and afterEach from the Microphone Permission Scenarios
  // as they set up and tear down mocks that are also relevant here.
  // If specific mocks need different behavior for these general flow tests,
  // they can be overridden within individual 'it' blocks.

  let mockGetMedia: ReturnType<typeof vi.spyOn>;
  let mockPermQuery: ReturnType<typeof vi.spyOn>;
  let backendServiceMock: any;
  let ultravoxSessionHookMock: any;
  let transcriptServiceMock: any;
  let toastMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers(); // Default to real timers, enable fake timers per test if needed

    mockGetMedia = vi.spyOn(navigator.mediaDevices, 'getUserMedia');
    mockPermQuery = vi.spyOn(navigator.permissions, 'query');

    mockPermQuery.mockResolvedValue({ state: 'granted' } as unknown as PermissionStatus);
    mockGetMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream);

    backendServiceMock = vi.mocked(BackendService.getInstance());
    backendServiceMock.initiateIntake.mockResolvedValue({
      callId: 'test-call-id',
      joinUrl: 'test-join-url',
    });
    backendServiceMock.submitTranscript.mockResolvedValue({
      summary: { mainConcern: "Test concern", symptoms: "Test symptoms" },
      analysis: "Test analysis data.",
    });
    
    // Retrieve the mocked hook function itself
    const useUltravoxSessionMockFn = vi.mocked(useUltravoxSession);
    // Define the mock implementation for the hook's return value
    ultravoxSessionHookMock = {
      initializeSession: vi.fn().mockResolvedValue(true),
      endSession: vi.fn().mockResolvedValue(undefined), // Assuming endSession is void or returns a simple promise
      getTranscripts: vi.fn().mockReturnValue([{ speaker: 'user', text: 'Hello test transcript' }]),
      // Add other methods if MedicalIntakePage directly calls them
    };
    // Make the hook return the new mock object for each test
    useUltravoxSessionMockFn.mockReturnValue(ultravoxSessionHookMock);


    transcriptServiceMock = vi.mocked(TranscriptService.getInstance());
    transcriptServiceMock.processTranscriptForSubmission.mockReturnValue({
        isValid: true,
        cleanedTranscript: [{ speaker: 'user', text: 'Hello test transcript' }],
        stats: { totalLength: 20, totalUtterances: 1 },
        warnings: [],
    });
    
    toastMock = vi.mocked(useToast()().toast);


    Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
    });
  });

  afterEach(() => {
    mockGetMedia.mockRestore();
    mockPermQuery.mockRestore();
    vi.useRealTimers(); // Clean up fake timers
  });

  const clickStartButton = async () => {
    const startButton = await screen.findByRole('button', { name: /Start Medical Intake/i });
    fireEvent.click(startButton);
  };

  const clickEndInterviewButton = async () => {
    const endButton = await screen.findByRole('button', { name: /End Interview/i });
    fireEvent.click(endButton);
  };
  
  const clickTryAgainButton = async () => {
    const tryAgainButton = await screen.findByRole('button', { name: /Try Again/i });
    fireEvent.click(tryAgainButton);
  };

  const clickStartNewInterviewButton = async () => {
    const startNewButton = await screen.findByRole('button', { name: /Start New Interview/i });
    fireEvent.click(startNewButton);
  };


  // Test 1: Initial Idle State
  it('should display idle state with Start Medical Intake button initially', async () => {
    render(<MedicalIntakePage />);
    
    // Status text for idle state: "Ready to start your medical intake interview"
    expect(await screen.findByText(/Ready to start your medical intake interview/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Medical Intake/i })).toBeEnabled();
    
    // Results sections should not be visible.
    // Assuming ResultsDisplay.tsx shows some titles like "Summary" or "Analysis"
    // or specific content when data is present.
    expect(screen.queryByText(/Your Interview Summary/i)).not.toBeInTheDocument(); // From ResultsDisplay
    expect(screen.queryByText(/Clinical Analysis/i)).not.toBeInTheDocument(); // From ResultsDisplay
  });

  // Test 2: Start Interview -> Initiating -> Interviewing Flow
  it('should transition to initiating and then interviewing state', async () => {
    render(<MedicalIntakePage />);
    await clickStartButton();

    // Status text for requesting_permissions: "Requesting microphone permissions..."
    // This state is very brief if permissions are already granted or quickly resolved by mocks.
    // Then, initiating state: "Connecting to AI assistant..."
    await waitFor(() => {
      expect(screen.getByText(/Connecting to AI assistant.../i)).toBeInTheDocument();
    });

    // To reach 'interviewing', ultravoxSession.initializeSession must succeed,
    // and typically an onStatusChange callback from useUltravoxSession would update uvStatus,
    // which in turn updates uiState in MedicalIntakePage.
    // For this test, we'll simulate that the state eventually becomes 'interviewing'.
    // The mock for initializeSession already resolves to true.
    // The app has logic to set isInterviewActive to true.
    // The UI_STATES.INTERVIEWING is set if uvStatus changes to something like 'connected' or 'active'.
    // Let's assume the mock setup is enough to push it to interviewing or check for elements.
    // Status text for interviewing: "Interview in progress - speak clearly"
    // An "End Interview" button also appears.
    await waitFor(() => {
        // The status text depends on getStatusText() which combines UI state and uvStatus.
        // "Interview Active" is part of IntakeControlUI when uiState is 'interviewing'.
        expect(screen.getByText(/Interview Active/i)).toBeInTheDocument(); 
        expect(screen.getByRole('button', { name: /End Interview/i })).toBeInTheDocument();
    }, { timeout: 2000 }); // Increased timeout for state changes
  });

  // Test 3: Interviewing -> End Interview -> Processing -> Results Flow
  it('should transition from interviewing to processing and then display results', async () => {
    vi.useFakeTimers();
    render(<MedicalIntakePage />);
    
    // Get to interviewing state
    await clickStartButton();
    await waitFor(() => {
      expect(screen.getByText(/Interview Active/i)).toBeInTheDocument();
    });

    // Mock submitTranscript to return specific data for assertion
    backendServiceMock.submitTranscript.mockResolvedValueOnce({
      summary: { mainConcern: "Headache", symptoms: "Dizziness, Nausea" },
      analysis: "Possible migraine. Consider neurological consult.",
    });
    
    await clickEndInterviewButton();

    // Status text for processing_transcript: "Processing your interview..."
    // Or "Processing Interview" title in IntakeControlUI
    await waitFor(() => {
      expect(screen.getByText(/Processing Interview/i)).toBeInTheDocument();
    });

    // Advance timers for DISPLAY_RESULTS_DELAY_MS
    vi.advanceTimersByTime(200); // Default DISPLAY_RESULTS_DELAY_MS is 100ms, using 200 for safety

    // Status text for displaying_results: "Interview complete - review your summary"
    // Or "Interview Complete" title in IntakeControlUI
    await waitFor(() => {
      expect(screen.getByText(/Interview Complete/i)).toBeInTheDocument();
    });

    // Check for summary and analysis data (referring to ResultsDisplay.tsx)
    // Assuming ResultsDisplay shows "Your Interview Summary" and "Clinical Analysis" as titles
    // and then the content.
    expect(await screen.findByText(/Your Interview Summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Headache/i)).toBeInTheDocument(); // Part of summaryData.mainConcern
    expect(screen.getByText(/Dizziness, Nausea/i)).toBeInTheDocument(); // Part of summaryData.symptoms
    
    expect(await screen.findByText(/Clinical Analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/Possible migraine\. Consider neurological consult\./i)).toBeInTheDocument(); // analysisData
    
    vi.useRealTimers();
  });

  // Test 4: Error State and 'Try Again' Functionality
  it('should show error state and then reset to idle on Try Again', async () => {
    backendServiceMock.initiateIntake.mockRejectedValueOnce(new Error('Network failure'));
    
    render(<MedicalIntakePage />);
    await clickStartButton();

    // "Error Occurred" title in IntakeControlUI
    await waitFor(() => {
      expect(screen.getByText(/Error Occurred/i)).toBeInTheDocument();
    });
    // The specific error message passed to IntakeControlUI comes from ErrorHandler
    expect(screen.getByText(/An error occurred: Network failure/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();

    // Reset initiateIntake mock for the "Try Again" attempt
    backendServiceMock.initiateIntake.mockResolvedValue({
        callId: 'test-call-id-2',
        joinUrl: 'test-join-url-2',
    });
    
    await clickTryAgainButton();

    // Should go back to idle state
    // Status text for idle state: "Ready to start your medical intake interview"
    await waitFor(() => {
      expect(screen.getByText(/Ready to start your medical intake interview/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Start Medical Intake/i })).toBeEnabled();
    expect(screen.queryByText(/Error Occurred/i)).not.toBeInTheDocument();
  });

  // Test 5: Full Cycle: Idle -> Start -> Interviewing -> End -> Results -> Start New Interview
  it('should handle the full interview cycle and reset with Start New Interview', async () => {
    vi.useFakeTimers();
    render(<MedicalIntakePage />);

    // 1. Initial Idle State
    expect(await screen.findByText(/Ready to start your medical intake interview/i)).toBeInTheDocument();

    // 2. Start Interview -> Initiating -> Interviewing
    await clickStartButton();
    await waitFor(() => expect(screen.getByText(/Connecting to AI assistant.../i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Interview Active/i)).toBeInTheDocument(), { timeout: 2000 });

    // 3. Interviewing -> End Interview -> Processing -> Results
    backendServiceMock.submitTranscript.mockResolvedValueOnce({
      summary: { mainConcern: "Full Cycle Test", symptoms: "Works" },
      analysis: "Full cycle analysis complete.",
    });
    await clickEndInterviewButton();
    await waitFor(() => expect(screen.getByText(/Processing Interview/i)).toBeInTheDocument());
    vi.advanceTimersByTime(200); // DISPLAY_RESULTS_DELAY_MS
    await waitFor(() => expect(screen.getByText(/Interview Complete/i)).toBeInTheDocument());
    expect(await screen.findByText(/Full Cycle Test/i)).toBeInTheDocument(); // Check results displayed

    // 4. Results -> Start New Interview (Back to Idle)
    // The resetAllAndStartNew function has a START_INTERVIEW_DELAY_MS.
    // If it auto-starts, we need to mock initiateIntake for the new attempt.
    backendServiceMock.initiateIntake.mockResolvedValue({
        callId: 'new-test-call-id',
        joinUrl: 'new-test-join-url',
    });
    
    await clickStartNewInterviewButton();
    
    // The `resetAllAndStartNew` function in `useInterviewManager` calls `appStateResetAll`,
    // then `logger.clearLogs()`, and then `handleStartInterview` after `START_INTERVIEW_DELAY_MS`.
    // So, it will briefly be 'idle' and then try to start again.
    // We want to assert it's back to a clean idle state before the auto-restart,
    // or ensure the auto-restart is handled.
    // The status text "Ready to start..." appears when uiState is 'idle'.
    
    // First, it should go to idle.
    await waitFor(() => {
        expect(screen.getByText(/Ready to start your medical intake interview/i)).toBeInTheDocument();
    });
    
    // Then, after START_INTERVIEW_DELAY_MS (default 100ms), it will call handleStartInterview.
    // So it might transition to 'requesting_permissions' or 'initiating' quickly.
    // If we want to assert the pure 'idle' state before the auto-start:
    // We'd need to clear timers or ensure the START_INTERVIEW_DELAY_MS is long enough.
    // For this test, let's confirm it goes back to idle, and then the auto-start sequence begins.
    
    vi.advanceTimersByTime(200); // START_INTERVIEW_DELAY_MS (default 100) + buffer

    // After the delay, it should try to start the interview again, so it will be 'initiating'
    await waitFor(() => {
      expect(screen.getByText(/Connecting to AI assistant.../i)).toBeInTheDocument();
    });

    vi.useRealTimers();
  });
});
