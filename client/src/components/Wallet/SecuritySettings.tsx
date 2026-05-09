// SecuritySettings.tsx — passkey-only security panel
// Tier system removed. Wallet is secured by passkey PRF (Google/Apple account).
// Keeps: security scan, HTLC deploy tools (admin), Shamir recovery, emergency reset.

import { useState, useEffect } from 'react';
import { Shield, Fingerprint, AlertTriangle, Search, Rocket, ExternalLink, Check, CheckCircle, ArrowRight } from 'lucide-react';
import { ethers } from 'ethers';
import {
  unlockWallet,
  unlockWalletWithPasskey,
  getWalletType,
  getWalletCredentialId,
  migrateToPasskey,
  type Wallet,
} from '@/lib/walletService';
import {
  registerPasskeyWithPRF,
  authenticateWithPasskeyPRF,
  b64uEncodePasskey,
} from '@/lib/passkeyService';
import { runSecurityScan, type SecurityScanResult } from '@/lib/securityScanner';
import SecurityWarningModal from './SecurityWarningModal';
import ShamirRecoveryPanel from './ShamirRecoveryPanel';

interface SecuritySettingsProps {
  userId: string;
  walletId?: string;
  walletEvmAddress?: string;
  masterSeed?: Uint8Array | null;
}

