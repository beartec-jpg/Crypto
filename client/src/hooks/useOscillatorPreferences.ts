import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedApiRequest, ApiError } from '@/lib/apiAuth';
import type { OscillatorPreferences } from '@shared/schema';

// Default settings to use when API returns 404 or no data
const DEFAULT_PREFERENCES: OscillatorPreferences = {
  favoriteOscillators: [],
};

// Valid oscillator IDs
export type OscillatorId = 'rsi' | 'macd' | 'stochRSI' | 'obv' | 'mfi' | 'williamsR' | 'cci' | 'adx' | 'tideZone';

export const VALID_OSCILLATOR_IDS = new Set<OscillatorId>([
  'rsi', 'macd', 'stochRSI', 'obv', 'mfi', 'williamsR', 'cci', 'adx', 'tideZone',
]);

/**
 * Hook for managing oscillator preferences (favorite oscillators).
 * Persists preferences to the backend via /api/crypto/oscillator-preferences.
 * Uses defaults when no preferences exist yet.
 */
export function useOscillatorPreferences() {
  const queryClient = useQueryClient();

  // Load preferences from API
  const { data: preferences, isLoading } = useQuery({
    queryKey: ['oscillator-preferences'],
    queryFn: async (): Promise<OscillatorPreferences> => {
      console.log('📥 Fetching oscillator preferences from API');
      try {
        const response = await authenticatedApiRequest('GET', '/api/crypto/oscillator-preferences');
        const data = await response.json();
        console.log('✅ Oscillator preferences loaded:', data);
        return data;
      } catch (error) {
        // If 404, use defaults (no preferences saved yet)
        if (error instanceof ApiError && error.status === 404) {
          console.log('⚠️ No saved preferences found, using defaults:', DEFAULT_PREFERENCES);
          return DEFAULT_PREFERENCES;
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - refresh data periodically to stay in sync
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });

  // Save preferences mutation
  const { mutate: updatePreferences, isPending: isSaving } = useMutation({
    mutationFn: async (newFavorites: OscillatorId[]) => {
      console.log('💾 Saving oscillator preferences:', newFavorites);
      const response = await authenticatedApiRequest('PUT', '/api/crypto/oscillator-preferences', {
        favoriteOscillators: newFavorites,
      });
      const data = await response.json();
      console.log('✅ Oscillator preferences saved:', data);
      return data;
    },
    onMutate: async (newFavorites) => {
      // Optimistically update local state
      await queryClient.cancelQueries({ queryKey: ['oscillator-preferences'] });
      const previous = queryClient.getQueryData<OscillatorPreferences>(['oscillator-preferences']);
      
      queryClient.setQueryData<OscillatorPreferences>(['oscillator-preferences'], {
        favoriteOscillators: newFavorites,
      });
      
      return { previous };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['oscillator-preferences'], context.previous);
      }
      console.error('❌ Failed to save oscillator preferences:', error);
    },
    onSuccess: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['oscillator-preferences'] });
    },
  });

  const favoriteOscillators = preferences?.favoriteOscillators || [];

  // Toggle favorite status of an oscillator
  const toggleFavorite = (oscillatorId: OscillatorId) => {
    const newFavorites = favoriteOscillators.includes(oscillatorId)
      ? favoriteOscillators.filter(id => id !== oscillatorId)
      : [...favoriteOscillators, oscillatorId];
    
    updatePreferences(newFavorites);
  };

  // Check if an oscillator is favorited
  const isFavorite = (oscillatorId: OscillatorId) => {
    return favoriteOscillators.includes(oscillatorId);
  };

  return {
    favoriteOscillators,
    isLoading,
    isSaving,
    toggleFavorite,
    isFavorite,
    updatePreferences,
  };
}
