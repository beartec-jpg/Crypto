import { useState, useEffect } from 'react';
import { AlertTriangle, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { getLegacyAddressForRecovery } from '@/lib/walletService';
import { fetchEthereumBalance } from '@/lib/balanceService';
import { ethers } from 'ethers';

interface RecoveryToolProps {
  walletId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RecoveryTool({ walletId, onClose, onSuccess }: RecoveryToolProps) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'password' | 'confirm' | 'sending' | 'success'>('password');
  
  const [legacyAddress, setLegacyAddress] = useState<string>('');
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [legacyBalance, setLegacyBalance] = useState<string>('0');
  const [legacyPrivateKey, setLegacyPrivateKey] = useState<string>('');

  const handleCheckLegacyAddress = async () => {
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get legacy address info
      const result = await getLegacyAddressForRecovery(walletId, password);
      
      if (!result) {
        throw new Error('Failed to derive legacy address');
      }

      setLegacyAddress(result.legacyAddress);
      setCurrentAddress(result.currentAddress);
      setLegacyPrivateKey(result.legacyPrivateKey);

      // Fetch balance from old address
      const balance = await fetchEthereumBalance(result.legacyAddress);
      setLegacyBalance(balance);

      console.log('💰 Legacy address balance:', balance, 'ETH');

      if (parseFloat(balance) === 0) {
        setError('No ETH found on legacy address. Your funds may already be recovered. Note: This only checks ETH mainnet - BSC funds use the same address.');
        return;
      }

      setStep('confirm');
    } catch (err: any) {
      setError(err.message || 'Failed to check legacy address');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransfer = async () => {
    setIsLoading(true);
    setError(null);
    setStep('sending');

    try {
      // Create wallet from legacy private key
      const wallet = new ethers.Wallet('0x' + legacyPrivateKey);

      // Connect to provider
      const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
      const walletWithProvider = wallet.connect(provider);

      // Get current gas prices
      const feeData = await provider.getFeeData();
      
      // Calculate max amount to send (balance - gas fees)
      const balance = await provider.getBalance(wallet.address);
      const gasLimit = 21000n;
      const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei');
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei');
      
      const gasCost = gasLimit * maxFeePerGas;
      const amountToSend = balance - gasCost;

      if (amountToSend <= 0n) {
        throw new Error('Insufficient balance to cover gas fees');
      }

      console.log('💸 Sending', ethers.formatEther(amountToSend), 'ETH');
      console.log('⛽ Gas cost:', ethers.formatEther(gasCost), 'ETH');

      // Build and send transaction
      const tx = await walletWithProvider.sendTransaction({
        to: currentAddress,
        value: amountToSend,
        gasLimit: gasLimit,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
      });

      console.log('📡 Transaction sent:', tx.hash);
      console.log('⏳ Waiting for confirmation...');

      // Wait for confirmation
      const receipt = await tx.wait();

      console.log('✅ Transaction confirmed!', receipt?.hash);

      setStep('success');
      
      // Clear sensitive data
      setLegacyPrivateKey('');
      setPassword('');

      setTimeout(() => {
        onSuccess();
      }, 3000);

    } catch (err: any) {
      console.error('❌ Transfer failed:', err);
      setError(err.message || 'Failed to transfer ETH');
      setStep('confirm');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-md w-full p-6 space-y-4">
        <div className="flex items-center space-x-2 text-yellow-500">
          <AlertTriangle className="w-6 h-6" />
          <h2 className="text-xl font-bold">ETH/BSC Recovery Tool</h2>
        </div>

        <p className="text-gray-300 text-sm">
          Due to a previous bug, your ETH and BSC funds may be on an incorrectly derived address. 
          This tool will help you recover them. (Note: BSC uses the same address as ETH)
        </p>

        {step === 'password' && (
          <>
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Wallet Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white"
                placeholder="Enter your password"
                onKeyDown={(e) => e.key === 'Enter' && handleCheckLegacyAddress()}
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleCheckLegacyAddress}
                className="flex-1 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-500 flex items-center justify-center"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Check Legacy Address'
                )}
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div className="bg-gray-700/50 rounded-lg p-4 space-y-3">
              <div>
                <div className="text-xs text-gray-400 mb-1">Legacy Address (Old)</div>
                <div className="text-sm text-gray-300 font-mono break-all">{legacyAddress}</div>
                <div className="text-lg text-green-400 font-bold mt-1">{legacyBalance} ETH</div>
              </div>

              <div className="flex justify-center">
                <ArrowRight className="w-6 h-6 text-gray-500" />
              </div>

              <div>
                <div className="text-xs text-gray-400 mb-1">Current Address (Correct)</div>
                <div className="text-sm text-gray-300 font-mono break-all">{currentAddress}</div>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-3 text-sm text-yellow-400">
              <strong>⚠️ Warning:</strong> This will send ALL ETH from the legacy address to your current address. 
              Gas fees will be deducted automatically. <br />
              <strong>Note:</strong> BSC uses the same address, so if you have BSC funds, you'll need to transfer them separately using the same legacy private key on BSC network.
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleTransfer}
                className="flex-1 px-4 py-2 bg-green-600 rounded-lg hover:bg-green-500 flex items-center justify-center"
                disabled={isLoading}
              >
                Transfer ETH
              </button>
            </div>
          </>
        )}

        {step === 'sending' && (
          <div className="text-center py-8">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
            <p className="text-gray-300">Sending transaction...</p>
            <p className="text-sm text-gray-500 mt-2">This may take a minute</p>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <p className="text-xl font-bold text-green-400">ETH Recovered!</p>
            <p className="text-sm text-gray-400 mt-2">Your wallet will refresh automatically</p>
            <p className="text-xs text-gray-500 mt-1">Note: If you have BSC funds on the legacy address, repeat this process on BSC network</p>
          </div>
        )}
      </div>
    </div>
  );
}
