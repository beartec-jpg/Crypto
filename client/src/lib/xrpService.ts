// client/src/lib/xrpService.ts
// Dedicated XRP Ledger service using official xrpl.js library

import { Client, Wallet as XRPLWallet, xrpToDrops, dropsToXrp } from 'xrpl';

interface XRPBalanceResult {
  balance: string;
  sequence: number;
  ownerCount: number;
  previousTxnID?: string;
}

class XRPLService {
  private mainnetClient: Client | null = null;
  private testnetClient: Client | null = null;
  private mainnetConnecting: Promise<Client> | null = null;
  private testnetConnecting: Promise<Client> | null = null;
  private readonly mainnetUrls = [
    'wss://xrplcluster.com/',
    'wss://s1.ripple.com/',
    'wss://s2.ripple.com/',
    'wss://xrpl.ws/'
  ];
  private readonly testnetUrl = 'wss://s.altnet.rippletest.net:51233/';
  private currentMainnetUrlIndex = 0;

  /**
   * Get or create WebSocket client connection with fallback support.
   * Uses SEPARATE clients for mainnet and testnet to prevent race conditions.
   * Made public to allow access from xrpReserveService and tokenService.
   */
  async getClient(useMainnet: boolean): Promise<Client> {
    // Route to the correct per-network slot
    const existing: Client | null = useMainnet ? this.mainnetClient : this.testnetClient;
    const wsUrl = useMainnet
      ? this.mainnetUrls[this.currentMainnetUrlIndex]
      : this.testnetUrl;

    // Return existing connected client if alive
    if (existing && existing.isConnected()) {
      try {
        await Promise.race([
          existing.request({ command: 'ping' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('ping timeout')), 3000)),
        ]);
        return existing;
      } catch {
        console.warn('⚠️ Stale XRPL connection detected, reconnecting...');
        try { await existing.disconnect(); } catch {}
        if (useMainnet) this.mainnetClient = null;
        else this.testnetClient = null;
      }
    }

    // If a connection attempt is already in progress for this network, await it
    const inFlight = useMainnet ? this.mainnetConnecting : this.testnetConnecting;
    if (inFlight) {
      return inFlight;
    }

    // Start a new connection attempt
    const connectPromise = this._connect(useMainnet, wsUrl);
    if (useMainnet) this.mainnetConnecting = connectPromise;
    else this.testnetConnecting = connectPromise;

