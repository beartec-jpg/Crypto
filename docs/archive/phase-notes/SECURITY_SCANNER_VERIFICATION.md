# Security Environment Scanner - Manual Verification Guide

This guide describes how to manually verify the Security Environment Scanner implementation.

## Overview

The Security Environment Scanner has been implemented across 4 main files:
1. `/client/src/lib/securityScanner.ts` - Core security scanning logic
2. `/client/src/components/Wallet/SecurityWarningModal.tsx` - Modal UI for displaying warnings
3. `/client/src/components/Wallet/SendForm.tsx` - Integration with transaction flow
4. `/client/src/components/Wallet/SecuritySettings.tsx` - Manual scan trigger

## Automated Tests

All automated tests pass (12/12):
```bash
npm test -- securityScanner.test.ts
```

## Manual Verification Steps

### 1. Run Security Scan Button (SecuritySettings)

**Access:** Navigate to Wallet → Security Settings

**Expected Behavior:**
- See "Security Environment Scan" section
- Click "Run Security Scan" button
- Button shows loading state: "Scanning Environment..."
- After scan completes, displays result:
  - ✅ Green success message if clean
  - ⚠️ Yellow warning if issues detected
  - 🚫 Red error if critical issues found

**Test Scenarios:**

**Clean Environment:**
1. Open in regular browser window
2. No DevTools open
3. No suspicious extensions
4. Should show: "✅ Environment Secure - No threats detected"

**DevTools Detection:**
1. Open browser DevTools (F12)
2. Dock DevTools to side or bottom
3. Run security scan
4. Should detect window size anomaly (low severity warning)

**Console Tampering Test:**
1. Open browser console
2. Run: `console.log = function() {}`
3. Run security scan
4. Should detect console tampering (high severity)
5. Refresh page to restore

### 2. Transaction Security Scan (SendForm)

**Access:** Navigate to Wallet → Send

**Prerequisites:**
- User must be on Security Tier 3 (Maximum)
- If on Tier 1 or 2, upgrade to Maximum first

**Expected Behavior:**
1. Fill in transaction details:
   - Recipient address
   - Amount to send
2. Click "Review Transaction"
3. Enter PIN if required
4. **For Tier 3 only:** Security scan runs automatically
5. If issues detected, SecurityWarningModal appears
6. User must acknowledge warnings or cancel

**Test Scenarios:**

**Tier 3 - Clean Environment:**
1. Set security to Maximum tier
2. Attempt to send transaction
3. Should proceed directly to transaction preview (no modal)

**Tier 3 - With Warnings:**
1. Open DevTools
2. Attempt to send transaction
3. SecurityWarningModal should appear
4. Should show detected issues
5. User must check "I understand the risks" to proceed
6. Can click "Proceed Anyway" or "Cancel"

**Tier 3 - With Critical Issues:**
1. Open browser console
2. Run: `window.crypto = undefined`
3. Attempt to send transaction
4. SecurityWarningModal should appear
5. Should show critical blocker
6. "Proceed" button should NOT be available
7. User can only cancel

**Tier 1/2 - Quick Check:**
1. Set security to Standard or Enhanced
2. Attempt to send transaction
3. Quick security check runs (no modal)
4. If fails, shows error toast
5. If passes, proceeds to transaction preview

### 3. Security Warning Modal UI

**Check Modal Elements:**

When modal appears, verify it displays:
- ✅ Header with appropriate icon (red/yellow/green)
- Title: "Security Issue Detected" or "Security Warning"
- Summary box explaining the situation
- List of detected issues with:
  - Severity badge (critical/high/medium/low)
  - Issue type and description
  - Details about the threat
- Expandable "Security Recommendations" section
- For warnings: Acknowledgment checkbox
- Action buttons: "Cancel" and "Continue" or "Proceed Anyway"
- Timestamp of scan

### 4. Security Check Types

The scanner checks for:

**DevTools Detection (low-medium severity):**
- Window size anomalies
- Debugger timing
- Firebug presence

**Console Tampering (high severity):**
- Overridden console methods
- Non-native console functions

**Prototype Pollution (high severity):**
- Modifications to Array.prototype
- Modifications to Object.prototype
- Modifications to String.prototype

**Event Hijacking (high severity):**
- Wrapped addEventListener
- Event system tampering

**Script Injection (low-high severity):**
- Suspicious scripts in DOM
- Extension-injected elements
- Known malicious patterns

**Mutation Observer Abuse (high severity):**
- Tampered MutationObserver

**Crypto API Integrity (critical severity):**
- Missing Web Crypto API
- Tampered crypto.getRandomValues
- Missing crypto.subtle methods

## Integration Points

### SendForm.tsx
- Import: `runSecurityScan`, `quickSecurityCheck`
- State: `securityScanResult`, `showSecurityModal`
- Flow:
  1. User clicks "Review Transaction"
  2. Validates inputs
  3. Checks security tier
  4. Tier 3: Runs full scan, shows modal if issues
  5. Tier 1/2: Quick check only
  6. Proceeds to transaction preview

### SecuritySettings.tsx
- Import: `runSecurityScan`, `getSecurityLevel`, `SecurityWarningModal`
- State: `scanResult`, `isScanning`, `showScanModal`
- UI: "Run Security Scan" button in new section
- Shows inline results or full modal for details

## Expected Results Summary

✅ All security checks run without errors
✅ Modal displays correctly with proper styling
✅ User can acknowledge warnings and proceed
✅ Critical issues block proceeding
✅ Integration with Tier 3 transaction flow works
✅ Manual scan in SecuritySettings works
✅ Quick check for Tier 1/2 is fast and unobtrusive
✅ All automated tests pass

## Notes

- Pre-existing build errors in unrelated files are expected and should be ignored
- The scanner is designed to fail gracefully and not block functionality on errors
- DevTools detection may have false positives depending on browser/OS
- Extension detection is heuristic-based and may miss some extensions
