## 🔴 Changes Requested - Please Fix All Issues Before Merge

@Copilot - Please address ALL of the following issues. This PR cannot be merged until these are fixed.

---

## 🔴 CRITICAL - Must Fix (Security Issues)

### 1. Emergency Reset Has No Password Verification
**File:** `client/src/components/Wallet/SecuritySettings.tsx` (lines 210-214)

**Problem:** The UI says emergency reset "requires your wallet password", but `handleEmergencyReset()` performs the reset WITHOUT any password verification. This is misleading and a security issue.

**Fix Required:**
- Add a password input field to the emergency reset confirmation UI
- Import `verifyPassword` from walletService (or create a verification function)
- Verify the password BEFORE calling `emergencySecurityReset()`
- Show an error if the password is incorrect

---

### 2. Security Settings Not User-Scoped (Data Leak Between Users)
**File:** `client/src/lib/securityService.ts` (line 244-245)

**Problem:** `SECURITY_SETTINGS_KEY` is a global key (`'wallet_security_settings'`), but the rest of the wallet uses user-scoped keys like `${key}_${userId}`. This means security tier/PIN settings will bleed between different users on the same browser.

**Fix Required:**
- Change the security settings functions to accept a `userId` parameter
- Use a scoped key like `wallet_security_settings_${userId}`
- Update all callers (SecuritySettings.tsx, SendForm.tsx, etc.) to pass the userId

---

### 3. PIN Removal Race Condition
**File:** `client/src/lib/securityService.ts` (lines 397-401)

**Problem:** In `changeSecurityTier()`, when downgrading from maximum tier:
1. `removePin()` is called - this loads fresh settings, removes PIN, saves
2. Then `saveSecuritySettings(settings)` is called with the ORIGINAL settings object that still has `pinHash`/`pinSalt`
3. This re-introduces the PIN data immediately after removal

**Fix Required:**
```typescript
export function changeSecurityTier(newTier: SecurityTier): void {
  const settings = getSecuritySettings();
  settings.tier = newTier;
  
  // If downgrading from maximum, remove PIN on THIS object
  if (newTier !== 'maximum') {
    delete settings.pinHash;
    delete settings.pinSalt;
    settings.failedPinAttempts = 0;
    settings.pinLockoutUntil = undefined;
  }
  
  saveSecuritySettings(settings);
}
```

---

## 🟡 IMPORTANT - Should Fix

### 4. Hardcoded Passkey Username
**Files:** `client/src/components/Wallet/SecuritySettings.tsx` (lines 111, 157)

**Problem:** `registerPasskey('wallet_user')` uses a hardcoded string instead of the actual `userId` prop.

**Fix:** Change to `registerPasskey(userId)` in both locations.

---

### 5. Unsafe JSON.parse Without Error Handling
**File:** `client/src/lib/securityService.ts` (line 261)

**Problem:** `getSecuritySettings()` calls `JSON.parse(stored)` without try/catch. Corrupted localStorage will crash the app.

**Fix:** Wrap in try/catch, return defaults on parse error:
```typescript
try {
  return JSON.parse(stored);
} catch {
  localStorage.removeItem(SECURITY_SETTINGS_KEY);
  return defaultSettings;
}
```

---

### 6. Comment Mismatch
**File:** `client/src/lib/securityService.ts` (lines 15-16)

**Problem:** Comment says "SHA-256 hash of PIN" but implementation uses PBKDF2-SHA256 with 100k iterations.

**Fix:** Update comment to: `// PBKDF2-SHA256 derived hash of PIN (100k iterations, Tier 3 only)`

---

## 🟢 CLEANUP - Nice to Have

### 7. Remove Unused Code
- `client/src/lib/securityService.ts` line 5: Remove unused imports `authenticateWithPasskey`, `isPasskeyAuthenticated`
- `client/src/components/Wallet/SecuritySettings.tsx` lines 12, 15: Remove unused imports `SECURITY_REQUIREMENTS`, `PinEntryModal`
- `client/src/components/Wallet/SecuritySettings.tsx` line 35: Remove unused state `resetPassword`
- `client/src/components/Wallet/SecuritySettings.tsx` line 222: Remove unused variable `color`
- `client/src/components/Wallet/SendForm.tsx` line 35: Remove unused state `pendingAction` (or use it)

---

## ✅ Verification Checklist

After making changes, please verify:
- [ ] Emergency reset requires and verifies password before resetting
- [ ] Security settings are stored per-user (test with different userIds)
- [ ] Downgrading from Maximum tier properly removes PIN data
- [ ] Passkey registration uses actual userId
- [ ] No TypeScript/lint errors
- [ ] App builds successfully

Please push fixes and let me know when ready for re-review.