const HTLC_ETH_BYTECODE = '0x6080604052348015600e575f5ffd5b50610bcf8061001c5f395ff3fe608060405260043610610049575f3560e01c8063335ef5bd1461004d57806363615149146100735780637249fbb6146100a2578063ad0aa0e4146100c1578063e16c7d98146100f7575b5f5ffd5b61006061005b366004610af8565b6101b1565b6040519081526020015b60405180910390f35b34801561007e575f5ffd5b5061009261008d366004610b35565b610550565b604051901515815260200161006a565b3480156100ad575f5ffd5b506100926100bc366004610b55565b61088f565b3480156100cc575f5ffd5b506100926100db366004610b55565b5f908152602081905260409020546001600160a01b0316151590565b348015610102575f5ffd5b50610167610111366004610b55565b5f9081526020819052604090208054600182015460028301546003840154600485015460058601546006909601546001600160a01b0395861697959094169592949193909260ff80821693610100909204169190565b604080516001600160a01b03998a1681529890971660208901529587019490945260608601929092526080850152151560a0840152151560c083015260e08201526101000161006a565b5f5f34116102065760405162461bcd60e51b815260206004820152601860248201527f48544c433a20616d6f756e74206d757374206265203e2030000000000000000060448201526064015b60405180910390fd5b4282116102555760405162461bcd60e51b815260206004820152601d60248201527f48544c433a2074696d656c6f636b206d7573742062652066757475726500000060448201526064016101fd565b6001600160a01b0384166102ab5760405162461bcd60e51b815260206004820152601e60248201527f48544c433a207265636569766572206973207a65726f2061646472657373000060448201526064016101fd565b336001600160a01b038516036103035760405162461bcd60e51b815260206004820152601860248201527f48544c433a207265636569766572203d3d2073656e646572000000000000000060448201526064016101fd565b6040516bffffffffffffffffffffffff1933606090811b8216602084015286901b166034820152346048820152606881018490526088810183905260a801604051602081830303815290604052805190602001209050610379815f908152602081905260409020546001600160a01b0316151590565b156103c65760405162461bcd60e51b815260206004820152601860248201527f48544c433a206475706c696361746520636f6e7472616374000000000000000060448201526064016101fd565b604051806101000160405280336001600160a01b03168152602001856001600160a01b031681526020013481526020018481526020018381526020015f151581526020015f151581526020015f5f1b8152505f5f8381526020019081526020015f205f820151815f015f6101000a8154816001600160a01b0302191690836001600160a01b031602179055506020820151816001015f6101000a8154816001600160a01b0302191690836001600160a01b0316021790555060408201518160020155606082015181600301556080820151816004015560a0820151816005015f6101000a81548160ff02191690831515021790555060c08201518160050160016101000a81548160ff02191690831515021790555060e08201518160060155905050836001600160a01b0316336001600160a01b0316827f4c4003d77b0aa7373889fb614730e329c52879bf33864b95a48329773c23471f348787604051610541939291909283526020830191909152604082015260600190565b60405180910390a49392505050565b5f8281526020819052604081205483906001600160a01b03166105b55760405162461bcd60e51b815260206004820152601d60248201527f48544c433a20636f6e747261637420646f6573206e6f7420657869737400000060448201526064016101fd565b83836002816040516020016105cc91815260200190565b60408051601f19818403018152908290526105e691610b6c565b602060405180830381855afa158015610601573d5f5f3e3d5ffd5b5050506040513d601f19601f820116820180604052508101906106249190610b82565b5f83815260208190526040902060030154146106825760405162461bcd60e51b815260206004820152601760248201527f48544c433a20686173686c6f636b206d69736d6174636800000000000000000060448201526064016101fd565b5f8681526020819052604090206001015486906001600160a01b031633146106e15760405162461bcd60e51b8152602060048201526012602482015271242a26219d103737ba103932b1b2b4bb32b960711b60448201526064016101fd565b5f8181526020819052604090206005015460ff161561073c5760405162461bcd60e51b8152602060048201526017602482015276242a26219d1030b63932b0b23c903bb4ba34323930bbb760491b60448201526064016101fd565b5f81815260208190526040902060050154610100900460ff161561079b5760405162461bcd60e51b815260206004820152601660248201527512151310ce88185b1c9958591e481c99599d5b99195960521b60448201526064016101fd565b5f8181526020819052604090206004015442106107f35760405162461bcd60e51b815260206004820152601660248201527512151310ce881d1a5b595b1bd8dac8195e1c1a5c995960521b60448201526064016101fd565b5f878152602081905260408082206006810189905560058101805460ff191660019081179091558101546002820154925191936001600160a01b039091169280156108fc02929091818181858888f19350505050158015610856573d5f5f3e3d5ffd5b5060405188907fdab7d4075c9252a410d107d374ac8d9c35a6eac90810928ab464c369aa8df8bc905f90a2506001979650505050505050565b5f8181526020819052604081205482906001600160a01b03166108f45760405162461bcd60e51b815260206004820152601d60248201527f48544c433a20636f6e747261637420646f6573206e6f7420657869737400000060448201526064016101fd565b5f8381526020819052604090205483906001600160a01b0316331461094e5760405162461bcd60e51b815260206004820152601060248201526f242a26219d103737ba1039b2b73232b960811b60448201526064016101fd565b5f81815260208190526040902060050154610100900460ff16156109ad5760405162461bcd60e51b815260206004820152601660248201527512151310ce88185b1c9958591e481c99599d5b99195960521b60448201526064016101fd565b5f8181526020819052604090206005015460ff1615610a085760405162461bcd60e51b8152602060048201526017602482015276242a26219d1030b63932b0b23c903bb4ba34323930bbb760491b60448201526064016101fd565b5f81815260208190526040902060040154421015610a685760405162461bcd60e51b815260206004820152601a60248201527f48544c433a2074696d656c6f636b206e6f74206578706972656400000000000060448201526064016101fd565b5f8481526020819052604080822060058101805461ff00191661010017905580546002820154925191936001600160a01b039091169280156108fc02929091818181858888f19350505050158015610ac2573d5f5f3e3d5ffd5b5060405185907f9c91a892bd10a7c85b789fa2dd40c8632b251feb7af7a7b035078f12670611e9905f90a2506001949350505050565b5f5f5f60608486031215610b0a575f5ffd5b83356001600160a01b0381168114610b20575f5ffd5b95602085013595506040909401359392505050565b5f5f60408385031215610b46575f5ffd5b50508035926020909101359150565b5f60208284031215610b65575f5ffd5b5035919050565b5f82518060208501845e5f920191825250919050565b5f60208284031215610b92575f5ffd5b505191905056fea26469706673582212203d4174e7d1a7650f337cf6cac2b67b71381a37d456c285a78892989e8361207b64736f6c634300081c0033';
const HTLC_ETH_ABI = [{"inputs":[{"internalType":"address payable","name":"receiver","type":"address"},{"internalType":"bytes32","name":"hashlock","type":"bytes32"},{"internalType":"uint256","name":"timelock","type":"uint256"}],"name":"newContract","outputs":[{"internalType":"bytes32","name":"contractId","type":"bytes32"}],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"contractId","type":"bytes32"},{"internalType":"bytes32","name":"preimage","type":"bytes32"}],"name":"withdraw","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"contractId","type":"bytes32"}],"name":"refund","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"contractId","type":"bytes32"}],"name":"getContract","outputs":[{"internalType":"address","name":"sender","type":"address"},{"internalType":"address","name":"receiver","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes32","name":"hashlock","type":"bytes32"},{"internalType":"uint256","name":"timelock","type":"uint256"},{"internalType":"bool","name":"withdrawn","type":"bool"},{"internalType":"bool","name":"refunded","type":"bool"},{"internalType":"bytes32","name":"preimage","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"contractId","type":"bytes32"}],"name":"hasContract","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"contractId","type":"bytes32"},{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"receiver","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"bytes32","name":"hashlock","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"timelock","type":"uint256"}],"name":"HTLCNew","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"contractId","type":"bytes32"}],"name":"HTLCWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"contractId","type":"bytes32"}],"name":"HTLCRefund","type":"event"}];

