// app/wallet/page.tsx
export default function WalletPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-4xl font-bold mb-6">BearTec Sovereign Wallet</h1>
      <p className="text-lg mb-8">
        Quantum-secure, multi-chain, non-custodial wallet — coming soon.
      </p>
      <div className="bg-gray-800 p-6 rounded-lg">
        <p>Wallet dashboard placeholder</p>
        {/* Later: auth status, balance, send/receive buttons, etc. */}
      </div>
    </div>
  );
}
