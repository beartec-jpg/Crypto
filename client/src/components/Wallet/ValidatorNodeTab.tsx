import { useState } from 'react';
import { Server, Copy, CheckCircle, Terminal, Zap, Shield, Coins, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface ValidatorNodeTabProps {
  rewardAddress: string;
}

export default function ValidatorNodeTab({ rewardAddress }: ValidatorNodeTabProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [bondAmount] = useState(1000);

  const hasAddress = rewardAddress && rewardAddress.startsWith('r');

  const installCommand = hasAddress
    ? `bash <(curl -sSL https://raw.githubusercontent.com/beartec-jpg/Crypto/main/qxrp-node-setup/testnet-install.sh) --reward-address ${rewardAddress}`
    : `bash <(curl -sSL https://raw.githubusercontent.com/beartec-jpg/Crypto/main/qxrp-node-setup/testnet-install.sh) --reward-address YOUR_QXRP_ADDRESS`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      toast({ title: 'Copied!', description: 'Install command copied to clipboard.' });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy the text manually.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-cyan-900/40 rounded-lg">
          <Server className="w-6 h-6 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Run a qXRP Validator Node</h2>
          <p className="text-sm text-gray-400">Earn qXRP rewards by validating transactions</p>
        </div>
      </div>

      {/* Reward address banner */}
      <div className={`rounded-lg p-4 border ${hasAddress ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-yellow-900/20 border-yellow-700/40'}`}>
        <div className="flex items-start gap-3">
          {hasAddress
            ? <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            : <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          }
          <div className="min-w-0">
            <p className={`text-sm font-medium ${hasAddress ? 'text-emerald-300' : 'text-yellow-300'}`}>
              {hasAddress ? 'Reward address detected from your wallet' : 'No qXRP address found in wallet'}
            </p>
            {hasAddress ? (
              <p className="text-xs font-mono text-gray-300 mt-1 break-all">{rewardAddress}</p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">
                Your wallet needs a qXRP address. Make sure your wallet is unlocked and qXRP is added as a token.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-gray-800/60 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium text-gray-300">1. Open a server</span>
          </div>
          <p className="text-xs text-gray-500">Any Ubuntu VPS with 4GB+ RAM. Hetzner CX23 works great (~€4/mo).</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-xs font-medium text-gray-300">2. Paste one command</span>
          </div>
          <p className="text-xs text-gray-500">Log in as root and paste the command below. Everything installs automatically.</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-gray-300">3. Earn rewards</span>
          </div>
          <p className="text-xs text-gray-500">Rewards sweep to your wallet hourly. No action needed after setup.</p>
        </div>
      </div>

      {/* Requirements */}
      <div className="bg-gray-800/40 rounded-lg p-4 space-y-2">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Requirements</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
          <div className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-emerald-400" /> Ubuntu 22.04 / 24.04</div>
          <div className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-emerald-400" /> 4 GB RAM minimum</div>
          <div className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-emerald-400" /> 40 GB disk</div>
          <div className="flex items-center gap-2"><Shield className="w-3 h-3 text-cyan-400" /> {bondAmount.toLocaleString()} qXRP bond (funded automatically on testnet)</div>
        </div>
      </div>

      {/* Install command */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-300">Install command — paste this in your server terminal:</p>
        <div className="relative">
          <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 pr-16 text-xs text-emerald-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
            {installCommand}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-3 right-3 p-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
            title="Copy command"
          >
            {copied
              ? <CheckCircle className="w-4 h-4 text-emerald-400" />
              : <Copy className="w-4 h-4 text-gray-300" />
            }
          </button>
        </div>
        <p className="text-xs text-gray-500">
          The script installs the node, waits for sync, funds your validator from genesis, and bonds it automatically.
          Rewards are sent to <span className="text-gray-300 font-mono">{hasAddress ? rewardAddress : 'your wallet'}</span>.
        </p>
      </div>

      {/* What the script does */}
      <div className="bg-gray-800/40 rounded-lg p-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">What happens automatically</p>
        <ol className="space-y-1.5 text-xs text-gray-400 list-none">
          {[
            'Copies qXRP binary from testnet source server',
            'Creates system user, directories, and config',
            'Installs and starts systemd service',
            'Waits for the node to sync with the testnet',
            'Generates a fresh validator keypair for this server',
            'Funds validator account + your reward wallet from genesis (testnet)',
            'Bonds ' + bondAmount.toLocaleString() + ' qXRP to activate the validator',
            'Installs hourly auto-sweep → ' + (hasAddress ? rewardAddress : 'your wallet'),
            'Installs the `qxrp` CLI (status, balance, logs, sweep)',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-cyan-600 font-mono flex-shrink-0">{String(i + 1).padStart(2, '0')}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* After install CLI reference */}
      <div className="bg-gray-900/60 border border-gray-700/50 rounded-lg p-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">After install — useful commands</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
          {[
            ['qxrp status', 'Node state, ledger, peers'],
            ['qxrp balance', 'Validator + reward wallet balances'],
            ['qxrp logs', 'Live log stream'],
            ['qxrp sweep', 'Sweep rewards to wallet now'],
            ['qxrp bond', 'Bond validator (if not already bonded)'],
            ['qxrp info', 'Show validator config'],
          ].map(([cmd, desc]) => (
            <div key={cmd} className="flex items-baseline gap-2">
              <span className="text-emerald-400 flex-shrink-0">{cmd}</span>
              <span className="text-gray-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
