/**
 * Reusable badge component for displaying market bias
 * Shows icon and optional text label with appropriate colors
 */

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Bias } from '@/utils/structureDetection';

interface BiasBadgeProps {
  bias: Bias;
  showText?: boolean;
  className?: string;
}

/**
 * Badge component that displays market bias with icon and optional text
 * @param bias - Market bias: 'bullish', 'bearish', or 'neutral'
 * @param showText - Whether to show text label (default: true)
 * @param className - Additional CSS classes
 */
export function BiasBadge({ bias, showText = true, className = '' }: BiasBadgeProps) {
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
      {showText && <span className="hidden sm:inline">{getText()}</span>}
    </div>
  );
}
