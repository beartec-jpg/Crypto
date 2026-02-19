# BearTec Cold Signer PWA

Air-gapped Progressive Web App for secure transaction signing using Shamir Secret Sharing.

## Overview

The Cold Signer is a standalone PWA designed to run permanently offline on a dedicated Android device. It stores one encrypted Shamir share and signs transactions without ever exposing private keys to the internet.

## Security Model

### Shamir Secret Sharing (2-of-3)
- Your wallet is split into 3 shares
- Any 2 shares can reconstruct the full wallet
- Share 1: Stored in hot wallet (encrypted)
- Share 2: Stored in cold signer (encrypted, offline)
- Share 3: Paper backup (safety deposit box)

### Encryption
- AES-256-GCM encryption
- PBKDF2 key derivation (100,000 iterations)
- Password-protected share storage
- IndexedDB for encrypted local storage

### Transaction Signing Flow
1. Hot wallet creates unsigned transaction
2. Hot wallet generates QR code with transaction + Share 1
3. Cold signer scans QR code
4. User reviews transaction details
5. User authenticates with PIN + password
6. Cold signer reconstructs wallet from Share 1 + Share 2
7. Transaction is signed offline
8. Cold signer displays signed transaction as QR code
9. Hot wallet scans signed QR and broadcasts

## Supported Chains
- Ethereum (ETH)
- Binance Smart Chain (BSC)
- XRP Ledger (XRP)

## Installation

### Prerequisites
- Dedicated Android phone (never used for other purposes)
- No SIM card installed
- Factory reset recommended before setup

### Setup Instructions

1. **On a computer with internet:**
   ```bash
   cd cold-signer
   npm install
   npm run build
   ```

2. **Deploy the build:**
   - Upload `dist/` folder to your hosting
   - Or serve locally and access via local network

3. **On the cold signer device (one-time only):**
   - Connect to WiFi temporarily
   - Visit the cold signer URL
   - Click "Add to Home Screen" to install PWA
   - Open the app and load Share 2
   - Create a strong password to encrypt the share
   - **Turn off WiFi and mobile data permanently**
   - Never connect this device to internet again

## Usage

### Daily Operation
1. Open cold signer app on offline device
2. Tap "Scan Transaction QR"
3. Scan QR code from hot wallet
4. Review transaction details carefully
5. Enter PIN and password
6. Wait for signing to complete
7. Scan the signed transaction QR with hot wallet

### Security Best Practices

**CRITICAL:**
- ❌ **NEVER** connect the cold signer device to internet after setup
- ❌ **NEVER** install other apps on the cold signer device
- ❌ **NEVER** share your password or PIN
- ✅ **ALWAYS** verify transaction details before signing
- ✅ **ALWAYS** keep Share 3 in a secure offline location
- ✅ **ALWAYS** keep the device physically secure

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Architecture

### Components
- `App.tsx` - Main application with step flow
- `QRScanner.tsx` - Camera-based QR code scanning
- `QRDisplay.tsx` - Signed transaction QR display
- `TransactionPreview.tsx` - Transaction details review
- `ShareManager.tsx` - Encrypted share loading
- `AuthGate.tsx` - PIN + password authentication

### Services
- `shamirService.ts` - Shamir Secret Sharing (2-of-3)
- `coldCrypto.ts` - AES-256-GCM encryption
- `coldSigner.ts` - Multi-chain transaction signing
- `offlineStorage.ts` - IndexedDB encrypted storage

## Security Considerations

### What This Protects Against
✅ Private key theft via internet
✅ Malware on hot wallet device
✅ Phishing attacks
✅ Remote attacks
✅ Single point of failure (with 2-of-3 splitting)

### What This Does NOT Protect Against
❌ Physical theft of cold signer + password
❌ Loss of 2 or more shares
❌ Malicious transaction details (always verify!)
❌ Physical attacks (keep device secure)

### Memory Safety
JavaScript strings are immutable, so true memory zeroing is not possible. However:
- Private keys exist in memory only during signing
- Signing happens in isolated scope
- References are cleared after use
- No private keys stored unencrypted

## Recovery

### If Cold Signer Device Is Lost
- Use Share 1 (hot wallet) + Share 3 (backup)
- Set up a new cold signer device
- Generate new shares for better security

### If Hot Wallet Is Compromised
- Immediately move funds using cold signer + backup share
- Create new wallet with new shares

### If Both Shares Are Lost
- If you have Share 3 (backup), you can recover
- If 2+ shares are lost, funds are **permanently unrecoverable**

## Technical Details

### Dependencies
- React 18.2.0
- ethers.js 6.13.0 (EVM signing)
- xrpl 3.0.0 (XRP signing)
- secrets.js-grempe 2.0.0 (Shamir Secret Sharing)
- jsqr 1.4.0 (QR scanning)
- qrcode 1.5.3 (QR generation)
- idb 8.0.0 (IndexedDB wrapper)

### PWA Configuration
- Service Worker for offline caching
- Standalone display mode
- 192x192 and 512x512 icons
- Emerald theme color (#10b981)

## License

MIT

## Disclaimer

This software is provided "as is" without warranty. Users are responsible for:
- Properly securing their shares
- Keeping backup shares safe
- Verifying transaction details
- Physical security of devices
- Following security best practices

Improper use can result in permanent loss of funds.
