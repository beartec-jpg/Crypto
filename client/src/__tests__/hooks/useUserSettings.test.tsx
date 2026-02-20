import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUserSettings, DEFAULT_USER_SETTINGS } from '@/hooks/useUserSettings';
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

describe('useUserSettings', () => {
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
    vi.mocked(apiAuth.authenticatedApiRequest).mockRejectedValue(
      new apiAuth.ApiError('Not found', 404)
    );

    const { result } = renderHook(() => useUserSettings(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('should load settings from API when available', async () => {
    const mockSettings = {
      defaultTimeframe: '4h',
      chartType: 'line' as const,
      sidebarCollapsed: true,
      theme: 'light',
      lastSymbol: 'ETHUSDT',
      lastTimeframe: '4h',
    };

    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValue({
      json: async () => mockSettings,
    } as Response);

    const { result } = renderHook(() => useUserSettings(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(mockSettings);
  });

  it('should update settings optimistically', async () => {
    // Mock initial GET to return 404 (use defaults)
    vi.mocked(apiAuth.authenticatedApiRequest).mockRejectedValueOnce(
      new apiAuth.ApiError('Not found', 404)
    );

    const { result } = renderHook(() => useUserSettings(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(DEFAULT_USER_SETTINGS);

    const updatedSettings = {
      ...DEFAULT_USER_SETTINGS,
      lastSymbol: 'ETHUSDT',
      lastTimeframe: '4h',
    };

    // Mock PUT to succeed
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValueOnce({
      json: async () => updatedSettings,
    } as Response);

    // Mock the refetch after mutation
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValueOnce({
      json: async () => updatedSettings,
    } as Response);

    result.current.updateSettings({ lastSymbol: 'ETHUSDT', lastTimeframe: '4h' });

    await waitFor(() => expect(result.current.settings.lastSymbol).toBe('ETHUSDT'));
    expect(result.current.settings.lastTimeframe).toBe('4h');
  });

  it('should rollback on save error', async () => {
    const initialSettings = {
      ...DEFAULT_USER_SETTINGS,
      lastSymbol: 'BTCUSDT',
    };

    // Mock initial GET to return data
    vi.mocked(apiAuth.authenticatedApiRequest).mockResolvedValueOnce({
      json: async () => initialSettings,
    } as Response);

    const { result } = renderHook(() => useUserSettings(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.lastSymbol).toBe('BTCUSDT');

    // Mock PUT to fail, then mock the refetch after error rollback
    vi.mocked(apiAuth.authenticatedApiRequest)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ json: async () => initialSettings } as Response);

    result.current.updateSettings({ lastSymbol: 'SOLUSDT' });

    // After error, should rollback to the original value
    await waitFor(() => expect(result.current.settings.lastSymbol).toBe('BTCUSDT'));
  });

  it('should have correct default settings values', () => {
    expect(DEFAULT_USER_SETTINGS.defaultTimeframe).toBe('1h');
    expect(DEFAULT_USER_SETTINGS.chartType).toBe('candlestick');
    expect(DEFAULT_USER_SETTINGS.sidebarCollapsed).toBe(false);
    expect(DEFAULT_USER_SETTINGS.theme).toBe('dark');
    expect(DEFAULT_USER_SETTINGS.lastSymbol).toBe('BTCUSDT');
    expect(DEFAULT_USER_SETTINGS.lastTimeframe).toBe('1h');
  });
});
