interface ChartLoadingOverlayProps {
  isLoading: boolean;
  error: string | null;
}

export function ChartLoadingOverlay({ isLoading, error }: ChartLoadingOverlayProps) {
  if (!isLoading && !error) return null;

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 z-10">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <div className="mt-2 text-slate-400">Loading chart...</div>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 z-10">
          <div className="text-center text-red-400">
            <div className="text-lg font-semibold">Error</div>
            <div className="mt-2">{error}</div>
          </div>
        </div>
      )}
    </>
  );
}
