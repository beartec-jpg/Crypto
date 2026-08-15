import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedApiRequest, ApiError } from '@/lib/apiAuth';
import type { UserSettingsResponse } from '@shared/schema';

// Default settings to use when API returns 404 or no data
export const DEFAULT_USER_SETTINGS: UserSettingsResponse = {
  defaultTimeframe: '1h',
  chartType: 'candlestick',
  sidebarCollapsed: false,
  theme: 'dark',
  lastSymbol: 'BTCUSDT',
  lastTimeframe: '1h',
  drawingDefaults: {
    byTool: {},
    autoColorEnabled: true,
  },
};

/**
 * Hook for managing general user application settings.
 * Persists settings to the backend via /api/users/settings.
 * Falls back to defaults when no settings exist yet.
 */
export function useUserSettings() {
  const queryClient = useQueryClient();

  // Load settings from API
  const { data: settings, isLoading } = useQuery({
    queryKey: ['user-settings'],
    queryFn: async (): Promise<UserSettingsResponse> => {
      try {
        const response = await authenticatedApiRequest('GET', '/api/users/settings');
        const data = await response.json();
        return {
          ...DEFAULT_USER_SETTINGS,
          ...data,
          drawingDefaults: data?.drawingDefaults || DEFAULT_USER_SETTINGS.drawingDefaults,
        };
      } catch (error) {
        // If 404, use defaults (no settings saved yet)
        if (error instanceof ApiError && (error.status === 404 || error.status === 401)) {
          return DEFAULT_USER_SETTINGS;
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Save settings mutation
  const { mutateAsync: updateSettings, isPending: isSaving } = useMutation({
    mutationFn: async (partial: Partial<UserSettingsResponse>) => {
      const currentSettings = settings || DEFAULT_USER_SETTINGS;
      const newSettings: UserSettingsResponse = {
        ...currentSettings,
        ...partial,
      };

      try {
        const response = await authenticatedApiRequest('PUT', '/api/users/settings', newSettings);
        const data = await response.json();
        return data as UserSettingsResponse;
      } catch (error) {
        if (error instanceof ApiError) {
          // Re-throw with a clearer message for UI toasts
          const detail =
            error.status === 401
              ? 'Not signed in (401). Please log in again.'
              : error.status === 404
                ? 'Account not linked to settings (404). Re-login or contact support.'
                : error.message;
          throw new ApiError(detail, error.status);
        }
        throw error;
      }
    },
    onMutate: async (partial) => {
      // Optimistically update local state
      await queryClient.cancelQueries({ queryKey: ['user-settings'] });
      const previous = queryClient.getQueryData<UserSettingsResponse>(['user-settings']);

      queryClient.setQueryData<UserSettingsResponse>(['user-settings'], (old) => ({
        ...(old || DEFAULT_USER_SETTINGS),
        ...partial,
      }));

      return { previous };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['user-settings'], context.previous);
      }
    },
    onSuccess: (data) => {
      // Prefer server payload so drawingDefaults.byTool matches DB
      if (data && typeof data === 'object') {
        queryClient.setQueryData(['user-settings'], data);
      }
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
    },
  });

  return {
    settings: settings || DEFAULT_USER_SETTINGS,
    isLoading,
    isSaving,
    updateSettings,
  };
}
