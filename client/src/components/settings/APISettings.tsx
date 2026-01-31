import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';

interface APISettingsProps {
  apiKeys: {
    binance?: string;
    coinbase?: string;
    xai?: string;
  };
  onUpdateApiKey: (provider: string, key: string) => void;
}

export function APISettings({ apiKeys, onUpdateApiKey }: APISettingsProps) {
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        Configure API keys for external services. Keys are stored locally and never sent to our servers.
      </p>

      {/* Binance API Key */}
      <div className="p-3 bg-[#0e0e0e] rounded border border-gray-800">
        <Label className="text-white mb-2 block">Binance API Key</Label>
        <div className="flex gap-2">
          <Input 
            type={editMode.binance ? 'text' : 'password'}
            value={apiKeys.binance || ''}
            onChange={(e) => onUpdateApiKey('binance', e.target.value)}
            placeholder="Enter Binance API key..."
            className="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setEditMode(prev => ({ ...prev, binance: !prev.binance }))}
          >
            {editMode.binance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Coinbase API Key */}
      <div className="p-3 bg-[#0e0e0e] rounded border border-gray-800">
        <Label className="text-white mb-2 block">Coinbase API Key</Label>
        <div className="flex gap-2">
          <Input 
            type={editMode.coinbase ? 'text' : 'password'}
            value={apiKeys.coinbase || ''}
            onChange={(e) => onUpdateApiKey('coinbase', e.target.value)}
            placeholder="Enter Coinbase API key..."
            className="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setEditMode(prev => ({ ...prev, coinbase: !prev.coinbase }))}
          >
            {editMode.coinbase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* XAI API Key */}
      <div className="p-3 bg-[#0e0e0e] rounded border border-gray-800">
        <Label className="text-white mb-2 block">XAI (Grok) API Key</Label>
        <div className="flex gap-2">
          <Input 
            type={editMode.xai ? 'text' : 'password'}
            value={apiKeys.xai || ''}
            onChange={(e) => onUpdateApiKey('xai', e.target.value)}
            placeholder="Enter XAI API key..."
            className="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setEditMode(prev => ({ ...prev, xai: !prev.xai }))}
          >
            {editMode.xai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
