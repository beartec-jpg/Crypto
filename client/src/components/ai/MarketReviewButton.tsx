import { Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MarketReviewButtonProps {
  onClick: () => void;
  isLoading: boolean;
}

export function MarketReviewButton({ onClick, isLoading }: MarketReviewButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={isLoading}
      className="border-gray-700 hover:bg-gray-800"
    >
      <Brain className="w-4 h-4 mr-2" />
      AI Review
    </Button>
  );
}
