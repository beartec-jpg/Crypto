# ETH/BNB Send Transaction Flow - Visual Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WALLET PAGE (Wallet.tsx)                             │
│                                                                              │
│  ┌────────────────────┐                    ┌──────────────────────┐        │
│  │  Dashboard Tab     │                    │    Send Tab          │        │
│  │                    │                    │                      │        │
│  │  WalletDashboard   │                    │    SendForm          │        │
│  │  Component         │                    │    Component         │        │
│  └────────────────────┘                    └──────────────────────┘        │
│           │                                           │                      │
│           │ pendingTransactions                      │ onAddPendingTx       │
│           │                                           │                      │
│           └───────────────┬───────────────────────────┘                     │
│                           │                                                  │
│                  ┌────────▼─────────┐                                       │
│                  │ usePendingTrans  │                                       │
│                  │ actions Hook     │                                       │
│                  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         SEND FORM FLOW                                       │
│                                                                              │
│  1. USER INPUT                                                               │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │  Recipient: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e  │               │
│  │  Amount:    0.01 ETH                                     │               │
│  │  [Review Transaction]                                    │               │
│  └─────────────────────────────────────────────────────────┘               │
│                           │                                                  │
│                           ▼                                                  │
│  2. SECURITY CHECKS (Existing)                                              │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │  ✓ PIN Entry (if Tier 2/3)                             │               │
│  │  ✓ Passkey Auth (if Tier 2/3)                          │               │
│  │  ✓ Security Scan (if Tier 3)                           │               │
│  └─────────────────────────────────────────────────────────┘               │
│                           │                                                  │
│                           ▼                                                  │
│  3. TRANSACTION PREVIEW                                                      │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │  TransactionPreviewModal                                 │               │
│  │  Amount:       0.01 ETH                                  │               │
│  │  Recipient:    0x742d...4e                               │               │
│  │  Est. Fee:     0.00042 ETH                               │               │
│  │  Total:        0.01042 ETH                               │               │
│  │  [Cancel]  [Confirm]                                     │               │
│  └─────────────────────────────────────────────────────────┘               │
│                           │                                                  │
│                           ▼                                                  │
│  4. PASSWORD MODAL (New!)                                                   │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │  PasswordModal.tsx                                       │               │
│  │  🔒 Enter Password to Sign                              │               │
│  │  Password: [••••••••] [👁]                               │               │
│  │  [Cancel]  [Confirm]                                     │               │
│  └─────────────────────────────────────────────────────────┘               │
│                           │                                                  │
│                           ▼                                                  │
│  5. TRANSACTION PROCESSING                                                   │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │  Step Indicator (Overlay)                                │               │
│  │                                                           │               │
│  │         [  ⟳  ]                                          │               │
│  │                                                           │               │
│  │    Estimating Fees...                                    │               │
│  │    Please wait                                           │               │
│  └─────────────────────────────────────────────────────────┘               │
│                           │                                                  │
│        ┌──────────────────┼──────────────────┐                             │
│        │                  │                  │                              │
│        ▼                  ▼                  ▼                              │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐                         │
│  │ Gas Est  │      │ Balance  │      │  Sign &  │                         │
│  │          │      │  Check   │      │ Broadcast│                         │
│  │ ~2 sec   │  →   │ CRITICAL │  →   │  ~3 sec  │                         │
│  └──────────┘      └──────────┘      └──────────┘                         │
│                                                                              │
│  Uses sendService.ts:                                                        │
│  • estimateGas()           - Get gas limit & price                          │
│  • checkSufficientBalance() - Validate BEFORE signing ⚠️                    │
│  • buildTransaction()      - Construct tx object                            │
│  • signTransaction()       - Sign with wallet (via walletService)           │
│  • broadcastTransaction()  - Send to network                                │
│                           │                                                  │
│                           ▼                                                  │
│  6. SUCCESS MODAL (New!)                                                    │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │  TransactionSuccessModal.tsx                             │               │
│  │                                                           │               │
│  │         ✅ Transaction Sent!                             │               │
│  │                                                           │               │
│  │  Amount:      0.01 ETH                                   │               │
│  │  To:          0x742d...4e                                │               │
│  │  Fee:         0.00042 ETH (~$1.23)                       │               │
│  │  Tx Hash:     0xabcd...efgh  [📋 Copy]                   │               │
│  │                                                           │               │
│  │  [View on Etherscan ↗]   [Close]                         │               │
│  └─────────────────────────────────────────────────────────┘               │
│                           │                                                  │
│                           ▼                                                  │
│  7. ADD TO PENDING TRANSACTIONS                                              │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │  usePendingTransactions.addPendingTransaction()          │               │
│  │  • Stores in React state                                 │               │
│  │  • Persists to localStorage                              │               │
│  │  • Starts polling for status                             │               │
│  └─────────────────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    PENDING TRANSACTION TRACKING                              │
│                                                                              │
│  DASHBOARD TAB - Recent Transactions Section                                │
│  ┌───────────────────────────────────────────────────────────┐             │
│  │  📤 Sending 0.01 ETH                     Just now          │             │
│  ├───────────────────────────────────────────────────────────┤             │
│  │  Progress: ████████░░░░ 4/6 confirmations                 │             │
│  │                                                            │             │
│  │  ✓ Authenticated                                          │             │
│  │  ✓ Signed                                                 │             │
│  │  ✓ Broadcast                                              │             │
│  │  ⏳ Confirming (4/6 blocks)                               │             │
│  │  ○ Complete                                               │             │
│  │                                                            │             │
│  │  [View Transaction ↗]                                     │             │
│  └───────────────────────────────────────────────────────────┘             │
│                                                                              │
│  Status Updates (Every 10 seconds):                                         │
│  • Polls getTransactionStatus() for each pending tx                         │
│  • Updates confirmations count                                              │
│  • Updates progress bar                                                     │
│  • Updates step indicators                                                  │
│  • Changes to "Confirmed" when done                                         │
│                                                                              │
│  PendingTransactionCard.tsx handles:                                        │
│  • Visual representation                                                    │
│  • Progress calculation                                                     │
│  • Step status icons                                                        │
│  • Time formatting ("Just now", "5m ago")                                   │
│  • Link to block explorer                                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING FLOW                                  │
│                                                                              │
│  ERROR SCENARIO: Insufficient Balance                                       │
│  ┌────────────────────────────────────────────────────────┐                │
│  │  1. User enters amount: 100 ETH                        │                │
│  │  2. User enters password                                │                │
│  │  3. Gas estimation succeeds: 0.00042 ETH               │                │
│  │  4. Balance check: FAIL                                 │                │
│  │     Balance: 0.5 ETH                                    │                │
│  │     Required: 100.00042 ETH                             │                │
│  │  5. ❌ Error shown in password modal:                  │                │
│  │     "Insufficient balance. You need 100.00042 ETH      │                │
│  │      but only have 0.5 ETH."                            │                │
│  │  6. ✅ Transaction NOT signed                          │                │
│  │  7. ✅ Form data preserved (100 ETH still in field)   │                │
│  │  8. User corrects amount to 0.1 ETH                    │                │
│  │  9. User clicks Review → Confirm → Success!            │                │
│  └────────────────────────────────────────────────────────┘                │
│                                                                              │
│  Other Error Scenarios:                                                     │
│  • Wrong password → Show error, preserve form, allow retry                 │
│  • Network error (gas) → Show friendly message, preserve form              │
│  • Network error (broadcast) → Show error, preserve form                   │
│  • Invalid address → Disable submit button                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         SERVICE LAYER ARCHITECTURE                           │
│                                                                              │
│  sendService.ts                                                              │
│  ┌────────────────────────────────────────────────────────────┐            │
│  │                                                              │            │
│  │  RPC PROVIDERS                                              │            │
│  │  • ETH: https://eth.llamarpc.com                           │            │
│  │  • BSC: https://bsc-dataseed.binance.org                   │            │
│  │                                                              │            │
│  │  FUNCTIONS:                                                 │            │
│  │  ┌──────────────────────────────────────────────────────┐ │            │
│  │  │ estimateGas()                                         │ │            │
│  │  │ • Calls provider.estimateGas()                       │ │            │
│  │  │ • Adds 20% buffer (GAS_BUFFER_PERCENT)               │ │            │
│  │  │ • Fetches gas prices (EIP-1559 or legacy)            │ │            │
│  │  │ • Calculates USD fee (via CoinGecko)                 │ │            │
│  │  └──────────────────────────────────────────────────────┘ │            │
│  │                                                              │            │
│  │  ┌──────────────────────────────────────────────────────┐ │            │
│  │  │ checkSufficientBalance() ⚠️ CRITICAL                 │ │            │
│  │  │ • Fetches on-chain balance                           │ │            │
│  │  │ • Calculates: required = amount + fee                │ │            │
│  │  │ • Returns: { sufficient, balance, required }          │ │            │
│  │  │ • MUST be called BEFORE signing                      │ │            │
│  │  └──────────────────────────────────────────────────────┘ │            │
│  │                                                              │            │
│  │  ┌──────────────────────────────────────────────────────┐ │            │
│  │  │ buildTransaction()                                    │ │            │
│  │  │ • Gets nonce from provider                            │ │            │
│  │  │ • Constructs TransactionRequest                       │ │            │
│  │  │ • Sets chain ID (1 for ETH, 56 for BSC)              │ │            │
│  │  │ • Configures gas (EIP-1559 type 2 or legacy type 0)  │ │            │
│  │  └──────────────────────────────────────────────────────┘ │            │
│  │                                                              │            │
│  │  ┌──────────────────────────────────────────────────────┐ │            │
│  │  │ broadcastTransaction()                                │ │            │
│  │  │ • Calls provider.broadcastTransaction(signedTx)       │ │            │
│  │  │ • Returns tx hash and explorer URL                    │ │            │
│  │  │ • Handles nonce and gas errors                        │ │            │
│  │  └──────────────────────────────────────────────────────┘ │            │
│  │                                                              │            │
│  │  ┌──────────────────────────────────────────────────────┐ │            │
│  │  │ getTransactionStatus()                                │ │            │
│  │  │ • Fetches transaction receipt                         │ │            │
│  │  │ • Calculates confirmations                            │ │            │
│  │  │ • Returns status (pending/confirming/confirmed/failed)│ │            │
│  │  │ • Used by polling hook                                │ │            │
│  │  └──────────────────────────────────────────────────────┘ │            │
│  └────────────────────────────────────────────────────────────┘            │
│                                                                              │
│  walletService.ts (Existing)                                                 │
│  ┌────────────────────────────────────────────────────────────┐            │
│  │  signTransaction()                                          │            │
│  │  • Unlocks wallet with password                             │            │
│  │  • Gets private key for chain                               │            │
│  │  • Signs tx with ethers.js Wallet                           │            │
│  │  • Verifies signature                                       │            │
│  │  • Returns signed transaction string                        │            │
│  └────────────────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         STATE MANAGEMENT                                     │
│                                                                              │
│  usePendingTransactions Hook                                                 │
│  ┌────────────────────────────────────────────────────────────┐            │
│  │  STATE:                                                      │            │
│  │  • transactions: PendingTransaction[]                       │            │
│  │    - Stored in React state                                  │            │
│  │    - Persisted to localStorage                              │            │
│  │                                                              │            │
│  │  EFFECTS:                                                    │            │
│  │  • Load from localStorage on mount                          │            │
│  │  • Save to localStorage on change                           │            │
│  │  • Poll status every 10 seconds                             │            │
│  │    - Uses Promise.allSettled for parallel polling          │            │
│  │    - Updates confirmations                                  │            │
│  │    - Updates status and steps                               │            │
│  │    - Stops polling when confirmed/failed                    │            │
│  │                                                              │            │
│  │  FUNCTIONS:                                                  │            │
│  │  • addPendingTransaction(tx) - Add new tx                   │            │
│  │  • removeTransaction(id) - Remove specific tx               │            │
│  │  • clearOldTransactions() - Clean up old txs                │            │
│  └────────────────────────────────────────────────────────────┘            │
│                                                                              │
│  localStorage Schema:                                                        │
│  {                                                                           │
│    "pending_transactions": [                                                 │
│      {                                                                       │
│        "id": "0xhash-1234567890",                                           │
│        "hash": "0xabcdef...",                                               │
│        "chain": "ethereum",                                                 │
│        "from": "0x742d...",                                                 │
│        "to": "0x1234...",                                                   │
│        "amount": "0.01",                                                    │
│        "token": "ETH",                                                      │
│        "status": "confirming",                                              │
│        "confirmations": 4,                                                  │
│        "requiredConfirmations": 6,                                          │
│        "timestamp": 1234567890,                                             │
│        "explorerUrl": "https://etherscan.io/tx/0x...",                      │
│        "steps": [...]                                                       │
│      }                                                                       │
│    ]                                                                         │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘

LEGEND:
  ✓ = Complete/Success
  ⏳ = In Progress
  ○ = Pending
  ❌ = Error/Failed
  🔒 = Security Feature
  ⚠️ = Critical
  ↗ = External Link
  📋 = Copy
```
