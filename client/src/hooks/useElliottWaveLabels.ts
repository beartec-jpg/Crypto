import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { queryClient } from '@/lib/queryClient';
import { authenticatedApiRequest } from '@/lib/apiAuth';

interface UseElliottWaveLabelsParams {
  symbol: string;
  timeframe: string;
  toast: (args: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void;
}

export function useElliottWaveLabels({ symbol, timeframe, toast }: UseElliottWaveLabelsParams) {
  const { userId, isLoaded } = useAuth();
  const scope = userId ?? 'signed-out';
  const labelsKey = ['/api/crypto/elliott-wave/labels', scope, symbol, timeframe] as const;

  const { data: ewLabels = [] } = useQuery<any[]>({
    queryKey: labelsKey,
    queryFn: async () => {
      const response = await authenticatedApiRequest(
        'GET',
        `/api/crypto/elliott-wave/labels?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
      );
      return response.json();
    },
    enabled: Boolean(isLoaded && userId && symbol && timeframe),
  });

  const saveEWLabelMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await authenticatedApiRequest('POST', '/api/crypto/elliott-wave/labels', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Wave saved', description: 'Elliott Wave saved successfully.' });
      queryClient.invalidateQueries({ queryKey: labelsKey });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to save wave', description: error?.message, variant: 'destructive' });
    },
  });

  const deleteEWLabelMutation = useMutation({
    mutationFn: async (id: string) => {
      await authenticatedApiRequest('DELETE', `/api/crypto/elliott-wave/labels/${id}`);
    },
    onSuccess: () => {
      toast({ title: 'Wave deleted successfully' });
      queryClient.invalidateQueries({ queryKey: labelsKey });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to delete wave', description: error?.message, variant: 'destructive' });
    },
  });

  return {
    ewLabels: userId ? ewLabels : [],
    saveEWLabelMutation,
    deleteEWLabelMutation,
  };
}
