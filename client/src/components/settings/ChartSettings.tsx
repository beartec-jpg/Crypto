import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ChartSettingsProps {
  theme?: 'dark' | 'light';
  onThemeChange?: (theme: 'dark' | 'light') => void;
}

export function ChartSettings({ theme = 'dark', onThemeChange }: ChartSettingsProps) {
  return (
    <div className="space-y-4">
      <div className="p-3 bg-[#0e0e0e] rounded border border-gray-800">
        <Label className="text-white mb-2 block">Chart Theme</Label>
        <Select value={theme} onValueChange={(value: 'dark' | 'light') => onThemeChange?.(value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select theme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="light">Light</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="p-3 bg-[#0e0e0e] rounded border border-gray-800">
        <Label className="text-white mb-2 block">Chart Layout</Label>
        <p className="text-sm text-gray-400">
          Chart appearance settings will be added here.
        </p>
      </div>
    </div>
  );
}
