/**
 * DegreePicker
 *
 * Dropdown selector for Elliott Wave degrees.
 *
 * Only the 8 user-selectable degrees are shown:
 *   Grand Supercycle → Supercycle → Cycle → Primary →
 *   Intermediate → Minor → Minute → Minuette
 *
 * Subminuette is intentionally excluded from this list because it
 * only appears automatically as the lower-degree correction when
 * Minuette is selected – it is never picked directly by the user.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface DegreeOption {
  name: string;
  color: string;
}

// User-selectable degrees ordered from largest to smallest.
// Subminuette is NOT included here – it is only used internally
// for lower-degree calculations when Minuette is active.
export const USER_SELECTABLE_DEGREES: DegreeOption[] = [
  { name: 'Grand Supercycle', color: '#FF0000' },
  { name: 'Supercycle',       color: '#FF6B00' },
  { name: 'Cycle',            color: '#FFD700' },
  { name: 'Primary',          color: '#00FF00' },
  { name: 'Intermediate',     color: '#00BFFF' },
  { name: 'Minor',            color: '#0000FF' },
  { name: 'Minute',           color: '#8B00FF' },
  { name: 'Minuette',         color: '#FF1493' }, // Smallest user-selectable degree
];

interface DegreePickerProps {
  value: string;
  onChange: (degree: string) => void;
  className?: string;
}

export function DegreePicker({ value, onChange, className = '' }: DegreePickerProps) {
  const selected = USER_SELECTABLE_DEGREES.find(d => d.name === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`h-7 text-xs bg-slate-800 border-slate-600 text-slate-200 ${className}`}>
        <SelectValue>
          <span className="flex items-center gap-1.5">
            {selected && (
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: selected.color }}
              />
            )}
            {value || 'Select degree'}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-slate-900 border-slate-700">
        {USER_SELECTABLE_DEGREES.map(degree => (
          <SelectItem
            key={degree.name}
            value={degree.name}
            className="text-xs text-slate-200 focus:bg-slate-700 focus:text-white"
          >
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: degree.color }}
              />
              {degree.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
