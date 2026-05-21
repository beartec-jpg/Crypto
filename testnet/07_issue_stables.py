#!/usr/bin/env python3
"""
07_issue_stables.py
────────────────────
Issues qUSDC (currency code "QUC") and qUSDT (currency code "QUT") on the
qXRP testnet and creates AMM liquidity pools for both pairs.

Steps:
  1. Generate two issuer accounts (funded from genesis)
  2. Set DefaultRipple on each issuer (AccountSet, asfDefaultRipple = 8)
  3. Genesis sets trust lines to each issuer (TrustSet)
  4. Issuers send tokens to genesis (Payment IOU)
  5. Create AMM pools: qXRP/qUSDC and qXRP/qUSDT

Idempotent — if stables_state.json exists and issuers are funded, skips setup.

Usage:
    python3 /opt/qxrp/testnet/07_issue_stables.py
    python3 /opt/qxrp/testnet/07_issue_stables.py --dry-run
    python3 /opt/qxrp/testnet/07_issue_stables.py --reset   # re-issue from scratch
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from common import (
    GENESIS_ADDR, GENESIS_SEED,
    rpc, rpc_any, get_seq, sign_and_submit, wait_validated,
    log, ok, warn, err,
)

# ── Constants ──────────────────────────────────────────────────────────────────
DROPS_PER_XRP  = 1_000_000
STATE_FILE     = "/opt/qxrp/testnet/stables_state.json"

QUSDC_CURRENCY = "QUC"   # qUSDC on-chain currency code (3-char)
QUSDT_CURRENCY = "QUT"   # qUSDT on-chain currency code (3-char)

QUSDC_SUPPLY   = "10000000"   # 10 million qUSDC
QUSDT_SUPPLY   = "10000000"   # 10 million qUSDT

# AMM initial liquidity: 100,000 qXRP + 100,000 tokens → price = 1 token/qXRP
AMM_XRP_DROPS  = str(100_000 * DROPS_PER_XRP)    # 100,000 qXRP in drops
AMM_TOKEN_AMT  = "100000"                          # 100,000 tokens

AMM_TRADING_FEE = 500   # 0.5% (in 1/100000ths — 500 = 0.5%)

# Initial DEX liquidity: genesis creates sell offers for tokens
# Rate: 1 qXRP buys 1 token  (i.e., sell 1M tokens for 1M qXRP)
DEX_OFFER_XRP_AMOUNT  = str(1_000_000 * DROPS_PER_XRP)  # 1M qXRP in drops
DEX_OFFER_TOKEN_AMOUNT = "1000000"                        # 1M tokens

ISSUER_RESERVE_XRP = 15   # enough for reserve + fees


def load_state() -> dict:
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save_state(state: dict):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)
    ok(f"State saved to {STATE_FILE}")


def account_exists(address: str) -> bool:
    try:
        r = rpc(5005, "account_info", {"account": address, "ledger_index": "validated"})
        return "account_data" in r
    except Exception:
        return False


def get_account_balance(address: str) -> int:
    """Returns balance in drops, or 0 if not found."""
    try:
        r = rpc(5005, "account_info", {"account": address, "ledger_index": "validated"})
        return int(r["account_data"]["Balance"])
    except Exception:
        return 0


def get_trust_line(address: str, currency: str, issuer: str) -> dict | None:
    """Returns trust line dict if it exists, else None."""
    try:
        r = rpc(5005, "account_lines", {"account": address, "ledger_index": "validated"})
        for line in r.get("lines", []):
            if line.get("currency") == currency and line.get("account") == issuer:
                return line
    except Exception:
        pass
    return None


def derive_account_from_seed(seed: str) -> str:
    """Derive address from seed using server-side wallet_propose."""
    r = rpc(5005, "wallet_propose", {"passphrase": seed})
    if r.get("status") == "success":
        return r["account_id"]
    raise RuntimeError(f"wallet_propose failed: {r}")


def submit_tx(seed: str, tx_json: dict, dry_run: bool, label: str) -> bool:
    """Sign and submit a transaction. Returns True on success."""
    if dry_run:
        log(f"[DRY RUN] {label}: {json.dumps(tx_json, indent=2)}")
        return True

    result, tx_hash = sign_and_submit(seed, tx_json)
    if result in ("tesSUCCESS", "terQUEUED"):
        ok(f"{label}: {result} ({tx_hash[:12]}…)")
        final = wait_validated(tx_hash)
        if final != "tesSUCCESS":
            warn(f"{label}: validated as {final}")
            return final in ("tesSUCCESS",)
        return True
    else:
        err(f"{label}: {result}")
        return False


# ── Step 1: Create issuer accounts ────────────────────────────────────────────

def create_issuer(state: dict, token: str, dry_run: bool) -> dict:
    """Generate and fund an issuer account. Returns {seed, address}."""
    key = f"{token}_issuer"
    if key in state:
        address = state[key]["address"]
        if account_exists(address):
            log(f"{token} issuer already funded: {address}")
            return state[key]
        warn(f"{token} issuer in state but not on-chain; re-funding")

    # Generate a deterministic-ish seed via wallet_propose with a fixed passphrase
    passphrase = f"qxrp-testnet-{token.lower()}-issuer-v1"
    r = rpc(5005, "wallet_propose", {"passphrase": passphrase})
    if r.get("status") != "success":
        raise RuntimeError(f"wallet_propose failed: {r}")

    seed    = r["master_seed"]
    address = r["account_id"]
    log(f"{token} issuer: {address}")

    # Fund from genesis
    fund_drops = str(ISSUER_RESERVE_XRP * DROPS_PER_XRP)
    submit_tx(GENESIS_SEED, {
        "TransactionType": "Payment",
        "Account":    GENESIS_ADDR,
        "Destination": address,
        "Amount":     fund_drops,
    }, dry_run, f"Fund {token} issuer")

    if not dry_run:
        # Wait for account to appear on-chain
        for _ in range(20):
            time.sleep(3)
            if account_exists(address):
                break
        else:
            raise RuntimeError(f"{token} issuer account never activated")

    issuer_info = {"seed": seed, "address": address}
    state[key] = issuer_info
    if not dry_run:
        save_state(state)
    return issuer_info


# ── Step 2: Set DefaultRipple ─────────────────────────────────────────────────

def set_default_ripple(issuer: dict, token: str, dry_run: bool):
    """Set DefaultRipple flag on issuer account."""
    submit_tx(issuer["seed"], {
        "TransactionType": "AccountSet",
        "Account":  issuer["address"],
        "SetFlag":  8,    # asfDefaultRipple
    }, dry_run, f"Set DefaultRipple on {token} issuer")


# ── Step 3: Set trust lines from genesis ──────────────────────────────────────

def set_trust_line(currency: str, issuer_address: str, limit: str, token: str, dry_run: bool):
    """Genesis sets a trust line to the issuer."""
    existing = get_trust_line(GENESIS_ADDR, currency, issuer_address)
    if existing:
        log(f"Trust line {token} already set (limit: {existing.get('limit')})")
        return
    submit_tx(GENESIS_SEED, {
        "TransactionType": "TrustSet",
        "Account": GENESIS_ADDR,
        "LimitAmount": {
            "currency": currency,
            "issuer":   issuer_address,
            "value":    limit,
        },
    }, dry_run, f"TrustSet genesis → {token} issuer")


# ── Step 4: Issue tokens ──────────────────────────────────────────────────────

def issue_tokens(issuer: dict, currency: str, supply: str, token: str, dry_run: bool):
    """Issue tokens from issuer to genesis."""
    existing = get_trust_line(GENESIS_ADDR, currency, issuer["address"])
    if existing and float(existing.get("balance", "0")) >= float(supply) * 0.99:
        log(f"{token} already fully issued to genesis")
        return
    submit_tx(issuer["seed"], {
        "TransactionType": "Payment",
        "Account":     issuer["address"],
        "Destination": GENESIS_ADDR,
        "Amount": {
            "currency": currency,
            "issuer":   issuer["address"],
            "value":    supply,
        },
    }, dry_run, f"Issue {supply} {token} to genesis")


# ── Step 5: Create DEX liquidity offers ──────────────────────────────────────

def dex_offer_exists(currency: str, issuer_address: str) -> bool:
    """Check if genesis already has a sell offer for this token."""
    try:
        r = rpc(5005, "account_offers", {"account": GENESIS_ADDR, "ledger_index": "validated"})
        for offer in r.get("offers", []):
            taker_gets = offer.get("taker_gets", {})
            if isinstance(taker_gets, dict):
                if taker_gets.get("currency") == currency and taker_gets.get("issuer") == issuer_address:
                    return True
    except Exception:
        pass
    return False


def create_dex_offers(currency: str, issuer_address: str, token: str, dry_run: bool):
    """Genesis creates a sell offer: sell tokens for qXRP at 1:1 rate."""
    if dex_offer_exists(currency, issuer_address):
        log(f"DEX sell offer for {token} already exists")
        return

    # TakerGets = what genesis gives (tokens)
    # TakerPays = what genesis wants (qXRP drops)
    # Rate: 1 token = 1 qXRP
    submit_tx(GENESIS_SEED, {
        "TransactionType": "OfferCreate",
        "Account": GENESIS_ADDR,
        "TakerGets": {
            "currency": currency,
            "issuer":   issuer_address,
            "value":    DEX_OFFER_TOKEN_AMOUNT,
        },
        "TakerPays": DEX_OFFER_XRP_AMOUNT,
    }, dry_run, f"OfferCreate: sell {DEX_OFFER_TOKEN_AMOUNT} {token} @ 1 qXRP each")


def amm_exists(currency: str, issuer_address: str) -> bool:
    """Check if an AMM pool exists for qXRP/token."""
    try:
        r = rpc(5005, "amm_info", {
            "asset":  {"currency": "XRP"},
            "asset2": {"currency": currency, "issuer": issuer_address},
            "ledger_index": "validated",
        })
        return "amm" in r
    except Exception:
        return False


def create_amm(currency: str, issuer_address: str, token: str, dry_run: bool):
    """Try to create an AMM pool; fall back to DEX offers if AMM is disabled."""
    if amm_exists(currency, issuer_address):
        log(f"AMM pool qXRP/{token} already exists")
        return

    result, tx_hash = ("", "")
    if not dry_run:
        result, tx_hash = sign_and_submit(GENESIS_SEED, {
            "TransactionType": "AMMCreate",
            "Account": GENESIS_ADDR,
            "Amount":  AMM_XRP_DROPS,
            "Amount2": {
                "currency": currency,
                "issuer":   issuer_address,
                "value":    AMM_TOKEN_AMT,
            },
            "TradingFee": AMM_TRADING_FEE,
        })

    if dry_run or result == "temDISABLED":
        warn(f"AMM not available ({result}) — creating DEX liquidity offer instead")
        create_dex_offers(currency, issuer_address, token, dry_run)
    elif result in ("tesSUCCESS", "terQUEUED"):
        ok(f"AMMCreate qXRP/{token}: {result} ({tx_hash[:12]}…)")
    else:
        err(f"AMMCreate qXRP/{token}: {result}")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Issue qUSDC and qUSDT on qXRP testnet")
    parser.add_argument("--dry-run", action="store_true", help="Print TXs but don't submit")
    parser.add_argument("--reset",   action="store_true", help="Delete state and start fresh")
    args = parser.parse_args()

    dry_run = args.dry_run

    if args.reset and not dry_run:
        if os.path.exists(STATE_FILE):
            os.remove(STATE_FILE)
            warn("State file removed. Starting fresh.")

    state = load_state()

    print()
    print("═" * 60)
    print("  qXRP Stablecoin Issuance")
    print("═" * 60)
    print(f"  Genesis:   {GENESIS_ADDR}")
    print(f"  qUSDC:     {QUSDC_CURRENCY} (supply: {QUSDC_SUPPLY})")
    print(f"  qUSDT:     {QUSDT_CURRENCY} (supply: {QUSDT_SUPPLY})")
    print(f"  AMM fee:   {AMM_TRADING_FEE / 1000:.1f}%")
    if dry_run:
        print("  *** DRY RUN — no transactions will be submitted ***")
    print()

    tokens = [
        ("qUSDC", QUSDC_CURRENCY, QUSDC_SUPPLY),
        ("qUSDT", QUSDT_CURRENCY, QUSDT_SUPPLY),
    ]

    for token_name, currency, supply in tokens:
        print(f"── {token_name} ──────────────────────────────────────────────")

        # 1. Create / fund issuer
        issuer = create_issuer(state, token_name, dry_run)

        # 2. DefaultRipple
        set_default_ripple(issuer, token_name, dry_run)

        # 3. Trust line genesis → issuer
        set_trust_line(currency, issuer["address"], supply, token_name, dry_run)

        # 4. Issue tokens
        issue_tokens(issuer, currency, supply, token_name, dry_run)

        # 5. AMM
        create_amm(currency, issuer["address"], token_name, dry_run)

        print()

    if not dry_run:
        save_state(state)

    print("═" * 60)
    print("  Summary")
    print("═" * 60)
    for token_name, currency, _ in tokens:
        key = f"{token_name}_issuer"
        addr = state.get(key, {}).get("address", "(unknown — dry run)")
        print(f"  {token_name} ({currency}) issuer: {addr}")
    print()
    print("  Add to .env.production / .env.local:")
    for token_name, currency, _ in tokens:
        key = f"{token_name}_issuer"
        addr = state.get(key, {}).get("address", "")
        env_key = f"NEXT_PUBLIC_{token_name.upper()}_ISSUER"
        print(f"  {env_key}={addr}")
        env_key2 = f"NEXT_PUBLIC_{token_name.upper()}_CURRENCY"
        print(f"  {env_key2}={currency}")
    print()


if __name__ == "__main__":
    main()
