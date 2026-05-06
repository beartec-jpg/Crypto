import { useState } from 'react';

/** Tolerance for treating an edited value as equal to the default level */
const LEVEL_EPSILON = 0.000001;

/**
 * Shared hook for editable fib level percentages.
 *
 * Levels are stored internally as decimal fractions (e.g. 1.618) but
 * displayed and edited as percentages (e.g. "161.8").  When the user
 * commits an edit (blur / Enter), the new value is written to
 * `style.customValues[originalLevel]`.  If the edited value matches the
 * default, the override is removed so the default is used instead.
 */
export function useFibLevelValues(
  customValues: Record<number, number>,
  onCommit: (newCustomValues: Record<number, number>) => void
) {
  // Draft percentage strings while the user is actively typing
  const [draftValues, setDraftValues] = useState<Record<number, string>>({});

  /** Returns the percentage string to display for a given level */
  const getLevelDisplayPct = (level: number): string => {
    if (draftValues[level] !== undefined) return draftValues[level];
    const actual = customValues[level] !== undefined ? customValues[level] : level;
    return (actual * 100).toFixed(1);
  };

  /** Called on every keystroke to update the draft */
  const onDraftChange = (level: number, value: string) => {
    setDraftValues(prev => ({ ...prev, [level]: value }));
  };

  /** Commits the draft value and clears it; call on blur or Enter */
  const commitLevelValue = (level: number) => {
    const draft = draftValues[level];
    if (draft === undefined) return;

    const parsed = parseFloat(draft);
    const newCustomValues = { ...customValues };

    if (!isNaN(parsed)) {
      const newDecimal = parsed / 100;
      if (Math.abs(newDecimal - level) < LEVEL_EPSILON) {
        // Matches default – remove override
        delete newCustomValues[level];
      } else {
        newCustomValues[level] = newDecimal;
      }
    }
    // On invalid input, leave existing customValue unchanged

    setDraftValues(prev => {
      const next = { ...prev };
      delete next[level];
      return next;
    });

    onCommit(newCustomValues);
  };

  return { getLevelDisplayPct, onDraftChange, commitLevelValue };
}
