import { Button } from '@/components/ui/button';
import { Settings, Bell, MessageSquare } from 'lucide-react';

/**
 * Props for the ActionButtonsToolbar component
 */
export interface ActionButtonsToolbarProps {
  /** Callback to open settings dialog */
  onOpenSettings: () => void;
  /** Callback to open alert settings */
  onOpenAlertSettings: () => void;
  /** Optional feedback URL */
  feedbackUrl?: string;
}

/**
 * ActionButtonsToolbar Component
 * 
 * Provides quick access buttons for:
 * - Settings dialog
 * - Alert settings
 * - Feedback page
 */
export function ActionButtonsToolbar({
  onOpenSettings,
  onOpenAlertSettings,
  feedbackUrl = '/crypto/feedback',
}: ActionButtonsToolbarProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2 md:gap-4">
        <Button
          onClick={onOpenSettings}
          className="bg-slate-700 hover:bg-slate-600 text-white px-3 md:px-4"
          data-testid="button-open-settings"
          title="Settings (Ctrl+,)"
        >
          <Settings className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">Settings</span>
        </Button>
        <Button
          onClick={onOpenAlertSettings}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 md:px-4"
          data-testid="button-open-alert-settings"
        >
          <Bell className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">Alert Settings</span>
        </Button>
        <a href={feedbackUrl}>
          <Button
            variant="outline"
            className="border-[#00c4b4] text-[#00c4b4] hover:bg-[#00c4b4]/10 px-3 md:px-4"
            data-testid="link-feedback"
          >
            <MessageSquare className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Feedback</span>
          </Button>
        </a>
      </div>
    </div>
  );
}
