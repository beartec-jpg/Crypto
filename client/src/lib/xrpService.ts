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
  private client: Client | null = null;
  private isConnecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private readonly mainnetUrl = 'wss://xrplcluster.com/'; // Public cluster
  private readonly testnetUrl = 'wss://s.altnet.rippletest.net:51233/';
  
  /**
   * Get or create WebSocket client connection
   */
  private async getClient(useMainnet: boolean): Promise<Client> {
    const wsUrl = useMainnet ? this.mainnetUrl : this.testnetUrl;
    
    // Return existing connected client if same network
    if (this.client && this.client.url === wsUrl && this.client.isConnected()) {
      return this.client;
    }
    
    // Disconnect old client if switching networks
    if (this.client && this.client.isConnected()) {
      await this.client.disconnect();
    }
    
    // Wait for existing connection attempt
    if (this.isConnecting && this.connectionPromise) {
      await this.connectionPromise;
      if (this.client && this.client.isConnected()) {
        return this.client;
      }
    }
    
    // Create new connection
    this.isConnecting = true;
    this.client = new Client(wsUrl, {
      connectionTimeout: 10000,
    });
    
    this.connectionPromise = this.client.connect();
    
    try {
      await this.connectionPromise;
      return this.client;
    } catch (error) {
      console.error('Failed to connect to XRPL:', error);
      throw error;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }
  
  /**
   * Fetch XRP account balance with retry logic
   */
  async getBalance(address: string, useMainnet = true, retries = 3): Promise<XRPBalanceResult | null> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const client = await this.getClient(useMainnet);
        
        const response = await client.request({
          command: 'account_info',
          account: address,
          ledger_index: 'validated',
        });
        
        if (response.result?.account_data) {
          const accountData = response.result.account_data;
          const balanceDrops = accountData.Balance;
          const balanceXRP = dropsToXrp(balanceDrops);
          
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
          return null;
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Disconnect and reconnect on retry
          if (this.client && this.client.isConnected()) {
            await this.client.disconnect();
          }
        }
      }
    }
    
    console.error('Failed to fetch XRP balance after all retries:', lastError?.message);
    throw lastError || new Error('Failed to fetch XRP balance');
  }
  
  /**
   * Fetch XRP account transaction history
   */
  async getTransactions(address: string, useMainnet = true, limit = 20): Promise<any[]> {
    try {
      const client = await this.getClient(useMainnet);
      
      const response = await client.request({
        command: 'account_tx',
        account: address,
        ledger_index_min: -1,
        ledger_index_max: -1,
        limit,
      });
      
      if (response.result?.transactions) {
        return response.result.transactions;
      }
      
      return [];
    } catch (error: any) {
      if (error.data?.error === 'actNotFound') {
        return [];
      }
      
      console.error('Failed to fetch XRP transactions:', error.message);
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
      console.error('Failed to fetch XRP ledger info:', error.message);
      return null;
    }
  }
  
  /**
   * Cleanup - disconnect client
   */
  async disconnect(): Promise<void> {
    if (this.client && this.client.isConnected()) {
      await this.client.disconnect();
    }
    this.client = null;
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
