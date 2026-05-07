import type { MessageRecord } from '../storage/db';

interface ChatBubbleProps {
  message: MessageRecord;
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const isSent = message.direction === 'sent';
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm
          ${isSent
            ? 'bg-cyan-700 text-white rounded-br-sm'
            : 'bg-slate-700 text-slate-100 rounded-bl-sm'
          }`}
      >
        <p className="break-words">{message.plaintextPreview ?? '🔒 Encrypted'}</p>
        <div className={`flex items-center gap-1 mt-1 text-xs opacity-60 ${isSent ? 'justify-end' : 'justify-start'}`}>
          <span>{time}</span>
          {isSent && (
            <span>{message.status === 'delivered' ? '✓✓' : message.status === 'sent' ? '✓' : '○'}</span>
          )}
        </div>
      </div>
    </div>
  );
}
