# Manual Testing Guide for ETH/BNB Send Transaction Flow

## Prerequisites
1. Set up the application with a database connection
2. Create a wallet with some test funds on Ethereum testnet or BSC testnet
3. Have the wallet password ready

## Test Scenarios

### Test 1: Gas Estimation for ETH
**Steps:**
1. Navigate to Wallet page
2. Click on "Send" tab
3. Select Ethereum chain
4. Enter a valid Ethereum address (e.g., `0x742d35Cc6634C0532925a3b844Bc454e4438f44e`)
5. Enter an amount (e.g., `0.001`)
6. Click "Review Transaction"

**Expected Result:**
- Gas estimation should occur automatically
- Transaction preview modal should show:
  - Amount: 0.001 ETH
  - Recipient address
  - Estimated network fee (should be realistic, ~0.00042 ETH for simple transfer)
  - Total cost calculation

### Test 2: Gas Estimation for BSC
**Steps:**
1. Switch to BSC chain
2. Enter a valid BSC address
3. Enter an amount (e.g., `0.01`)
4. Click "Review Transaction"

**Expected Result:**
- Gas estimation should occur (BSC fees should be lower than ETH)
- Transaction preview should show BNB fees

### Test 3: Insufficient Balance Error (CRITICAL - No Signing)
**Steps:**
1. On Send form, enter amount larger than your balance (e.g., `100 ETH`)
2. Click "Review Transaction"
3. Click "Confirm" on preview modal
4. Enter your password in the password modal

**Expected Result:**
- Password modal should appear
- After entering password, should show error message:
  "Insufficient balance. You need X.XXXXXX ETH but only have Y.YYYYYY ETH."
- Transaction should NOT be signed
- Form should preserve data (address and amount still filled)
- User can correct the amount and retry

### Test 4: Wrong Password Error
**Steps:**
1. Enter valid recipient and amount
2. Click "Review Transaction" → "Confirm"
3. Enter WRONG password in password modal
4. Click "Confirm"

**Expected Result:**
- Error message should appear: "Incorrect password. Please try again." or similar
- Transaction should NOT be signed
- Form data preserved
- User can retry with correct password

### Test 5: Network Error During Gas Estimation
**Steps:**
1. Disconnect internet or use invalid RPC endpoint
2. Try to send a transaction

**Expected Result:**
- Should show error: "Unable to estimate fees. Please check your connection and try again."
- No password modal should appear
- Form data preserved

### Test 6: Successful Transaction Broadcast
**Steps:**
1. Enter valid recipient address
2. Enter small amount that you have sufficient balance for
3. Click "Review Transaction" → "Confirm"
4. Enter correct password
5. Wait for transaction steps

**Expected Result:**
1. Transaction steps should appear:
   - "Estimating Fees..." (with spinner)
   - "Signing Transaction..." (with spinner)
   - "Broadcasting..." (with spinner)
2. Success modal should appear showing:
   - Green checkmark icon
   - "Transaction Sent!" title
   - Transaction details (amount, recipient, fee)
   - Transaction hash (with copy button)
   - "View on Etherscan" link (or BscScan for BSC)
3. Clicking copy button should copy tx hash to clipboard
4. Clicking "View on Explorer" should open block explorer in new tab
5. Form should be cleared after closing success modal

### Test 7: Pending Transaction Tracking
**Steps:**
1. After successful broadcast (Test 6)
2. Close success modal
3. Navigate to "Dashboard" tab
4. Look at "Recent Transactions" section

**Expected Result:**
1. Should see a pending transaction card at the top with:
   - Icon showing it's pending (spinning loader)
   - "Sending X ETH" header
   - "To: 0x1234...5678" (truncated address)
   - "Just now" timestamp
   - Progress bar showing confirmations (0/6 for ETH, 0/15 for BSC)
   - Transaction steps:
     - ✓ Authenticated (complete)
     - ✓ Signed (complete)
     - ✓ Broadcast (complete)
     - ⏳ Confirming (0/6 blocks) (active)
     - ○ Complete (pending)
   - "View Transaction" button linking to explorer

### Test 8: Transaction Confirmation Updates
**Steps:**
1. Keep the dashboard open after Test 7
2. Wait for blockchain confirmations (~12 seconds per block for ETH, ~3 seconds for BSC)
3. Observe the pending transaction card

