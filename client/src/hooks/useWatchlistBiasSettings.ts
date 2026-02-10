import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedApiRequest, ApiError } from '@/lib/apiAuth';
import type { WatchlistBiasSettings } from '@shared/schema';

// Default settings to use when API returns 404 or no data
const DEFAULT_SETTINGS: WatchlistBiasSettings = {
  structurePivotLength: 5,
  emaLengths: [21, 50, 200],
};

/**
 * Hook for managing watchlist bias settings (structure pivot length + EMA lengths).
 * Persists settings to the backend via /api/crypto/watchlist/settings.
 * Uses defaults when no settings exist yet.
 */
export function useWatchlistBiasSettings() {
  const queryClient = useQueryClient();

  // Load settings from API
  const { data: settings, isLoading } = useQuery({
    queryKey: ['watchlist-bias-settings'],
    queryFn: async (): Promise<WatchlistBiasSettings> => {
      console.log('📥 Fetching watchlist bias settings from API');
      try {
        const response = await authenticatedApiRequest('GET', '/api/crypto/watchlist/settings');
        const data = await response.json();
        console.log('✅ Watchlist bias settings loaded:', data);
        return data;
      } catch (error) {
        // If 404, use defaults (no settings saved yet)
        if (error instanceof ApiError && error.status === 404) {
          console.log('⚠️ No saved settings found, using defaults:', DEFAULT_SETTINGS);
          return DEFAULT_SETTINGS;
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - refresh data periodically to stay in sync
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });

  // Save settings mutation
  const { mutate: updateSettings, isPending: isSaving } = useMutation({
    mutationFn: async (partial: Partial<WatchlistBiasSettings>) => {
      const currentSettings = settings || DEFAULT_SETTINGS;
      const newSettings: WatchlistBiasSettings = {
        ...currentSettings,
        ...partial,
      };
      
      console.log('💾 Saving watchlist bias settings:', newSettings);
      const response = await authenticatedApiRequest('PUT', '/api/crypto/watchlist/settings', newSettings);
      const data = await response.json();
      console.log('✅ Watchlist bias settings saved:', data);
      return data;
    },
    onMutate: async (partial) => {
      // Optimistically update local state
      await queryClient.cancelQueries({ queryKey: ['watchlist-bias-settings'] });
      const previous = queryClient.getQueryData<WatchlistBiasSettings>(['watchlist-bias-settings']);
      
      queryClient.setQueryData<WatchlistBiasSettings>(['watchlist-bias-settings'], (old) => ({
        ...(old || DEFAULT_SETTINGS),
        ...partial,
      }));
      
      return { previous };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['watchlist-bias-settings'], context.previous);
      }
      console.error('❌ Failed to save watchlist bias settings:', error);
    },
    onSuccess: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['watchlist-bias-settings'] });
    },
  });

  return {
    settings: settings || DEFAULT_SETTINGS,
    isLoading,
    isSaving,
    updateSettings,
  };
}
