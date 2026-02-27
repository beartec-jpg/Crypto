import { Button } from '@/components/ui/button';

interface WaveStatusPanelsProps {
  isComplete: boolean;
  isValid: boolean;
  isDrawing: boolean;
  validationErrors: string[];
  onReset: () => void;
  onCancel: () => void;
  onDeleteInvalid: () => void;
}

export function WaveStatusPanels({
  isComplete,
  isValid,
  isDrawing,
  validationErrors,
  onReset,
  onCancel,
  onDeleteInvalid,
}: WaveStatusPanelsProps) {
  return (
    <>
      {isComplete && (
        <div className={`absolute top-14 right-4 z-30 bg-slate-900 border rounded-lg p-3 shadow-xl select-none ${isValid ? 'border-emerald-700' : 'border-red-700'}`}>
          {isValid ? (
            <p className="text-emerald-400 text-sm font-semibold mb-2">
              ✓ Wave Complete – Saving…
            </p>
          ) : (
            <>
              <p className="text-red-400 text-sm font-semibold mb-1">
                ⚠ Invalid Wave Structure
              </p>
              <ul className="mb-2 space-y-0.5">
                {validationErrors.map((errorMessage, index) => (
                  <li key={index} className="text-red-300 text-xs">{errorMessage}</li>
                ))}
              </ul>
            </>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onReset}>
              Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            {!isValid && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-300 hover:bg-red-950"
                onClick={onDeleteInvalid}
              >
                Delete Drawing
              </Button>
            )}
          </div>
        </div>
      )}

      {isDrawing && validationErrors.length > 0 && (
        <div className="absolute top-14 right-4 z-30 bg-slate-900 border border-amber-700 rounded-lg p-3 shadow-xl select-none max-w-xs">
          <p className="text-amber-400 text-xs font-semibold mb-1">⚠ Validation Warnings</p>
          <ul className="space-y-0.5">
            {validationErrors.map((errorMessage, index) => (
              <li key={index} className="text-amber-300 text-xs">{errorMessage}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
