import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '',
  useSearchParams: () => ({ get: vi.fn() }),
}))

// Mock UltravoxSession
vi.mock('ultravox-client', () => ({
  UltravoxSession: vi.fn().mockImplementation(() => ({
    addEventListener: vi.fn(),
    status: 'idle',
    joinCall: vi.fn().mockResolvedValue(undefined),
    leaveCall: vi.fn().mockResolvedValue(undefined),
    muteMic: vi.fn(),
    unmuteMic: vi.fn(),
    isMicMuted: vi.fn().mockReturnValue(false),
  })),
}))

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    create: vi.fn().mockReturnValue({
      post: vi.fn(),
      get: vi.fn(),
      interceptors: {
        request: { use: vi.fn(), eject: vi.fn() },
        response: { use: vi.fn(), eject: vi.fn() },
      },
    }),
  },
}))

// Mock axios-retry
vi.mock('axios-retry', () => ({
  default: vi.fn(),
  isNetworkError: vi.fn().mockReturnValue(false),
  isRetryableError: vi.fn().mockReturnValue(false),
}))

// Mock toast notifications
vi.mock('@/hooks/use-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

// Mock the navigator media devices API
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue({}),
  },
  writable: true,
})

// Mock window.fetch
global.fetch = vi.fn()