**Expected Result:**
1. Progress bar should update as confirmations increase
2. Steps should update: "Confirming (1/6 blocks)", "Confirming (2/6 blocks)", etc.
3. After reaching required confirmations:
   - Status should change to green checkmark
   - "✓ Transaction Confirmed" badge
   - All steps marked complete
   - Progress bar at 100%

### Test 9: Form Data Preservation on Error
**Steps:**
1. Enter recipient: `0x742d35Cc6634C0532925a3b844Bc454e4438f44e`
2. Enter amount: `100` (too high)
3. Try to send
4. See error about insufficient balance
5. Check form fields

**Expected Result:**
- Recipient field should still contain the address
- Amount field should still contain `100`
- User can edit amount and retry without re-entering recipient

### Test 10: Cancel Transaction
**Steps:**
1. Enter valid data
2. Click "Review Transaction"
3. Click "Confirm" in preview
4. In password modal, click "Cancel"

**Expected Result:**
- Password modal should close
- Should return to send form
- Form data should be preserved
- No transaction should be created

## Edge Cases to Test

### Test 11: Invalid Recipient Address
**Steps:**
1. Enter invalid address format (e.g., `not-an-address`)
2. Try to proceed

**Expected Result:**
- "Review Transaction" button should be disabled
- Error message: "Invalid ethereum address format" (or bsc)

### Test 12: Zero or Negative Amount
**Steps:**
1. Enter amount: `0` or `-1`

**Expected Result:**
- "Review Transaction" button should be disabled
- Error message shown

### Test 13: Multiple Pending Transactions
**Steps:**
1. Send first transaction
2. Immediately send second transaction
3. Check dashboard

**Expected Result:**
- Both pending transactions should appear in "Recent Transactions"
- Each should track independently
- Confirmations should update separately

## Security Verification

### Test 14: Verify Balance Check Happens BEFORE Signing
**Important Security Test**

**Steps:**
1. Add console logging to `sendService.ts` in `checkSufficientBalance()`
2. Send transaction with insufficient funds
3. Check browser console logs

**Expected Result:**
- Console should show balance check happened
- Error about insufficient balance should appear
- Console should NOT show any signing activity
- No private key should be accessed
- No transaction should be created

## Performance Tests

### Test 15: Gas Estimation Speed
**Steps:**
1. Start timer
2. Enter valid data and click "Review Transaction"
3. Measure time until preview appears

**Expected Result:**
- Should complete in < 5 seconds
- UI should remain responsive

### Test 16: Polling Frequency
**Steps:**
1. Send a transaction
2. Open browser DevTools Network tab
3. Observe API calls

**Expected Result:**
- Transaction status should be polled every ~10 seconds
- Should stop polling after confirmation
- No excessive API calls

## UI/UX Tests

### Test 17: Responsive Design
**Steps:**
1. Test on different screen sizes
2. Check all modals (Password, Success, Transaction Preview)

**Expected Result:**
- All modals should be centered and readable
- Forms should be usable on mobile
- No horizontal scrolling

### Test 18: Loading States
**Steps:**
1. Observe all loading indicators during transaction flow

**Expected Result:**
- Spinner should be visible during:
  - Gas estimation
  - Transaction signing
  - Broadcasting
- Loading states should be clear and not confusing

### Test 19: Error Recovery
**Steps:**
1. Cause an error (wrong password)
2. Fix the issue
3. Retry

**Expected Result:**
- Should be able to retry without refreshing page
- Previous error should clear when new attempt starts
- No lingering error states

## Integration Tests

### Test 20: End-to-End Happy Path
**Steps:**
1. Create wallet
2. Fund wallet with small amount
3. Send transaction
4. Track until confirmed
5. Check balance

**Expected Result:**
- Complete flow should work seamlessly
- Balance should decrease by (amount + fee)
- Transaction should appear in history
- Recipient should receive funds

## Notes for Testers

- Use testnet for all tests (Sepolia for ETH, BSC Testnet)
- Keep small amounts for testing
- Document any unexpected behavior
- Check browser console for errors
- Test in multiple browsers (Chrome, Firefox, Safari)
- Test with different wallet states (locked, unlocked)

## Known Limitations

1. Only ETH and BSC chains are supported currently
2. Requires passkey authentication to be enabled
3. Wallet must have backup verified before sending
4. Database connection required for full app functionality