export default function SecuritySettings({ userId, walletId, walletEvmAddress, masterSeed }: SecuritySettingsProps) {
  const [walletType, setWalletType] = useState<'passkey' | 'watch-only' | 'legacy' | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateError, setMigrateError] = useState('');
  const [migrateSuccess, setMigrateSuccess] = useState(false);

  // Security scan
  const [scanResult, setScanResult] = useState<SecurityScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  // HTLC deploy
  const [deployPassword, setDeployPassword] = useState('');
  const [deployStatus, setDeployStatus] = useState<'idle' | 'deploying' | 'done' | 'error'>('idle');
  const [deployedAddress, setDeployedAddress] = useState('');
  const [deployError, setDeployError] = useState('');
  const [sepoliaBalance, setSepoliaBalance] = useState<string | null>(null);
  const alreadyDeployed = !!import.meta.env.VITE_ETH_HTLC_CONTRACT;

  const [deployBnbPassword, setDeployBnbPassword] = useState('');
  const [deployBnbStatus, setDeployBnbStatus] = useState<'idle' | 'deploying' | 'done' | 'error'>('idle');
  const [deployedBnbAddress, setDeployedBnbAddress] = useState('');
  const [deployBnbError, setDeployBnbError] = useState('');
  const [bscTestnetBalance, setBscTestnetBalance] = useState<string | null>(null);
  const alreadyDeployedBnb = !!import.meta.env.VITE_BNB_HTLC_CONTRACT;

  // Emergency reset
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    getWalletType(userId).then(setWalletType);
  }, [userId]);

  useEffect(() => {
    if (!walletEvmAddress || alreadyDeployed) return;
    fetch('https://ethereum-sepolia-rpc.publicnode.com', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [walletEvmAddress, 'latest'] }),
    }).then(r => r.json()).then(d => {
      if (d.result) setSepoliaBalance(parseFloat(ethers.formatEther(BigInt(d.result))).toFixed(6));
    }).catch(() => {});
  }, [walletEvmAddress, alreadyDeployed]);

  useEffect(() => {
    if (!walletEvmAddress || alreadyDeployedBnb) return;
    fetch('https://data-seed-prebsc-1-s1.bnbchain.org:8545', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getBalance', params: [walletEvmAddress, 'latest'] }),
    }).then(r => r.json()).then(d => {
      if (d.result) setBscTestnetBalance(parseFloat(ethers.formatEther(BigInt(d.result))).toFixed(6));
    }).catch(() => {});
  }, [walletEvmAddress, alreadyDeployedBnb]);

  // ── Migration ──────────────────────────────────────────────────────────────

  const handleMigrate = async () => {
    setMigrateError('');
    setMigrating(true);
    try {
      const rpId = window.location.hostname.split('.').slice(-2).join('.') || window.location.hostname;
      const { credentialId, masterSeed: newSeed } = await registerPasskeyWithPRF(userId);
      await migrateToPasskey(userId, newSeed, credentialId, rpId);
      setMigrateSuccess(true);
      setWalletType('passkey');
    } catch (e) {
      setMigrateError(e instanceof Error ? e.message : 'Migration failed');
    } finally {
      setMigrating(false);
    }
  };

  // ── Security scan ──────────────────────────────────────────────────────────

  const handleRunScan = async () => {
    setIsScanning(true);
    setScanMsg('');
    setScanResult(null);
    try {
      const result = await runSecurityScan();
      setScanResult(result);
      if (!result.safe || result.warnings.length > 0) setShowScanModal(true);
      else setScanMsg('✅ No threats detected');
    } catch (e: any) {
      setScanMsg(e.message || 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  // ── HTLC deploy ────────────────────────────────────────────────────────────

  const handleDeployHTLC = async () => {
    if (!walletId || !walletEvmAddress) return;
    setDeployStatus('deploying');
    setDeployError('');
    try {
      const wallet = masterSeed
        ? await unlockWalletWithPasskey(walletId, masterSeed)
        : await unlockWallet(walletId, deployPassword);
      const ethPrivateKey = wallet.privateKeys.ethereum;
      if (!ethPrivateKey) throw new Error('Ethereum key not found in wallet');
      const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
      const signer = new ethers.Wallet('0x' + ethPrivateKey, provider);
      const balance = await provider.getBalance(signer.address);
      if (balance === 0n) throw new Error(`No Sepolia ETH at ${signer.address}. Get free ETH from a Sepolia faucet first.`);
      const factory = new ethers.ContractFactory(HTLC_ETH_ABI, HTLC_ETH_BYTECODE, signer);
      const contract = await factory.deploy();
      await contract.waitForDeployment();
      setDeployedAddress(await contract.getAddress());
      setDeployStatus('done');
      setDeployPassword('');
    } catch (e: unknown) {
      setDeployError(e instanceof Error ? e.message : String(e));
      setDeployStatus('error');
    }
  };

  const handleDeployBnbHTLC = async () => {
    if (!walletId || !walletEvmAddress) return;
    setDeployBnbStatus('deploying');
    setDeployBnbError('');
    try {
      const wallet = masterSeed
        ? await unlockWalletWithPasskey(walletId, masterSeed)
        : await unlockWallet(walletId, deployBnbPassword);
      const ethPrivateKey = wallet.privateKeys.ethereum;
      if (!ethPrivateKey) throw new Error('Ethereum key not found in wallet');
      const provider = new ethers.JsonRpcProvider('https://data-seed-prebsc-1-s1.bnbchain.org:8545', 97);
      const signer = new ethers.Wallet('0x' + ethPrivateKey, provider);
      const balance = await provider.getBalance(signer.address);
      if (balance === 0n) throw new Error(`No BSC Testnet BNB at ${signer.address}. Get tBNB from https://testnet.bnbchain.org/faucet-smart`);
      const factory = new ethers.ContractFactory(HTLC_ETH_ABI, HTLC_ETH_BYTECODE, signer);
      const contract = await factory.deploy();
      await contract.waitForDeployment();
      setDeployedBnbAddress(await contract.getAddress());
      setDeployBnbStatus('done');
      setDeployBnbPassword('');
    } catch (e: unknown) {
      setDeployBnbError(e instanceof Error ? e.message : String(e));
      setDeployBnbStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Passkey security status ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-semibold mb-1">Security</h2>
        <p className="text-gray-400 text-sm">Your wallet is secured by passkey — backed by your Google or Apple account.</p>
      </div>

      {walletType === 'passkey' || masterSeed ? (
        <div className="flex items-start gap-4 p-5 rounded-2xl bg-emerald-900/30 border border-emerald-700/40">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-white">Passkey Secured</p>
            <p className="text-sm text-emerald-300/80 mt-0.5">
              Your keys are derived deterministically from your biometric passkey.
              No seed phrase. No password. Backed by your cloud account.
            </p>
          </div>
        </div>
      ) : walletType === 'watch-only' ? (
        <div className="flex items-start gap-4 p-5 rounded-2xl bg-blue-900/30 border border-blue-700/40">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="font-semibold text-white">Watch-Only Wallet</p>
            <p className="text-sm text-blue-300/80 mt-0.5">
              Addresses imported from your cold signer. Signing happens on the offline device.
            </p>
          </div>
        </div>
      ) : walletType === 'legacy' ? (
        /* Migration banner for existing BIP39/password wallets */
        <div className="p-5 rounded-2xl bg-amber-900/20 border border-amber-700/40 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">Legacy wallet detected</p>
              <p className="text-sm text-amber-200/70 mt-0.5">
                Your wallet uses a seed phrase + password. Upgrade to passkey for one-tap
                unlock backed by your Google or Apple account — no more passwords.
              </p>
            </div>
          </div>
          {migrateSuccess ? (
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
              <CheckCircle className="w-4 h-4" /> Upgraded! New passkey addresses are active. Move funds from old addresses at your convenience.
            </div>
          ) : (
            <>
              {migrateError && (
                <p className="text-xs text-red-400 bg-red-900/20 rounded-xl p-3">{migrateError}</p>
              )}
              <button
                onClick={handleMigrate}
                disabled={migrating}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                <Fingerprint className="w-4 h-4" />
                {migrating ? 'Touch your sensor…' : 'Upgrade to Passkey'}
                {!migrating && <ArrowRight className="w-4 h-4" />}
              </button>
              <p className="text-xs text-amber-200/50">
                This creates new addresses from your passkey. Your old wallet stays intact until you move your funds.
              </p>
            </>
          )}
        </div>
      ) : null}

      {/* ── Security scan ──────────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-gray-700">
        <h3 className="text-base font-medium mb-3 flex items-center gap-2">
          <Search className="w-4 h-4" /> Security Environment Scan
        </h3>
        <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-700 space-y-3">
          <p className="text-sm text-gray-400">
            Detect malicious browser extensions, DevTools monitoring, or compromised cryptographic APIs.
          </p>
          <button
            onClick={handleRunScan}
            disabled={isScanning}
            className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
          >
            {isScanning
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Scanning…</>
              : <><Search className="w-4 h-4" /> Run Security Scan</>
            }
          </button>
          {scanMsg && <p className="text-sm text-emerald-400">{scanMsg}</p>}
          {scanResult && !showScanModal && (scanResult.blockers.length > 0 || scanResult.warnings.length > 0) && (
            <button onClick={() => setShowScanModal(true)} className="text-xs text-amber-400 underline">
              View {scanResult.blockers.length + scanResult.warnings.length} issue(s)
            </button>
          )}
        </div>
      </div>

      {/* ── Deploy ETH HTLC ────────────────────────────────────────────────── */}
      {walletId && walletEvmAddress && !alreadyDeployed && (
        <div className="pt-4 border-t border-gray-700">
          <h3 className="text-base font-medium mb-3 flex items-center gap-2">
            <Rocket className="w-4 h-4 text-cyan-400" /> Deploy ETH HTLC Contract
          </h3>
          <div className="p-4 rounded-xl bg-cyan-900/20 border border-cyan-700/50 space-y-3">
            <p className="text-sm text-gray-400">
              Deploy <code className="text-cyan-300">HashedTimelockETH</code> to Sepolia. Costs ~0.001 Sepolia ETH.
            </p>
            {sepoliaBalance !== null && (
              <p className="text-xs text-slate-400">
                Sepolia balance: <span className={parseFloat(sepoliaBalance) < 0.001 ? 'text-red-400' : 'text-emerald-400'}>{sepoliaBalance} ETH</span>
                {parseFloat(sepoliaBalance) < 0.001 && (
                  <a href="https://sepoliafaucet.com" target="_blank" rel="noreferrer" className="ml-2 text-cyan-400 underline inline-flex items-center gap-0.5">
                    Get Sepolia ETH <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
            )}
            {deployStatus === 'done' ? (
              <div className="space-y-2">
                <p className="text-emerald-400 text-sm font-medium">✅ Deployed!</p>
                <p className="text-xs font-mono text-slate-300 break-all bg-slate-800 rounded p-2">{deployedAddress}</p>
                <p className="text-xs text-amber-300">Set <code>VITE_ETH_HTLC_CONTRACT={deployedAddress}</code> in Vercel + <code>ETH_HTLC_CONTRACT</code> on VPS, then redeploy.</p>
                <a href={`https://sepolia.etherscan.io/address/${deployedAddress}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline">
                  View on Etherscan <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                {!masterSeed && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Wallet password (legacy wallets only)</label>
                    <input type="password" value={deployPassword} onChange={e => setDeployPassword(e.target.value)}
                      disabled={deployStatus === 'deploying'} placeholder="Your wallet password"
                      className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm disabled:opacity-50" />
                  </div>
                )}
                {deployError && <p className="text-xs text-red-400">{deployError}</p>}
                <button onClick={handleDeployHTLC}
                  disabled={deployStatus === 'deploying' || (!masterSeed && !deployPassword.trim()) || (sepoliaBalance !== null && parseFloat(sepoliaBalance) < 0.001)}
                  className="w-full px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2">
                  {deployStatus === 'deploying'
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Deploying…</>
                    : <><Rocket className="w-4 h-4" /> Deploy to Sepolia</>
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Deploy BNB HTLC ────────────────────────────────────────────────── */}
      {walletId && walletEvmAddress && !alreadyDeployedBnb && (
        <div className="pt-4 border-t border-gray-700">
          <h3 className="text-base font-medium mb-3 flex items-center gap-2">
            <Rocket className="w-4 h-4 text-yellow-400" /> Deploy BNB HTLC Contract
          </h3>
          <div className="p-4 rounded-xl bg-yellow-900/20 border border-yellow-700/50 space-y-3">
            <p className="text-sm text-gray-400">
              Deploy <code className="text-yellow-300">HashedTimelockETH</code> to BSC Testnet. Costs ~0.001 tBNB.
            </p>
            {bscTestnetBalance !== null && (
              <p className="text-xs text-slate-400">
                BSC Testnet balance: <span className={parseFloat(bscTestnetBalance) < 0.001 ? 'text-red-400' : 'text-emerald-400'}>{bscTestnetBalance} tBNB</span>
                {parseFloat(bscTestnetBalance) < 0.001 && (
                  <a href="https://testnet.bnbchain.org/faucet-smart" target="_blank" rel="noreferrer" className="ml-2 text-yellow-400 underline inline-flex items-center gap-0.5">
                    Get tBNB <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
            )}
            {deployBnbStatus === 'done' ? (
              <div className="space-y-2">
                <p className="text-emerald-400 text-sm font-medium">✅ Deployed!</p>
                <p className="text-xs font-mono text-slate-300 break-all bg-slate-800 rounded p-2">{deployedBnbAddress}</p>
                <p className="text-xs text-amber-300">Set <code>VITE_BNB_HTLC_CONTRACT={deployedBnbAddress}</code> in Vercel + <code>BNB_HTLC_CONTRACT</code> on VPS, then redeploy.</p>
                <a href={`https://testnet.bscscan.com/address/${deployedBnbAddress}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-yellow-400 hover:underline">
                  View on BSCScan <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                {!masterSeed && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Wallet password (legacy wallets only)</label>
                    <input type="password" value={deployBnbPassword} onChange={e => setDeployBnbPassword(e.target.value)}
                      disabled={deployBnbStatus === 'deploying'} placeholder="Your wallet password"
                      className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:border-yellow-500 focus:outline-none text-sm disabled:opacity-50" />
                  </div>
                )}
                {deployBnbError && <p className="text-xs text-red-400">{deployBnbError}</p>}
                <button onClick={handleDeployBnbHTLC}
                  disabled={deployBnbStatus === 'deploying' || (!masterSeed && !deployBnbPassword.trim()) || (bscTestnetBalance !== null && parseFloat(bscTestnetBalance) < 0.001)}
                  className="w-full px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2">
                  {deployBnbStatus === 'deploying'
                    ? <><div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" /> Deploying…</>
                    : <><Rocket className="w-4 h-4" /> Deploy to BSC Testnet</>
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Shamir recovery ────────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-gray-700">
        <ShamirRecoveryPanel userId={userId} />
      </div>

      {/* ── Emergency reset ────────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-gray-700">
        <h3 className="text-base font-medium mb-3">⚠️ Emergency Reset</h3>
        <div className="p-4 rounded-xl bg-red-900/20 border border-red-700/50 space-y-3">
          <p className="text-sm text-gray-400">
            If your passkey is lost or device replaced, delete the local wallet record and set up a fresh passkey.
            Funds in the old addresses remain on-chain — your new passkey gives new addresses.
          </p>
          {resetDone ? (
            <p className="text-sm text-emerald-400">✅ Wallet data cleared. Reload to set up fresh.</p>
          ) : !showResetConfirm ? (
            <button onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors text-sm">
              Delete Local Wallet Data
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-red-300 font-medium">
                This removes all local wallet records. On-chain balances are unaffected.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    try {
                      const { emergencySecurityReset } = require('@/lib/securityService');
                      emergencySecurityReset(userId);
                    } catch {}
                    localStorage.removeItem(`wallet_id_${userId}`);
                    localStorage.removeItem(`wallet_created_${userId}`);
                    setResetDone(true);
                    setShowResetConfirm(false);
                  }}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-sm transition-colors">
                  Confirm Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showScanModal && scanResult && (
        <SecurityWarningModal
          result={scanResult}
          onProceed={() => setShowScanModal(false)}
          onCancel={() => setShowScanModal(false)}
          action="use this wallet"
          allowProceedWithWarnings={true}
        />
      )}
    </div>
  );
}