    try {
      const client = await connectPromise;
      if (useMainnet) this.mainnetClient = client;
      else this.testnetClient = client;
      return client;
    } finally {
      if (useMainnet) this.mainnetConnecting = null;
      else this.testnetConnecting = null;
    }
  }

  private async _connect(useMainnet: boolean, _wsUrl: string): Promise<Client> {
    const maxAttempts = useMainnet ? this.mainnetUrls.length : 1;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const currentUrl = useMainnet
        ? this.mainnetUrls[this.currentMainnetUrlIndex]
        : this.testnetUrl;

      try {
        console.log(`🔌 Connecting to XRPL ${useMainnet ? 'MAINNET' : 'TESTNET'} at ${currentUrl}...`);
        const client = new Client(currentUrl, { connectionTimeout: 10000 });
        await client.connect();
        console.log(`✅ Connected to XRP ${useMainnet ? 'MAINNET' : 'TESTNET'} at ${currentUrl}`);
        if (useMainnet) this.currentMainnetUrlIndex = 0;
        return client;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`❌ Failed to connect to ${currentUrl}:`, error);
        if (useMainnet && attempt < maxAttempts - 1) {
          this.currentMainnetUrlIndex = (this.currentMainnetUrlIndex + 1) % this.mainnetUrls.length;
          console.log(`🔄 Trying fallback URL: ${this.mainnetUrls[this.currentMainnetUrlIndex]}`);
        }
      }
    }

    throw lastError || new Error('Failed to connect to XRPL');
  }

  /**
   * Fetch XRP account balance with retry logic
   */
  async getBalance(address: string, useMainnet = true, retries = 3): Promise<XRPBalanceResult | null> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🔍 Fetching XRP balance (attempt ${attempt}/${retries}) from ${useMainnet ? 'MAINNET' : 'TESTNET'} for:`, address);
        
        const client = await this.getClient(useMainnet);
        
        const response = await client.request({
          command: 'account_info',
          account: address,
          ledger_index: 'validated',
        });
        
        if (response.result?.account_data) {
          const accountData = response.result.account_data;
          const balanceDrops = String(accountData.Balance);
          const balanceXRP = String(dropsToXrp(balanceDrops));
          
          console.log('✅ XRP Balance:', balanceXRP, 'XRP');
          
          return {
            balance: balanceXRP,
            sequence: accountData.Sequence,
            ownerCount: accountData.OwnerCount,
            previousTxnID: accountData.PreviousTxnID,
          };
        }
        
        return null;
      } catch (error: any) {
        lastError = error;
        
        // Account not found is not a retry-able error
        if (error.data?.error === 'actNotFound') {
          console.warn('⚠️ XRP account not found (never activated)');
          return null;
        }
        
        console.warn(`❌ Attempt ${attempt} failed:`, error.message);
        
        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Disconnect and reconnect on retry
          const slot = useMainnet ? this.mainnetClient : this.testnetClient;
          if (slot && slot.isConnected()) {
            await slot.disconnect();
          }
          if (useMainnet) this.mainnetClient = null;
          else this.testnetClient = null;
        }
      }
    }
    
    console.error('❌ Failed to fetch XRP balance after all retries:', lastError?.message);
    throw lastError || new Error('Failed to fetch XRP balance');
  }
  
  /**
   * Fetch XRP account transaction history
   */
  async getTransactions(address: string, useMainnet = true, limit = 20): Promise<any[]> {
    try {
      console.log(`🔍 Fetching XRP transactions from ${useMainnet ? 'MAINNET' : 'TESTNET'} for:`, address);
      
      const client = await this.getClient(useMainnet);
      
      const response = await client.request({
        command: 'account_tx',
        account: address,
        ledger_index_min: -1,
        ledger_index_max: -1,
        limit,
      });
      
      if (response.result?.transactions) {
        console.log(`✅ Found ${response.result.transactions.length} XRP transactions`);
        return response.result.transactions;
      }
      
      return [];
    } catch (error: any) {
      if (error.data?.error === 'actNotFound') {
        console.warn('⚠️ XRP account not found');
        return [];
      }
      
      console.error('❌ Failed to fetch XRP transactions:', error.message);
      return [];
    }
  }
  
  /**
   * Validate XRP address format
   */
  isValidAddress(address: string): boolean {
    try {
      // XRP Classic addresses start with 'r' and are 25-35 characters
      if (!address.startsWith('r')) return false;
      if (address.length < 25 || address.length > 35) return false;
      
      // Check if it's a valid base58 string (basic check)
      const base58Regex = /^[rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz]+$/;
      return base58Regex.test(address);
    } catch {
      return false;
    }
  }
  
  /**
   * Get current ledger info
   */
  async getLedgerInfo(useMainnet = true): Promise<number | null> {
    try {
      const client = await this.getClient(useMainnet);
      
      const response = await client.request({
        command: 'ledger',
        ledger_index: 'validated',
      });
      
      return response.result?.ledger_index || null;
    } catch (error: any) {
      console.error('❌ Failed to fetch XRP ledger info:', error.message);
      return null;
    }
  }
  
  /**
   * Cleanup - disconnect both clients
   */
  async disconnect(): Promise<void> {
    for (const client of [this.mainnetClient, this.testnetClient]) {
      if (client && client.isConnected()) {
        try { await client.disconnect(); } catch {}
      }
    }
    this.mainnetClient = null;
    this.testnetClient = null;
    console.log('🔌 Disconnected from XRPL');
  }
}

// Export singleton instance
export const xrplService = new XRPLService();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    xrplService.disconnect();
  });
}
