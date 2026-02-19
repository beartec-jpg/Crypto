import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface SmcModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SmcModal({ isOpen, onClose }: SmcModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">SMC Controls</DialogTitle>
        </DialogHeader>
        <div className="py-4 text-center text-slate-400">
          <p>Smart Money Concepts controls coming soon...</p>
          <p className="text-sm mt-2">Order Blocks, Fair Value Gaps, Liquidity Sweeps</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
