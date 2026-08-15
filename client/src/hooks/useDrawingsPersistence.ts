import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { DEFAULT_DRAWING_COLOR } from '@/constants/drawingColors';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Drawing {
  id?: string;
  symbol: string;
  interval: string;
  tool: string;
  points: any[];
  style?: any;
  [key: string]: any;
}

const DEFAULT_DRAWING_STYLE = { color: DEFAULT_DRAWING_COLOR, lineWidth: 2 };

export function useDrawingsPersistence(symbol: string, interval: string) {
  const { toast } = useToast();
  const { userId, isLoaded } = useAuth();
  // Scope every key by user so accounts never share cached drawings
  const scope = userId ?? 'signed-out';
  const drawingsKey = ['/api/crypto/chart-drawings', scope, symbol, interval] as const;

  const { data: drawings = [], isLoading, refetch: refetchDrawings } = useQuery<Drawing[]>({
    queryKey: drawingsKey,
    queryFn: async () => {
      const response = await authenticatedApiRequest(
        'GET',
        `/api/crypto/chart-drawings?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(interval)}`,
      );
      return response.json();
    },
    enabled: Boolean(isLoaded && userId && symbol && interval),
  });

  const saveDrawingMutation = useMutation({
    mutationFn: async (drawing: Drawing) => {
      const requestBody = {
        symbol,
        timeframe: interval,
        drawingType: drawing.type,
        coordinates: { points: drawing.points },
        style: drawing.style || DEFAULT_DRAWING_STYLE,
      };
      const response = await authenticatedApiRequest('POST', '/api/crypto/chart-drawings', requestBody);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Drawing saved',
        description: 'Your drawing has been saved successfully.',
      });
      queryClient.invalidateQueries({ queryKey: drawingsKey });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save drawing',
        description: error?.message || 'An error occurred while saving the drawing.',
        variant: 'destructive',
      });
    },
  });

  const updateDrawingMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Drawing> }) => {
      return await authenticatedApiRequest('PATCH', `/api/crypto/chart-drawings/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: drawingsKey });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update drawing',
        description: error?.message || 'An error occurred while updating the drawing.',
        variant: 'destructive',
      });
    },
  });

  const deleteDrawingMutation = useMutation({
    mutationFn: async (id: string) => {
      return await authenticatedApiRequest('DELETE', `/api/crypto/chart-drawings/${id}`);
    },
    onSuccess: () => {
      toast({
        title: 'Drawing deleted',
        description: 'The drawing has been removed.',
      });
      queryClient.invalidateQueries({ queryKey: drawingsKey });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to delete drawing',
        description: error?.message || 'An error occurred while deleting the drawing.',
        variant: 'destructive',
      });
    },
  });

  const clearDrawingsMutation = useMutation({
    mutationFn: async () => {
      return await authenticatedApiRequest(
        'DELETE',
        `/api/crypto/chart-drawings?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(interval)}`,
      );
    },
    onSuccess: () => {
      toast({
        title: 'All drawings cleared',
        description: 'All drawings for this symbol and interval have been removed.',
      });
      queryClient.invalidateQueries({ queryKey: drawingsKey });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to clear drawings',
        description: error?.message || 'An error occurred while clearing drawings.',
        variant: 'destructive',
      });
    },
  });

  return {
    drawings: userId ? drawings : [],
    isLoading: !isLoaded || (Boolean(userId) && isLoading),
    refetchDrawings,
    saveDrawing: saveDrawingMutation.mutate,
    updateDrawing: updateDrawingMutation.mutate,
    deleteDrawing: deleteDrawingMutation.mutate,
    clearDrawings: clearDrawingsMutation.mutate,
    isSaving: saveDrawingMutation.isPending,
    isDeleting: deleteDrawingMutation.isPending,
    isUpdating: updateDrawingMutation.isPending,
    isClearing: clearDrawingsMutation.isPending,
  };
}
