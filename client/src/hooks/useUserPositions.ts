import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedApiRequest, ApiError } from '@/lib/apiAuth';
import type { UserPositionEntry } from '@shared/schema';

/**
 * Hook for managing user tracked positions.
 * Persists positions to the backend via /api/users/positions.
 */
export function useUserPositions() {
  const queryClient = useQueryClient();

  // Load positions from API
  const { data, isLoading } = useQuery({
    queryKey: ['user-positions'],
    queryFn: async (): Promise<UserPositionEntry[]> => {
      try {
        const response = await authenticatedApiRequest('GET', '/api/users/positions');
        const data = await response.json();
        return data.positions || [];
      } catch (error) {
        // If 404, no positions saved yet
        if (error instanceof ApiError && error.status === 404) {
          return [];
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Save all positions
  const { mutate: savePositions, isPending: isSaving } = useMutation({
    mutationFn: async (positions: UserPositionEntry[]) => {
      const response = await authenticatedApiRequest('PUT', '/api/users/positions', { positions });
      const result = await response.json();
      return result.positions as UserPositionEntry[];
    },
    onMutate: async (positions) => {
      await queryClient.cancelQueries({ queryKey: ['user-positions'] });
      const previous = queryClient.getQueryData<UserPositionEntry[]>(['user-positions']);
      queryClient.setQueryData<UserPositionEntry[]>(['user-positions'], positions);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['user-positions'], context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-positions'] });
    },
  });

  const positions = data || [];

  // Helper to add a position
  const addPosition = (position: UserPositionEntry) => {
    savePositions([...positions, position]);
  };

  // Helper to remove a position by id
  const removePosition = (id: string) => {
    savePositions(positions.filter((p) => p.id !== id));
  };

  // Helper to update a position
  const updatePosition = (id: string, updates: Partial<UserPositionEntry>) => {
    savePositions(positions.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  return {
    positions,
    isLoading,
    isSaving,
    savePositions,
    addPosition,
    removePosition,
    updatePosition,
  };
}
