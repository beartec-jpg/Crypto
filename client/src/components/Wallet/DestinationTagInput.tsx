// client/src/components/Wallet/DestinationTagInput.tsx
// Destination tag input component for XRP transactions

interface DestinationTagInputProps {
  value: string;
  onChange: (value: string) => void;
}

export default function DestinationTagInput({ value, onChange }: DestinationTagInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Destination Tag (optional)
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g., 12345678"
        className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:outline-none"
        min="0"
        max="4294967295"
      />
      <p className="mt-1 text-xs text-gray-500">
        Required for most exchanges. Check with recipient if unsure.
      </p>
    </div>
  );
}
