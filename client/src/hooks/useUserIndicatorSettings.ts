import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedApiRequest, ApiError } from '@/lib/apiAuth';
import type { UserIndicatorSettingsResponse } from '@shared/schema';

// Default indicator settings when no data exists
export const DEFAULT_INDICATOR_SETTINGS: UserIndicatorSettingsResponse = {
  fvgSettings: null,
  orderBlockSettings: null,
  liquiditySettings: null,
  pdZoneSettings: null,
  bosSettings: null,
};

/**
 * Hook for managing user SMC indicator settings (FVG, Order Blocks, Liquidity, P/D Zones, BOS).
 * Persists settings to the backend via /api/users/indicator-settings.
 * Falls back to null (which triggers individual hooks to use their own defaults).
 */
export function useUserIndicatorSettings() {
  const queryClient = useQueryClient();

  // Load settings from API
  const { data: settings, isLoading } = useQuery({
    queryKey: ['user-indicator-settings'],
    queryFn: async (): Promise<UserIndicatorSettingsResponse> => {
      try {
        const response = await authenticatedApiRequest('GET', '/api/users/indicator-settings');
        const data = await response.json();
        return data;
      } catch (error) {
        // If 404, use defaults (no settings saved yet)
        if (error instanceof ApiError && error.status === 404) {
          return DEFAULT_INDICATOR_SETTINGS;
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Save a specific indicator's settings
  const { mutate: updateIndicatorSettings, isPending: isSaving } = useMutation({
    mutationFn: async (partial: Partial<UserIndicatorSettingsResponse>) => {
      const currentSettings = settings || DEFAULT_INDICATOR_SETTINGS;
      const newSettings: UserIndicatorSettingsResponse = {
        ...currentSettings,
        ...partial,
      };

      const response = await authenticatedApiRequest('PUT', '/api/users/indicator-settings', newSettings);
      const data = await response.json();
      return data;
    },
    onMutate: async (partial) => {
      await queryClient.cancelQueries({ queryKey: ['user-indicator-settings'] });
      const previous = queryClient.getQueryData<UserIndicatorSettingsResponse>(['user-indicator-settings']);

      queryClient.setQueryData<UserIndicatorSettingsResponse>(['user-indicator-settings'], (old) => ({
        ...(old || DEFAULT_INDICATOR_SETTINGS),
        ...partial,
      }));

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['user-indicator-settings'], context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-indicator-settings'] });
    },
  });

  return {
    settings: settings || DEFAULT_INDICATOR_SETTINGS,
    isLoading,
    isSaving,
    updateIndicatorSettings,
  };
}
