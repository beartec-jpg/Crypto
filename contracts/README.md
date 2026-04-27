# contracts/

Solidity contracts for the QBTC multi-chain atomic swap system.

## HashedTimelockETH.sol

Native ETH (and BNB on BSC) Hashed Timelock Contract. Deploy on each network where ETH/BNB atomic swaps are needed.

**Compiler:** Solidity `^0.8.20`  
**Optimisation:** Enable with 200 runs

---

## Deploy via Remix (recommended for testnet)

### 1. Open Remix

Go to [remix.ethereum.org](https://remix.ethereum.org)

### 2. Create the file

In the File Explorer, create `contracts/HashedTimelockETH.sol` and paste the contents of [HashedTimelockETH.sol](./HashedTimelockETH.sol).

### 3. Compile

- Click the **Solidity Compiler** tab (left sidebar)
- Select compiler `0.8.20` (or any `0.8.x`)
- Enable **Optimization** → 200 runs
- Click **Compile HashedTimelockETH.sol**

### 4. Deploy on Sepolia (ETH testnet)

- Click the **Deploy & Run** tab
- **Environment:** `Injected Provider - MetaMask`
- Switch MetaMask to **Sepolia Testnet** (chainId 11155111)
- Make sure you have Sepolia ETH ([faucet](https://sepoliafaucet.com))
- Select contract: `HashedTimelockETH`
- Click **Deploy**
- Copy the deployed contract address → this is `VITE_ETH_HTLC_CONTRACT` / `ETH_HTLC_CONTRACT`

### 5. Deploy on BSC Testnet (BNB swaps)

- Switch MetaMask to **BSC Testnet** (chainId 97)
  - RPC: `https://data-seed-prebsc-1-s1.bnbchain.org:8545`
  - Get testnet BNB from [bnb faucet](https://testnet.bnbchain.org/faucet-smart)
- Deploy the **same** `HashedTimelockETH` contract
- Copy the deployed address → this is `VITE_BNB_HTLC_CONTRACT` / `BNB_HTLC_CONTRACT`

---

## After deployment — update env vars

### Client (`/` root `.env`):

```env
# Ethereum Sepolia — native ETH HTLC
VITE_ETH_HTLC_CONTRACT=0x<sepolia_deployed_address>
VITE_ETH_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
VITE_ETH_CHAIN_ID=11155111

# BSC Testnet — native BNB HTLC
VITE_BNB_HTLC_CONTRACT=0x<bsc_testnet_deployed_address>
VITE_BNB_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
VITE_BNB_CHAIN_ID=97
```

### Swap Server (`/opt/swap-server/swap-server/.env`):

```env
# Ethereum Sepolia — native ETH HTLC monitor
ETH_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
ETH_HTLC_CONTRACT=0x<sepolia_deployed_address>

# BSC Testnet — native BNB HTLC monitor
BNB_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
BNB_HTLC_CONTRACT=0x<bsc_testnet_deployed_address>
```

After updating the server `.env`, run:
```bash
ssh root@204.168.175.194
systemctl restart swap-server
journalctl -u swap-server -n 5 --no-pager
# Should now show: [monitors] EvmMonitor(ETH): started  +  EvmMonitor(BNB): started
```

---

## Production deployment (mainnet)

For mainnet, deploy to:
- **Ethereum Mainnet** (chainId 1) — same contract, same process
- **BSC Mainnet** (chainId 56)

Update `VITE_ETH_CHAIN_ID=1`, `VITE_BNB_CHAIN_ID=56`, set mainnet RPC URLs, and set `VITE_SWAP_NETWORK=mainnet`.
