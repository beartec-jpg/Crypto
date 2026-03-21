import { PenSquare, Settings, Trash2, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DrawingQuickMenuProps {
  x: number;
  y: number;
  onMove?: () => void;
  onSettings: () => void;
  onAlert?: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Quick menu that appears when clicking on a drawing
 * Provides options to Move, Settings, or Delete the drawing
 */
export function DrawingQuickMenu({
  x,
  y,
  onMove,
  onSettings,
  onAlert,
  onDelete,
  onClose,
}: DrawingQuickMenuProps) {
  return (
    <>
      {/* Backdrop to close menu when clicking outside */}
      <div 
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      
      {/* Quick menu popup */}
      <div
        className="fixed z-50 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg shadow-xl"
        style={{
          left: `${x}px`,
          top: `${y}px`,
          transform: 'translate(-50%, -100%)',
          marginTop: '-8px',
        }}
      >
        <div className="flex flex-col p-1 gap-1">
          {onMove && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onMove();
                onClose();
              }}
              className="justify-start text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <PenSquare className="h-4 w-4 mr-2" />
              Edit / Move
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onSettings();
              onClose();
            }}
            className="justify-start text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          
          {onAlert && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onAlert();
                onClose();
              }}
              className="justify-start text-blue-400 hover:text-blue-300 hover:bg-blue-950/30"
            >
              <Bell className="h-4 w-4 mr-2" />
              Alerts
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="justify-start text-red-400 hover:text-red-300 hover:bg-red-950/30"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>
    </>
  );
}
