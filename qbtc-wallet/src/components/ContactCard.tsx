import { Lock, AlertTriangle } from 'lucide-react';
import type { ContactRecord } from '../storage/db';
import type { MessageRecord } from '../storage/db';

interface ContactCardProps {
  contact: ContactRecord;
  lastMessage?: MessageRecord;
  onClick: () => void;
}

export default function ContactCard({ contact, lastMessage, onClick }: ContactCardProps) {
  const initials = contact.name.slice(0, 2).toUpperCase();
  const hasKey = Boolean(contact.pubKeyHex);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-800/60 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
        <span className="text-sm font-semibold text-cyan-400">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-slate-100 text-sm truncate">{contact.name}</p>
          {hasKey ? (
            <Lock size={11} className="text-emerald-400 shrink-0" aria-label="Messaging ready" />
          ) : (
            <AlertTriangle size={11} className="text-amber-400 shrink-0" aria-label="Messaging key missing" />
          )}
        </div>
        {lastMessage ? (
          <p className="text-xs text-slate-400 truncate">
            {lastMessage.direction === 'sent' ? 'You: ' : ''}
            {lastMessage.plaintextPreview ?? '🔒'}
          </p>
        ) : (
          <p className="text-xs text-slate-500 font-mono truncate">{contact.address}</p>
        )}
      </div>
      {lastMessage && (
        <span className="text-xs text-slate-500 shrink-0">
          {new Date(lastMessage.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </span>
      )}
    </button>
  );
}
