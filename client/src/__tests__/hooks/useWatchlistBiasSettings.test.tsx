import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useWatchlistBiasSettings } from '@/hooks/useWatchlistBiasSettings';
import * as apiAuth from '@/lib/apiAuth';

// Mock the apiAuth module
vi.mock('@/lib/apiAuth', () => ({
  authenticatedApiRequest: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  },
}));

describe('useWatchlistBiasSettings', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  it('should use default settings when API returns 404', async () => {
    // Mock API to return 404
    vi.mocked(apiAuth.authenticatedApiRequest).mockRejectedValue(
      new apiAuth.ApiError('Not found', 404)
    );

    const { result } = renderHook(() => useWatchlistBiasSettings(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual({
      structurePivotLength: 5,
      emaLengths: [21, 50, 200],
    });
  });

  it('should load settings from API when available', async () => {
    const mockSettings = {
      structurePivotLength: 10,
      emaLengths: [13, 34, 89],
    };

    // Mock API to return settings
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValue({
      json: async () => mockSettings,
    } as Response);

    const { result } = renderHook(() => useWatchlistBiasSettings(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(mockSettings);
  });

  it('should update settings optimistically', async () => {
    const initialSettings = {
      structurePivotLength: 5,
      emaLengths: [21, 50, 200],
    };

    // Mock initial GET to return 404 (use defaults)
    vi.mocked(apiAuth.authenticatedApiRequest).mockRejectedValueOnce(
      new apiAuth.ApiError('Not found', 404)
    );

    const { result } = renderHook(() => useWatchlistBiasSettings(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(initialSettings);

    // Mock PUT to succeed
    const updatedSettings = {
      structurePivotLength: 7,
      emaLengths: [21, 50, 200],
    };
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValueOnce({
      json: async () => updatedSettings,
    } as Response);

    // Also mock the refetch after mutation
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValueOnce({
      json: async () => updatedSettings,
    } as Response);

    // Update settings
    result.current.updateSettings({ structurePivotLength: 7 });

    // Should update optimistically (wait for the mutation and refetch)
    await waitFor(() => expect(result.current.settings.structurePivotLength).toBe(7));
  });

  it('should validate EMA lengths array', async () => {
    // Mock initial GET to return 404
    vi.mocked(apiAuth.authenticatedApiRequest).mockRejectedValue(
      new apiAuth.ApiError('Not found', 404)
    );

    const { result } = renderHook(() => useWatchlistBiasSettings(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Settings should have exactly 3 EMA lengths
    expect(result.current.settings.emaLengths).toHaveLength(3);
    expect(result.current.settings.emaLengths).toEqual([21, 50, 200]);
  });
});
