// client/src/components/Wallet/SecuritySettings.tsx
// Security tier management UI - Tier 1/2/3 selection and PIN setup

import { useState, useEffect } from 'react';
import { Shield, Lock, AlertTriangle, Check, ChevronRight, Search, Snowflake, Rocket, ExternalLink } from 'lucide-react';
import { ethers } from 'ethers';
import {
  getSecuritySettings,
  changeSecurityTier,
  setupPin,
  hasPinSetup,
  emergencySecurityReset,
  type SecurityTier,
} from '@/lib/securityService';
import { registerPasskey, isPasskeyRegistered } from '@/lib/passkeyService';
import { unlockWallet, resetWalletPassword } from '@/lib/walletService';
import { isColdSignerConfigured } from '@/lib/coldSignerService';
import { runSecurityScan, getSecurityLevel, type SecurityScanResult } from '@/lib/securityScanner';
import SecurityWarningModal from './SecurityWarningModal';
import ShamirRecoveryPanel from './ShamirRecoveryPanel';

interface SecuritySettingsProps {
  userId: string;
  walletId?: string;
  walletEvmAddress?: string;
  onSecurityChange?: () => void;
}

type SetupMode = 'pin-setup' | 'pin-confirm' | 'emergency-reset' | null;

type ScanCheck = {
  id: string;
  label: string;
  status: 'pending' | 'checking' | 'complete';
};

