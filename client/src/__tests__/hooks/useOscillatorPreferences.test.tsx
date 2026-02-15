import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useOscillatorPreferences } from '@/hooks/useOscillatorPreferences';
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

describe('useOscillatorPreferences', () => {
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

  it('should use default preferences when API returns 404', async () => {
    // Mock API to return 404
    vi.mocked(apiAuth.authenticatedApiRequest).mockRejectedValue(
      new apiAuth.ApiError('Not found', 404)
    );

    const { result } = renderHook(() => useOscillatorPreferences(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.favoriteOscillators).toEqual([]);
  });

  it('should load preferences from API when available', async () => {
    const mockPreferences = {
      favoriteOscillators: ['rsi', 'macd', 'obv'],
    };

    // Mock API to return preferences
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValue({
      json: async () => mockPreferences,
    } as Response);

    const { result } = renderHook(() => useOscillatorPreferences(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.favoriteOscillators).toEqual(['rsi', 'macd', 'obv']);
  });

  it('should toggle favorite oscillator', async () => {
    // Mock initial GET to return 404 (use defaults)
    vi.mocked(apiAuth.authenticatedApiRequest).mockRejectedValueOnce(
      new apiAuth.ApiError('Not found', 404)
    );

    const { result } = renderHook(() => useOscillatorPreferences(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.favoriteOscillators).toEqual([]);

    // Mock PUT to succeed
    const updatedPreferences = {
      favoriteOscillators: ['rsi'],
    };
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValueOnce({
      json: async () => updatedPreferences,
    } as Response);

    // Also mock the refetch after mutation
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValueOnce({
      json: async () => updatedPreferences,
    } as Response);

    // Toggle favorite
    result.current.toggleFavorite('rsi');

    // Should update optimistically
    await waitFor(() => expect(result.current.favoriteOscillators).toContain('rsi'));
  });

  it('should check if oscillator is favorite', async () => {
    const mockPreferences = {
      favoriteOscillators: ['rsi', 'macd'],
    };

    // Mock API to return preferences
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValue({
      json: async () => mockPreferences,
    } as Response);

    const { result } = renderHook(() => useOscillatorPreferences(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isFavorite('rsi')).toBe(true);
    expect(result.current.isFavorite('macd')).toBe(true);
    expect(result.current.isFavorite('obv')).toBe(false);
  });

  it('should remove oscillator from favorites when toggled again', async () => {
    // Mock initial GET with existing favorites
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValueOnce({
      json: async () => ({ favoriteOscillators: ['rsi', 'macd'] }),
    } as Response);

    const { result } = renderHook(() => useOscillatorPreferences(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.favoriteOscillators).toEqual(['rsi', 'macd']);

    // Mock PUT to succeed
    const updatedPreferences = {
      favoriteOscillators: ['macd'],
    };
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValueOnce({
      json: async () => updatedPreferences,
    } as Response);

    // Also mock the refetch after mutation
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValueOnce({
      json: async () => updatedPreferences,
    } as Response);

    // Toggle to remove favorite
    result.current.toggleFavorite('rsi');

    // Should update optimistically
    await waitFor(() => expect(result.current.favoriteOscillators).not.toContain('rsi'));
    expect(result.current.favoriteOscillators).toContain('macd');
  });
});
