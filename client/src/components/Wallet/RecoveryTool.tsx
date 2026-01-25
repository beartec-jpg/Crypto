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

// RPC providers with fallbacks
const RPC_PROVIDERS = [
  'https://ethereum.publicnode.com',
  'https://eth.drpc.org',
  'https://eth.llamarpc.com',
];

export default function RecoveryTool({ walletId, onClose, onSuccess }: RecoveryToolProps) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'password' | 'confirm' | 'sending' | 'success'>('password');
  
  const [legacyAddress, setLegacyAddress] = useState<string>('');
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [legacyBalance, setLegacyBalance] = useState<string>('0');
  const [legacyPrivateKey, setLegacyPrivateKey] = useState<string>('');

  // Get a working RPC provider with fallback
  const getWorkingProvider = async (): Promise<ethers.JsonRpcProvider> => {
    for (const rpc of RPC_PROVIDERS) {
      try {
        console.log(`🔍 Trying RPC: ${rpc}`);
        const provider = new ethers.JsonRpcProvider(rpc, undefined, {
          staticNetwork: true,
          batchMaxCount: 1,
        });
        
        // Test the provider with timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        );
        await Promise.race([provider.getBlockNumber(), timeoutPromise]);
        
        console.log(`✅ Using RPC: ${rpc}`);
        return provider;
      } catch (err) {
        console.log(`⚠️ RPC failed: ${rpc}`, err);
      }
    }
    throw new Error('All RPC providers failed. Please try again in a moment.');
  };

  // Get balance with retry logic
  const getBalanceWithRetry = async (provider: ethers.JsonRpcProvider, address: string, retries = 3): Promise<bigint> => {
    for (let i = 0; i < retries; i++) {
      try {
        return await provider.getBalance(address);
      } catch (err) {
        if (i === retries - 1) throw err;
        console.log(`⚠️ Balance fetch retry ${i + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    throw new Error('Failed to fetch balance');
  };

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

      // Get a working provider with fallback
      const provider = await getWorkingProvider();
      const walletWithProvider = wallet.connect(provider);

      // Get current gas prices with validation and retry
      console.log('🔍 Fetching gas prices...');
      const feeData = await provider.getFeeData();
      
      // Cap maxFeePerGas at 35 Gwei (reasonable maximum for recovery)
      let maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('25', 'gwei');
      const maxAllowedGas = ethers.parseUnits('35', 'gwei');
      if (maxFeePerGas > maxAllowedGas) {
        console.log('⚠️ Gas price too high, capping at 35 Gwei');
        maxFeePerGas = maxAllowedGas;
      }
      
      // Cap priority fee at 2 Gwei
      let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('1.5', 'gwei');
      const maxAllowedPriority = ethers.parseUnits('2', 'gwei');
      if (maxPriorityFeePerGas > maxAllowedPriority) {
        maxPriorityFeePerGas = maxAllowedPriority;
      }
      
      // Get balance with retry
      console.log('🔍 Fetching balance...');
      const balance = await getBalanceWithRetry(provider, wallet.address);
      const gasLimit = 21000n;
      const gasCost = gasLimit * maxFeePerGas;
      
      console.log('💰 Balance:', ethers.formatEther(balance), 'ETH');
      console.log('⛽ Max Fee Per Gas:', ethers.formatUnits(maxFeePerGas, 'gwei'), 'Gwei');
      console.log('⛽ Priority Fee:', ethers.formatUnits(maxPriorityFeePerGas, 'gwei'), 'Gwei');
      console.log('⛽ Estimated gas cost:', ethers.formatEther(gasCost), 'ETH');

      if (balance <= gasCost) {
        const neededEth = ethers.formatEther(gasCost);
        const hasEth = ethers.formatEther(balance);
        throw new Error(
          `Insufficient balance. Need at least ${neededEth} ETH for gas, but only have ${hasEth} ETH. ` +
          `Current gas price: ${ethers.formatUnits(maxFeePerGas, 'gwei')} Gwei. ` +
          `Try again when gas prices are lower (check etherscan.io/gastracker).`
        );
      }

      const amountToSend = balance - gasCost;

      if (amountToSend < ethers.parseEther('0.001')) {
        throw new Error(
          `After gas fees, only ${ethers.formatEther(amountToSend)} ETH would be transferred. ` +
          `Wait for lower gas prices to transfer a meaningful amount.`
        );
      }

      console.log('💸 Sending', ethers.formatEther(amountToSend), 'ETH');
      console.log('💸 To:', currentAddress);
      console.log('💸 From:', wallet.address);

      // Build and send transaction
      const tx = await walletWithProvider.sendTransaction({
        to: currentAddress,
        value: amountToSend,
        gasLimit: gasLimit,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
      });

      console.log('📡 Transaction sent:', tx.hash);
      console.log('🔍 View on Etherscan: https://etherscan.io/tx/' + tx.hash);
      console.log('⏳ Waiting for confirmation...');

      // Wait for confirmation with timeout
      const receipt = await tx.wait(1);

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
      
      // Better error handling
      let errorMessage = err.message || 'Failed to transfer ETH';
      
      if (err.message.includes('insufficient') || err.message.includes('gas')) {
        errorMessage = `${err.message}\n\n💡 Tip: Ethereum gas prices fluctuate. Check current prices at etherscan.io/gastracker and try again when gas is below 25 Gwei.`;
      } else if (err.message.includes('timeout') || err.message.includes('RPC')) {
        errorMessage = `Network timeout. The Ethereum network may be congested. Please try again in a moment.`;
      }
      
      setError(errorMessage);
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
              <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 text-sm text-red-400 whitespace-pre-wrap">
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
              <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 text-sm text-red-400 whitespace-pre-wrap">
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