// ── HashedTimelockETH compiled bytecode (Sepolia / any EVM) ──────────────────
const HTLC_ETH_BYTECODE = '0x6080604052348015600e575f5ffd5b50610bcf8061001c5f395ff3fe608060405260043610610049575f3560e01c8063335ef5bd1461004d57806363615149146100735780637249fbb6146100a2578063ad0aa0e4146100c1578063e16c7d98146100f7575b5f5ffd5b61006061005b366004610af8565b6101b1565b6040519081526020015b60405180910390f35b34801561007e575f5ffd5b5061009261008d366004610b35565b610550565b604051901515815260200161006a565b3480156100ad575f5ffd5b506100926100bc366004610b55565b61088f565b3480156100cc575f5ffd5b506100926100db366004610b55565b5f908152602081905260409020546001600160a01b0316151590565b348015610102575f5ffd5b50610167610111366004610b55565b5f9081526020819052604090208054600182015460028301546003840154600485015460058601546006909601546001600160a01b0395861697959094169592949193909260ff80821693610100909204169190565b604080516001600160a01b03998a1681529890971660208901529587019490945260608601929092526080850152151560a0840152151560c083015260e08201526101000161006a565b5f5f34116102065760405162461bcd60e51b815260206004820152601860248201527f48544c433a20616d6f756e74206d757374206265203e2030000000000000000060448201526064015b60405180910390fd5b4282116102555760405162461bcd60e51b815260206004820152601d60248201527f48544c433a2074696d656c6f636b206d7573742062652066757475726500000060448201526064016101fd565b6001600160a01b0384166102ab5760405162461bcd60e51b815260206004820152601e60248201527f48544c433a207265636569766572206973207a65726f2061646472657373000060448201526064016101fd565b336001600160a01b038516036103035760405162461bcd60e51b815260206004820152601860248201527f48544c433a207265636569766572203d3d2073656e646572000000000000000060448201526064016101fd565b6040516bffffffffffffffffffffffff1933606090811b8216602084015286901b166034820152346048820152606881018490526088810183905260a801604051602081830303815290604052805190602001209050610379815f908152602081905260409020546001600160a01b0316151590565b156103c65760405162461bcd60e51b815260206004820152601860248201527f48544c433a206475706c696361746520636f6e7472616374000000000000000060448201526064016101fd565b604051806101000160405280336001600160a01b03168152602001856001600160a01b031681526020013481526020018481526020018381526020015f151581526020015f151581526020015f5f1b8152505f5f8381526020019081526020015f205f820151815f015f6101000a8154816001600160a01b0302191690836001600160a01b031602179055506020820151816001015f6101000a8154816001600160a01b0302191690836001600160a01b0316021790555060408201518160020155606082015181600301556080820151816004015560a0820151816005015f6101000a81548160ff02191690831515021790555060c08201518160050160016101000a81548160ff02191690831515021790555060e08201518160060155905050836001600160a01b0316336001600160a01b0316827f4c4003d77b0aa7373889fb614730e329c52879bf33864b95a48329773c23471f348787604051610541939291909283526020830191909152604082015260600190565b60405180910390a49392505050565b5f8281526020819052604081205483906001600160a01b03166105b55760405162461bcd60e51b815260206004820152601d60248201527f48544c433a20636f6e747261637420646f6573206e6f7420657869737400000060448201526064016101fd565b83836002816040516020016105cc91815260200190565b60408051601f19818403018152908290526105e691610b6c565b602060405180830381855afa158015610601573d5f5f3e3d5ffd5b5050506040513d601f19601f820116820180604052508101906106249190610b82565b5f83815260208190526040902060030154146106825760405162461bcd60e51b815260206004820152601760248201527f48544c433a20686173686c6f636b206d69736d6174636800000000000000000060448201526064016101fd565b5f8681526020819052604090206001015486906001600160a01b031633146106e15760405162461bcd60e51b8152602060048201526012602482015271242a26219d103737ba103932b1b2b4bb32b960711b60448201526064016101fd565b5f8181526020819052604090206005015460ff161561073c5760405162461bcd60e51b8152602060048201526017602482015276242a26219d1030b63932b0b23c903bb4ba34323930bbb760491b60448201526064016101fd565b5f81815260208190526040902060050154610100900460ff161561079b5760405162461bcd60e51b815260206004820152601660248201527512151310ce88185b1c9958591e481c99599d5b99195960521b60448201526064016101fd565b5f8181526020819052604090206004015442106107f35760405162461bcd60e51b815260206004820152601660248201527512151310ce881d1a5b595b1bd8dac8195e1c1a5c995960521b60448201526064016101fd565b5f878152602081905260408082206006810189905560058101805460ff191660019081179091558101546002820154925191936001600160a01b039091169280156108fc02929091818181858888f19350505050158015610856573d5f5f3e3d5ffd5b5060405188907fdab7d4075c9252a410d107d374ac8d9c35a6eac90810928ab464c369aa8df8bc905f90a2506001979650505050505050565b5f8181526020819052604081205482906001600160a01b03166108f45760405162461bcd60e51b815260206004820152601d60248201527f48544c433a20636f6e747261637420646f6573206e6f7420657869737400000060448201526064016101fd565b5f8381526020819052604090205483906001600160a01b0316331461094e5760405162461bcd60e51b815260206004820152601060248201526f242a26219d103737ba1039b2b73232b960811b60448201526064016101fd565b5f81815260208190526040902060050154610100900460ff16156109ad5760405162461bcd60e51b815260206004820152601660248201527512151310ce88185b1c9958591e481c99599d5b99195960521b60448201526064016101fd565b5f8181526020819052604090206005015460ff1615610a085760405162461bcd60e51b8152602060048201526017602482015276242a26219d1030b63932b0b23c903bb4ba34323930bbb760491b60448201526064016101fd565b5f81815260208190526040902060040154421015610a685760405162461bcd60e51b815260206004820152601a60248201527f48544c433a2074696d656c6f636b206e6f74206578706972656400000000000060448201526064016101fd565b5f8481526020819052604080822060058101805461ff00191661010017905580546002820154925191936001600160a01b039091169280156108fc02929091818181858888f19350505050158015610ac2573d5f5f3e3d5ffd5b5060405185907f9c91a892bd10a7c85b789fa2dd40c8632b251feb7af7a7b035078f12670611e9905f90a2506001949350505050565b5f5f5f60608486031215610b0a575f5ffd5b83356001600160a01b0381168114610b20575f5ffd5b95602085013595506040909401359392505050565b5f5f60408385031215610b46575f5ffd5b50508035926020909101359150565b5f60208284031215610b65575f5ffd5b5035919050565b5f82518060208501845e5f920191825250919050565b5f60208284031215610b92575f5ffd5b505191905056fea26469706673582212203d4174e7d1a7650f337cf6cac2b67b71381a37d456c285a78892989e8361207b64736f6c634300081c0033';
const HTLC_ETH_ABI = [{"inputs":[{"internalType":"address payable","name":"receiver","type":"address"},{"internalType":"bytes32","name":"hashlock","type":"bytes32"},{"internalType":"uint256","name":"timelock","type":"uint256"}],"name":"newContract","outputs":[{"internalType":"bytes32","name":"contractId","type":"bytes32"}],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"contractId","type":"bytes32"},{"internalType":"bytes32","name":"preimage","type":"bytes32"}],"name":"withdraw","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"contractId","type":"bytes32"}],"name":"refund","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"contractId","type":"bytes32"}],"name":"getContract","outputs":[{"internalType":"address","name":"sender","type":"address"},{"internalType":"address","name":"receiver","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes32","name":"hashlock","type":"bytes32"},{"internalType":"uint256","name":"timelock","type":"uint256"},{"internalType":"bool","name":"withdrawn","type":"bool"},{"internalType":"bool","name":"refunded","type":"bool"},{"internalType":"bytes32","name":"preimage","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"contractId","type":"bytes32"}],"name":"hasContract","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"contractId","type":"bytes32"},{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"receiver","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"bytes32","name":"hashlock","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"timelock","type":"uint256"}],"name":"HTLCNew","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"contractId","type":"bytes32"}],"name":"HTLCWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"contractId","type":"bytes32"}],"name":"HTLCRefund","type":"event"}];

