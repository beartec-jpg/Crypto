/**
 * Reusable badge component for displaying market bias
 * Shows icon and optional text label with appropriate colors
 */

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Bias } from '@/types/candle';

interface BiasBadgeProps {
  bias: Bias;
  className?: string;
}

/**
 * Badge component that displays market bias with icon and text
 * Text visibility is controlled via responsive CSS classes (hidden on small screens)
 * @param bias - Market bias: 'bullish', 'bearish', or 'neutral'
 * @param className - Additional CSS classes
 */
export function BiasBadge({ bias, className = '' }: BiasBadgeProps) {
  const getIcon = () => {
    switch (bias) {
      case 'bullish':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'bearish':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'neutral':
        return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getText = () => {
    switch (bias) {
      case 'bullish':
        return <span className="text-green-500 font-medium">BULL</span>;
      case 'bearish':
        return <span className="text-red-500 font-medium">BEAR</span>;
      case 'neutral':
        return <span className="text-yellow-500 font-medium">NEUT</span>;
    }
  };

  return (
    <div className={`flex items-center justify-center gap-1 sm:gap-2 ${className}`}>
      {getIcon()}
      <span className="hidden sm:inline">{getText()}</span>
    </div>
  );
}
