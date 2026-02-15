import { useQuery, useMutation } from '@tanstack/react-query';
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

export function useDrawingsPersistence(symbol: string, interval: string) {
  const { toast } = useToast();

  // Load drawings
  const { data: drawings = [], isLoading, refetch: refetchDrawings } = useQuery<Drawing[]>({
    queryKey: ['/api/crypto/chart-drawings', symbol, interval],
    queryFn: async () => {
      const response = await authenticatedApiRequest('GET', `/api/crypto/chart-drawings?symbol=${symbol}&timeframe=${interval}`) as unknown;
      return response as Drawing[];
    },
  });

  // Save drawing
  const saveDrawingMutation = useMutation({
    mutationFn: async (drawing: Drawing) => {
      console.log('[Persistence] Saving drawing:', { 
        symbol, 
        timeframe: interval, 
        type: drawing.type,
        pointCount: drawing.points?.length 
      });
      
      const requestBody = {
        symbol,
        timeframe: interval,  // Map interval → timeframe for API
        drawingType: drawing.type,
        coordinates: { points: drawing.points },
        style: drawing.style || { color: '#3b82f6', lineWidth: 2 },
      };
      
      console.log('[Persistence] Request body:', requestBody);
      
      const response = await authenticatedApiRequest('POST', '/api/crypto/chart-drawings', requestBody);
      
      console.log('[Persistence] API response:', response);
      return response;
    },
    onSuccess: (data: any) => {
      console.log('[Persistence] Save successful, drawing ID:', data?.id);
      toast({ 
        title: 'Drawing saved',
        description: 'Your drawing has been saved successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/chart-drawings', symbol, interval] });
    },
    onError: (error: any) => {
      console.error('[Persistence] Save failed:', error);
      toast({ 
        title: 'Failed to save drawing', 
        description: error?.message || 'An error occurred while saving the drawing.',
        variant: 'destructive',
      });
    },
  });

  // Update drawing
  const updateDrawingMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Drawing> }) => {
      return await authenticatedApiRequest('PATCH', `/api/crypto/chart-drawings/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/chart-drawings', symbol, interval] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update drawing',
        description: error?.message || 'An error occurred while updating the drawing.',
        variant: 'destructive',
      });
    },
  });

  // Delete drawing
  const deleteDrawingMutation = useMutation({
    mutationFn: async (id: string) => {
      return await authenticatedApiRequest('DELETE', `/api/crypto/chart-drawings/${id}`);
    },
    onSuccess: () => {
      toast({ 
        title: 'Drawing deleted',
        description: 'The drawing has been removed.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/chart-drawings', symbol, interval] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to delete drawing',
        description: error?.message || 'An error occurred while deleting the drawing.',
        variant: 'destructive',
      });
    },
  });

  // Clear all drawings
  const clearDrawingsMutation = useMutation({
    mutationFn: async () => {
      return await authenticatedApiRequest('DELETE', `/api/crypto/chart-drawings/clear?symbol=${symbol}&timeframe=${interval}`);
    },
    onSuccess: () => {
      toast({ 
        title: 'All drawings cleared',
        description: 'All drawings for this symbol and interval have been removed.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/chart-drawings', symbol, interval] });
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
    drawings,
    isLoading,
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