export default function SecuritySettings({ userId, walletId, walletEvmAddress, onSecurityChange }: SecuritySettingsProps) {
  const [currentTier, setCurrentTier] = useState<SecurityTier>('standard');
  const [setupMode, setSetupMode] = useState<SetupMode>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);
  const [pendingDowngradeTier, setPendingDowngradeTier] = useState<SecurityTier | null>(null);
  const [pendingColdActivation, setPendingColdActivation] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changePwSeedPhrase, setChangePwSeedPhrase] = useState('');
  const [changePwNew, setChangePwNew] = useState('');
  const [changePwConfirm, setChangePwConfirm] = useState('');
  const [changePwError, setChangePwError] = useState<string | null>(null);
  const [changePwSuccess, setChangePwSuccess] = useState(false);
  const [scanResult, setScanResult] = useState<SecurityScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  
  // Staged animation state for security scan
  const [scanChecks, setScanChecks] = useState<ScanCheck[]>([]);
  const [currentCheckIndex, setCurrentCheckIndex] = useState(-1);

  // Deploy HTLC state
  const [deployPassword, setDeployPassword] = useState('');
  const [deployStatus, setDeployStatus] = useState<'idle' | 'deploying' | 'done' | 'error'>('idle');
  const [deployedAddress, setDeployedAddress] = useState('');
  const [deployError, setDeployError] = useState('');
  const [sepoliaBalance, setSepoliaBalance] = useState<string | null>(null);
  const alreadyDeployed = !!import.meta.env.VITE_ETH_HTLC_CONTRACT;

  // Deploy BNB HTLC state
  const [deployBnbPassword, setDeployBnbPassword] = useState('');
  const [deployBnbStatus, setDeployBnbStatus] = useState<'idle' | 'deploying' | 'done' | 'error'>('idle');
  const [deployedBnbAddress, setDeployedBnbAddress] = useState('');
  const [deployBnbError, setDeployBnbError] = useState('');
  const [bscTestnetBalance, setBscTestnetBalance] = useState<string | null>(null);
  const alreadyDeployedBnb = !!import.meta.env.VITE_BNB_HTLC_CONTRACT;

  useEffect(() => {
    if (!walletEvmAddress || alreadyDeployed) return;
    const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
    fetch(SEPOLIA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [walletEvmAddress, 'latest'] }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.result) {
          const bal = parseFloat(ethers.formatEther(BigInt(d.result)));
          setSepoliaBalance(bal.toFixed(6));
        }
      })
      .catch(() => {});
  }, [walletEvmAddress, alreadyDeployed]);

  useEffect(() => {
    if (!walletEvmAddress || alreadyDeployedBnb) return;
    const BSC_TESTNET_RPC = 'https://data-seed-prebsc-1-s1.bnbchain.org:8545';
    fetch(BSC_TESTNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getBalance', params: [walletEvmAddress, 'latest'] }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.result) {
          const bal = parseFloat(ethers.formatEther(BigInt(d.result)));
          setBscTestnetBalance(bal.toFixed(6));
        }
      })
      .catch(() => {});
  }, [walletEvmAddress, alreadyDeployedBnb]);

  const handleDeployHTLC = async () => {
    if (!walletId || !walletEvmAddress) return;
    setDeployStatus('deploying');
    setDeployError('');
    try {
      const wallet = await unlockWallet(walletId, deployPassword);
      const ethPrivateKey = wallet.privateKeys.ethereum;
      if (!ethPrivateKey) throw new Error('Ethereum key not found in wallet');
      const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
      const signer = new ethers.Wallet('0x' + ethPrivateKey, provider);
      const factory = new ethers.ContractFactory(HTLC_ETH_ABI, HTLC_ETH_BYTECODE, signer);
      const contract = await factory.deploy();
      await contract.waitForDeployment();
      const addr = await contract.getAddress();
      setDeployedAddress(addr);
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
      const wallet = await unlockWallet(walletId, deployBnbPassword);
      const ethPrivateKey = wallet.privateKeys.ethereum;
      if (!ethPrivateKey) throw new Error('Ethereum key not found in wallet');
      const provider = new ethers.JsonRpcProvider('https://data-seed-prebsc-1-s1.bnbchain.org:8545');
      const signer = new ethers.Wallet('0x' + ethPrivateKey, provider);
      const factory = new ethers.ContractFactory(HTLC_ETH_ABI, HTLC_ETH_BYTECODE, signer);
      const contract = await factory.deploy();
      await contract.waitForDeployment();
      const addr = await contract.getAddress();
      setDeployedBnbAddress(addr);
      setDeployBnbStatus('done');
      setDeployBnbPassword('');
    } catch (e: unknown) {
      setDeployBnbError(e instanceof Error ? e.message : String(e));
      setDeployBnbStatus('error');
    }
  };

  useEffect(() => {
    const settings = getSecuritySettings(userId);
    setCurrentTier(settings.tier);
  }, [userId]);

  const getTierColor = (tier: SecurityTier) => {
    switch (tier) {
      case 'standard':
        return 'emerald';
      case 'enhanced':
        return 'amber';
      case 'maximum':
        return 'red';
      case 'cold':
        return 'cyan';
    }
  };

  const getTierEmoji = (tier: SecurityTier) => {
    switch (tier) {
      case 'standard':
        return '🟢';
      case 'enhanced':
        return '🟡';
      case 'maximum':
        return '🔴';
      case 'cold':
        return '🔵';
    }
  };

  const getTierDescription = (tier: SecurityTier) => {
    switch (tier) {
      case 'standard':
        return {
          title: 'STANDARD',
          subtitle: 'Default security for most users',
          features: [
            'Auto-login when authenticated',
            'Passkey only to send transactions',
            'Password + Passkey for seed phrase access',
            'Balanced security and convenience',
          ],
        };
      case 'enhanced':
        return {
          title: 'ENHANCED',
          subtitle: 'Additional protection layer',
          features: [
            'Passkey required to open wallet',
            'Password + Passkey to send transactions',
            'Password + Passkey for seed phrase access',
            'Recommended for active traders',
          ],
        };
      case 'maximum':
        return {
          title: 'MAXIMUM',
          subtitle: 'Highest security for large holdings',
          features: [
            'PIN + Passkey to open wallet',
            'PIN + Password + Passkey to send transactions',
            'PIN + Password + Passkey for seed phrase',
            'Rate-limited PIN attempts (5 max)',
          ],
        };
      case 'cold':
        return {
          title: 'COLD DEVICE MODE',
          subtitle: 'Icy blue air-gapped transaction flow',
          features: [
            'Outgoing transactions require Cold Signer QR approval',
            'Share 1 stays on this device, Share 2 stays on the cold device',
            'Designed for a dedicated offline signer device',
            'Use recovery or rotation to reprovision lost or replaced devices',
          ],
        };
    }
  };

  const handleActivateColdMode = async () => {
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      if (!isColdSignerConfigured()) {
        throw new Error('Configure and save Share 1 on this device before enabling Cold Device Mode.');
      }

      if (!isPasskeyRegistered()) {
        await registerPasskey(userId);
      }

      // Cold mode requires PIN — if no PIN set up yet, start PIN setup flow first
      if (!hasPinSetup(userId)) {
        setSetupMode('pin-setup');
        // Store that we're setting up for cold mode so we complete activation after PIN setup
        setPendingColdActivation(true);
        setIsProcessing(false);
        return;
      }

      changeSecurityTier(userId, 'cold');
      setCurrentTier('cold');
      setSuccess('✅ Cold Device Mode enabled. Outgoing transactions now require the cold signer flow.');
      onSecurityChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to enable Cold Device Mode');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpgradeToEnhanced = async () => {
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      // Check if passkey is registered
      if (!isPasskeyRegistered()) {
        // Register passkey first
        await registerPasskey(userId);
      }

      changeSecurityTier(userId, 'enhanced');
      setCurrentTier('enhanced');
      setSuccess('✅ Upgraded to Enhanced security');
      onSecurityChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to upgrade security tier');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpgradeToMaximum = () => {
    // Start PIN setup flow
    setSetupMode('pin-setup');
    setError(null);
    setSuccess(null);
  };

  const handlePinSetupSubmit = () => {
    setError(null);

    // Validate PIN
    if (pinInput.length !== 6 || !/^\d+$/.test(pinInput)) {
      setError('PIN must be exactly 6 digits');
      return;
    }

    if (pinInput !== pinConfirm) {
      setError('PINs do not match');
      return;
    }

    // Move to confirmation
    setSetupMode('pin-confirm');
  };

  const handlePinSetupComplete = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Check if passkey is registered
      if (!isPasskeyRegistered()) {
        await registerPasskey(userId);
      }

      // Setup PIN
      await setupPin(userId, pinInput);

      // Change tier — cold if that was pending, otherwise maximum
      const targetTier = pendingColdActivation ? 'cold' : 'maximum';
      changeSecurityTier(userId, targetTier);
      setCurrentTier(targetTier);

      // Clear PIN inputs and state
      setPinInput('');
      setPinConfirm('');
      setSetupMode(null);

      if (pendingColdActivation) {
        setPendingColdActivation(false);
        setSuccess('✅ Cold Device Mode enabled with PIN protection. Outgoing transactions now require the cold signer flow.');
      } else {
        setSuccess('✅ Upgraded to Maximum security with PIN protection');
      }
      onSecurityChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to setup PIN');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDowngrade = async (targetTier: SecurityTier) => {
    // Show confirmation UI instead of window.confirm
    setPendingDowngradeTier(targetTier);
    setShowDowngradeConfirm(true);
  };

  const confirmDowngrade = async () => {
    if (!pendingDowngradeTier) return;
    
    setIsProcessing(true);
    try {
      changeSecurityTier(userId, pendingDowngradeTier);
      setCurrentTier(pendingDowngradeTier);
      setSuccess(`✅ Security level changed to ${pendingDowngradeTier}`);
      onSecurityChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to change security tier');
    } finally {
      setIsProcessing(false);
      setShowDowngradeConfirm(false);
      setPendingDowngradeTier(null);
    }
  };

  const cancelDowngrade = () => {
    setShowDowngradeConfirm(false);
    setPendingDowngradeTier(null);
  };

  const handleChangePassword = async () => {
    setChangePwError(null);
    if (!changePwSeedPhrase.trim()) {
      setChangePwError('Please enter your seed phrase.');
      return;
    }
    if (!changePwNew) {
      setChangePwError('Please enter a new password.');
      return;
    }
    if (changePwNew !== changePwConfirm) {
      setChangePwError('Passwords do not match.');
      return;
    }
    setIsProcessing(true);
    try {
      await resetWalletPassword(userId, changePwSeedPhrase, changePwNew);
      setChangePwSuccess(true);
      setChangePwSeedPhrase('');
      setChangePwNew('');
      setChangePwConfirm('');
    } catch (err: any) {
      setChangePwError(err.message || 'Failed to reset password.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEmergencyReset = async () => {
    if (!resetPassword) {
      setError('Password is required');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Verify password before allowing reset
      await unlockWallet(userId, resetPassword);
      
      // Password is correct, proceed with reset
      await emergencySecurityReset(userId, resetPassword);
      setCurrentTier('standard');
      setShowResetConfirm(false);
      setResetPassword('');
      setSuccess('✅ Security reset to Standard tier');
      onSecurityChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to verify password');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunScan = async () => {
    setIsScanning(true);
    setError(null);
    setSuccess(null);
    setCurrentCheckIndex(-1);
    
    // Define the checks to show with staged animation
    const checks: ScanCheck[] = [
      { id: 'extensions', label: 'Checking browser extensions...', status: 'pending' },
      { id: 'devtools', label: 'Checking DevTools...', status: 'pending' },
      { id: 'crypto', label: 'Validating crypto APIs...', status: 'pending' },
      { id: 'clipboard', label: 'Scanning clipboard access...', status: 'pending' },
    ];
    
    setScanChecks(checks);
    
    // Animate through each check
    for (let i = 0; i < checks.length; i++) {
      setCurrentCheckIndex(i);
      
      // Update to checking status
      setScanChecks(prev => prev.map((check: ScanCheck, idx: number) => 
        idx === i ? { ...check, status: 'checking' as const } : check
      ));
      
      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update to complete status
      setScanChecks(prev => prev.map((check: ScanCheck, idx: number) => 
        idx === i ? { ...check, status: 'complete' as const } : check
      ));
      
      // Small delay before fade out (except for last item)
      if (i < checks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    // Wait a bit before showing final result
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // Run actual security scan
      const result = await runSecurityScan();
      setScanResult(result);
      
      // Reset animation state
      setCurrentCheckIndex(-1);
      setScanChecks([]);
      
      // Show modal with scan results
      if (!result.safe || result.warnings.length > 0) {
        setShowScanModal(true);
      } else {
        setSuccess('✅ No threats detected');
      }
    } catch (err: any) {
      setCurrentCheckIndex(-1);
      setScanChecks([]);
      setError(err.message || 'Failed to run security scan');
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanModalClose = () => {
    setShowScanModal(false);
  };

  const renderTierCard = (tier: SecurityTier) => {
    const desc = getTierDescription(tier);
    const isActive = currentTier === tier;
    const canUpgrade = 
      (tier === 'enhanced' && currentTier === 'standard') ||
      (tier === 'maximum' && (currentTier === 'standard' || currentTier === 'enhanced')) ||
      (tier === 'cold' && currentTier !== 'cold');
    const canDowngrade = 
      (tier === 'standard' && currentTier !== 'standard') ||
      (tier === 'enhanced' && (currentTier === 'maximum' || currentTier === 'cold')) ||
      (tier === 'maximum' && currentTier === 'cold');

    const getActiveClasses = () => {
      if (!isActive) return 'bg-gray-900/50 border-gray-700';
      
      switch (tier) {
        case 'standard':
          return 'bg-emerald-900/30 border-emerald-500';
        case 'enhanced':
          return 'bg-amber-900/30 border-amber-500';
        case 'maximum':
          return 'bg-red-900/30 border-red-500';
        case 'cold':
          return 'bg-gradient-to-br from-sky-950/80 via-blue-950/70 to-cyan-950/80 border-cyan-400 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]';
      }
    };

    return (
      <div
        key={tier}
        className={`p-6 rounded-xl border-2 transition-all ${getActiveClasses()}`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getTierEmoji(tier)}</span>
            <div>
              <h3 className="font-bold text-lg">{desc.title}</h3>
              <p className="text-sm text-gray-400">{desc.subtitle}</p>
            </div>
          </div>
          {isActive && (
            <div className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
              Active
            </div>
          )}
        </div>

        <ul className="space-y-2 mb-4">
          {desc.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {canUpgrade && (
          <button
            onClick={() =>
              tier === 'enhanced'
                ? handleUpgradeToEnhanced()
                : tier === 'cold'
                ? handleActivateColdMode()
                : handleUpgradeToMaximum()
            }
            disabled={isProcessing}
            className={
              tier === 'enhanced'
                ? 'w-full px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2'
                : tier === 'maximum'
                ? 'w-full px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2'
                : tier === 'cold'
                ? 'w-full px-4 py-2 rounded-lg bg-cyan-400 text-slate-950 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2'
                : 'w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2'
            }
          >
            Upgrade to {desc.title}
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {canDowngrade && (
          <button
            onClick={() => handleDowngrade(tier)}
            disabled={isProcessing}
            className="w-full px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Switch to {desc.title}
          </button>
        )}

        {tier === 'cold' && !isColdSignerConfigured() && !isActive && (
          <p className="mt-3 text-xs text-cyan-200/80">
            Save Share 1 and complete cold signer setup before enabling this mode.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Security Level</h2>
        <p className="text-gray-400">
          Choose the security level that best fits your needs
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-900/30 border border-red-700/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-emerald-900/30 border border-emerald-700/50">
          <p className="text-sm text-emerald-400">{success}</p>
        </div>
      )}

      {/* Current Tier Badge */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-900/50 border border-gray-700">
        <Shield className="w-6 h-6 text-emerald-400" />
        <div>
          <p className="text-sm text-gray-400">Current Security Level</p>
          <p className="font-semibold">
            {getTierEmoji(currentTier)} {currentTier.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Tier Cards */}
      <div className="space-y-4">
        {renderTierCard('standard')}
        {renderTierCard('enhanced')}
        {renderTierCard('maximum')}
        {renderTierCard('cold')}
      </div>

      {currentTier === 'cold' && (
        <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-sky-950/80 via-blue-950/70 to-cyan-950/80 p-5">
          <div className="flex items-center gap-3 text-cyan-200">
            <Snowflake className="w-5 h-5" />
            <div>
              <p className="font-semibold">Cold Device Mode is active</p>
              <p className="text-sm text-cyan-100/80">Send flow should stay on the cold signer path until you switch tiers.</p>
            </div>
          </div>
        </div>
      )}

      {/* Security Environment Scan */}
      <div className="pt-6 border-t border-gray-700">
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Search className="w-5 h-5" />
          Security Environment Scan
        </h3>
        <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-700">
          <p className="text-sm text-gray-400 mb-4">
            Run a comprehensive security scan to detect potential threats like malicious browser 
            extensions, DevTools monitoring, or compromised cryptographic APIs.
          </p>
          
          <button
            onClick={handleRunScan}
            disabled={isScanning}
            className="w-full px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isScanning ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Scanning Environment...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Run Security Scan
              </>
            )}
          </button>

          {/* Staged Animation for Security Checks - Bug 20 */}
          {isScanning && currentCheckIndex >= 0 && scanChecks.length > 0 && (
            <div className="mt-4 space-y-2">
              {scanChecks.map((check, index) => {
                // Only show current check
                if (index !== currentCheckIndex) return null;
                
                return (
                  <div
                    key={check.id}
                    className="p-3 rounded-lg bg-gray-800 border border-gray-700 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300"
                  >
                    {check.status === 'checking' && (
                      <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin flex-shrink-0" />
                    )}
                    {check.status === 'complete' && (
                      <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    )}
                    <span className="text-sm text-gray-300">{check.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {scanResult && !showScanModal && (
            <div className={`mt-4 p-3 rounded-lg border ${
              scanResult.safe && scanResult.warnings.length === 0
                ? 'bg-emerald-900/20 border-emerald-700/50'
                : scanResult.blockers.length > 0
                ? 'bg-red-900/20 border-red-700/50'
                : 'bg-amber-900/20 border-amber-700/50'
            }`}>
              <p className={`text-sm font-medium ${
                scanResult.safe && scanResult.warnings.length === 0
                  ? 'text-emerald-400'
                  : scanResult.blockers.length > 0
                  ? 'text-red-400'
                  : 'text-amber-400'
              }`}>
                {scanResult.safe && scanResult.warnings.length === 0 && (
                  <>✅ Environment Secure - No threats detected</>
                )}
                {scanResult.blockers.length > 0 && (
                  <>🚫 Critical Issues - {scanResult.blockers.length} blocker(s) found</>
                )}
                {scanResult.warnings.length > 0 && scanResult.blockers.length === 0 && (
                  <>⚠️ Warnings - {scanResult.warnings.length} potential issue(s) found</>
                )}
              </p>
              {(scanResult.blockers.length > 0 || scanResult.warnings.length > 0) && (
                <button
                  onClick={() => setShowScanModal(true)}
                  className="mt-2 text-xs text-gray-400 hover:text-gray-300 underline"
                >
                  View Details
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Deploy HashedTimelockETH */}
      {walletId && walletEvmAddress && !alreadyDeployed && (
        <div className="pt-6 border-t border-gray-700">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><Rocket className="w-5 h-5 text-cyan-400" /> Deploy ETH HTLC Contract</h3>
          <div className="p-4 rounded-xl bg-cyan-900/20 border border-cyan-700/50 space-y-3">
            <p className="text-sm text-gray-400">
              Deploy <code className="text-cyan-300">HashedTimelockETH</code> to Sepolia so ETH atomic swaps work.
              Costs ~0.001 Sepolia ETH in gas.
            </p>
            {sepoliaBalance !== null && (
              <p className="text-xs text-slate-400">
                Sepolia balance: <span className={parseFloat(sepoliaBalance) < 0.001 ? 'text-red-400' : 'text-emerald-400'}>{sepoliaBalance} ETH</span>
                {parseFloat(sepoliaBalance) < 0.001 && (
                  <a href="https://sepoliafaucet.com" target="_blank" rel="noreferrer"
                    className="ml-2 text-cyan-400 underline inline-flex items-center gap-0.5">
                    Get Sepolia ETH <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
            )}
            {deployStatus === 'done' ? (
              <div className="space-y-2">
                <p className="text-emerald-400 text-sm font-medium">✅ Deployed!</p>
                <p className="text-xs font-mono text-slate-300 break-all bg-slate-800 rounded p-2">{deployedAddress}</p>
                <p className="text-xs text-amber-300">Set <code>VITE_ETH_HTLC_CONTRACT={deployedAddress}</code> in Vercel env vars and <code>ETH_HTLC_CONTRACT={deployedAddress}</code> on the VPS, then redeploy.</p>
                <a href={`https://sepolia.etherscan.io/address/${deployedAddress}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline">
                  View on Etherscan <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Wallet password (to sign deploy tx)</label>
                  <input type="password" value={deployPassword} onChange={e => setDeployPassword(e.target.value)}
                    disabled={deployStatus === 'deploying'}
                    placeholder="Your wallet password"
                    className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:border-cyan-500 focus:outline-none text-sm disabled:opacity-50" />
                </div>
                {deployError && <p className="text-xs text-red-400">{deployError}</p>}
                <button
                  onClick={handleDeployHTLC}
                  disabled={deployStatus === 'deploying' || !deployPassword.trim() || (sepoliaBalance !== null && parseFloat(sepoliaBalance) < 0.001)}
                  className="w-full px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2">
                  {deployStatus === 'deploying' ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Deploying…</>
                  ) : (
                    <><Rocket className="w-4 h-4" /> Deploy to Sepolia</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deploy BNB HTLC */}
      {walletId && walletEvmAddress && !alreadyDeployedBnb && (
        <div className="pt-6 border-t border-gray-700">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><Rocket className="w-5 h-5 text-yellow-400" /> Deploy BNB HTLC Contract</h3>
          <div className="p-4 rounded-xl bg-yellow-900/20 border border-yellow-700/50 space-y-3">
            <p className="text-sm text-gray-400">
              Deploy <code className="text-yellow-300">HashedTimelockETH</code> to BSC Testnet so BNB atomic swaps work.
              Costs ~0.001 tBNB in gas.
            </p>
            {bscTestnetBalance !== null && (
              <p className="text-xs text-slate-400">
                BSC Testnet balance: <span className={parseFloat(bscTestnetBalance) < 0.001 ? 'text-red-400' : 'text-emerald-400'}>{bscTestnetBalance} tBNB</span>
                {parseFloat(bscTestnetBalance) < 0.001 && (
                  <a href="https://testnet.bnbchain.org/faucet-smart" target="_blank" rel="noreferrer"
                    className="ml-2 text-yellow-400 underline inline-flex items-center gap-0.5">
                    Get tBNB <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
            )}
            {deployBnbStatus === 'done' ? (
              <div className="space-y-2">
                <p className="text-emerald-400 text-sm font-medium">✅ Deployed!</p>
                <p className="text-xs font-mono text-slate-300 break-all bg-slate-800 rounded p-2">{deployedBnbAddress}</p>
                <p className="text-xs text-amber-300">Set <code>VITE_BNB_HTLC_CONTRACT={deployedBnbAddress}</code> in Vercel env vars and <code>BNB_HTLC_CONTRACT={deployedBnbAddress}</code> on the VPS, then redeploy.</p>
                <a href={`https://testnet.bscscan.com/address/${deployedBnbAddress}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-yellow-400 hover:underline">
                  View on BSCScan <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Wallet password (to sign deploy tx)</label>
                  <input type="password" value={deployBnbPassword} onChange={e => setDeployBnbPassword(e.target.value)}
                    disabled={deployBnbStatus === 'deploying'}
                    placeholder="Your wallet password"
                    className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:border-yellow-500 focus:outline-none text-sm disabled:opacity-50" />
                </div>
                {deployBnbError && <p className="text-xs text-red-400">{deployBnbError}</p>}
                <button
                  onClick={handleDeployBnbHTLC}
                  disabled={deployBnbStatus === 'deploying' || !deployBnbPassword.trim() || (bscTestnetBalance !== null && parseFloat(bscTestnetBalance) < 0.001)}
                  className="w-full px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2">
                  {deployBnbStatus === 'deploying' ? (
                    <><div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" /> Deploying…</>
                  ) : (
                    <><Rocket className="w-4 h-4" /> Deploy to BSC Testnet</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Change Wallet Password */}
      <div className="pt-6 border-t border-gray-700">
        <h3 className="text-lg font-medium mb-4">🔑 Change Wallet Password</h3>
        <div className="p-4 rounded-xl bg-blue-900/20 border border-blue-700/50">
          <p className="text-sm text-gray-400 mb-3">
            Forgot your wallet password? Reset it using your 12 or 24-word seed phrase.
          </p>
          <button
            onClick={() => { setShowChangePassword(true); setChangePwError(null); setChangePwSuccess(false); }}
            className="px-4 py-2 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 transition-colors text-sm"
          >
            Reset Wallet Password
          </button>
        </div>
      </div>

      {/* Emergency Reset */}
      <div className="pt-6 border-t border-gray-700">
        <ShamirRecoveryPanel userId={userId} />
      </div>

      <div className="pt-6 border-t border-gray-700">
        <h3 className="text-lg font-medium mb-4">⚠️ Emergency Reset</h3>
        <div className="p-4 rounded-xl bg-red-900/20 border border-red-700/50">
          <p className="text-sm text-gray-400 mb-3">
            If you've forgotten your PIN or need to reset security settings, you can reset to Standard tier.
            This requires your wallet password.
          </p>
          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors text-sm"
            >
              Reset to Standard Security
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-red-300 font-medium">
                Warning: This will reset all security settings and remove PIN protection.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Enter Wallet Password
                </label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => {
                    setResetPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter your wallet password"
                  className="w-full px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowResetConfirm(false);
                    setResetPassword('');
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEmergencyReset}
                  disabled={!resetPassword || isProcessing}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  {isProcessing ? 'Verifying...' : 'Confirm Reset'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PIN Setup Modal */}
      {setupMode === 'pin-setup' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Setup 6-Digit PIN</h2>
                <p className="text-sm text-gray-400">Choose a PIN you can remember</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-700/50">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Enter PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setPinInput(value);
                    setError(null);
                  }}
                  placeholder="••••••"
                  className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-center text-2xl tracking-widest"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinConfirm}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setPinConfirm(value);
                    setError(null);
                  }}
                  placeholder="••••••"
                  className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-center text-2xl tracking-widest"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setSetupMode(null);
                    setPinInput('');
                    setPinConfirm('');
                    setError(null);
                  }}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePinSetupSubmit}
                  disabled={pinInput.length !== 6 || pinConfirm.length !== 6}
                  className="flex-1 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PIN Confirmation Modal */}
      {setupMode === 'pin-confirm' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Confirm PIN Setup</h2>
                <p className="text-sm text-gray-400">Review before activating</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-red-900/20 border border-red-700/50">
                <p className="text-sm text-red-300">
                  <strong>Important:</strong> You will need this PIN for all wallet actions. 
                  After 5 wrong attempts, your wallet will be locked for 15 minutes.
                  You can always reset with your password.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSetupMode('pin-setup')}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handlePinSetupComplete}
                  disabled={isProcessing}
                  className="flex-1 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    'Activate Maximum Security'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Downgrade Confirmation Modal */}
      {showDowngradeConfirm && pendingDowngradeTier && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-amber-600 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Confirm Security Downgrade</h2>
                <p className="text-sm text-gray-400">This will reduce your protection level</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-amber-900/20 border border-amber-700/50">
                <p className="text-sm text-amber-300">
                  <strong>Warning:</strong> Downgrading to {pendingDowngradeTier.toUpperCase()} will remove additional security protections.
                  {(currentTier === 'maximum' || currentTier === 'cold') && ' Your PIN-protected high-security mode will be removed.'}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={cancelDowngrade}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDowngrade}
                  disabled={isProcessing}
                  className="flex-1 px-4 py-3 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isProcessing ? 'Processing...' : 'Confirm Downgrade'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Security Scan Modal */}
      {showScanModal && scanResult && (
        <SecurityWarningModal
          result={scanResult}
          onProceed={handleScanModalClose}
          onCancel={handleScanModalClose}
          action="use this wallet"
          allowProceedWithWarnings={true}
        />
      )}

      {/* Change Wallet Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Reset Wallet Password</h2>
                <p className="text-sm text-gray-400">Use your seed phrase to set a new password</p>
              </div>
            </div>

            {changePwSuccess ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-emerald-900/20 border border-emerald-700/50">
                  <p className="text-emerald-400 font-medium">✅ Password updated successfully!</p>
                  <p className="text-sm text-gray-400 mt-1">You can now use your new password to sign transactions.</p>
                </div>
                <button
                  onClick={() => setShowChangePassword(false)}
                  className="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors font-medium"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-700/50 text-amber-300 text-sm">
                  Enter your 12 or 24-word seed phrase and choose a new password.
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Seed Phrase</label>
                  <textarea
                    value={changePwSeedPhrase}
                    onChange={(e) => setChangePwSeedPhrase(e.target.value)}
                    placeholder="word1 word2 word3 ..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 focus:border-blue-500 focus:outline-none resize-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">New Password</label>
                  <input
                    type="password"
                    value={changePwNew}
                    onChange={(e) => setChangePwNew(e.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Confirm New Password</label>
                  <input
                    type="password"
                    value={changePwConfirm}
                    onChange={(e) => setChangePwConfirm(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Re-enter new password"
                    className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {changePwError && (
                  <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-sm">
                    {changePwError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setShowChangePassword(false); setChangePwSeedPhrase(''); setChangePwNew(''); setChangePwConfirm(''); setChangePwError(null); }}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleChangePassword}
                    disabled={isProcessing || !changePwSeedPhrase.trim() || !changePwNew || !changePwConfirm}
                    className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isProcessing ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
