// client/src/components/Wallet/MemoInput.tsx
// Memo input component for BSC transactions

interface MemoInputProps {
  value: string;
  onChange: (value: string) => void;
}

export default function MemoInput({ value, onChange }: MemoInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Memo (optional)
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Memo for exchange deposits"
        className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:outline-none"
        maxLength={256}
      />
      <p className="mt-1 text-xs text-gray-500">
        Some exchanges require a memo. Check with recipient.
      </p>
    </div>
  );
}
