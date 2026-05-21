#!/usr/bin/env python3
"""
Remote qXRP load test — connects to 37.27.47.236:5005 and injects transactions.
"""
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE_PORT = 5005
BASE_SERVER = "37.27.47.236"

DROPS_PER_QXRP = 1_000_000
GENESIS_SECRET = "masterpassphrase"
GENESIS_ACCOUNT = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
PAYMENT_DROPS = 1_000
FEE_DROPS = 12
FUND_DROPS = 50 * DROPS_PER_QXRP

def rpc(server, port, method, params=None):
    """Issue JSON-RPC call to remote qXRP node."""
    url = f"http://{server}:{port}"
    body = json.dumps({"method": method, "params": [params or {}]}).encode()
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"RPC error: {e}")
        return None

def get_seq(server=BASE_SERVER):
    """Get current ledger sequence."""
    r = rpc(server, BASE_PORT, "server_info")
    if r:
        return r["result"]["info"]["validated_ledger"]["seq"]
    return 0

def payment_tx(src_addr, dest_addr, seq, seed):
    """Create a Payment transaction."""
    return {
        "Account": src_addr,
        "Destination": dest_addr,
        "Amount": str(PAYMENT_DROPS),
        "Fee": str(FEE_DROPS),
        "Sequence": seq,
        "TransactionType": "Payment",
    }

def submit_tx(tx_json, seed, server=BASE_SERVER):
    """Sign and submit a transaction."""
    try:
        # Sign via server
        sign_result = rpc(server, BASE_PORT, "sign", {
            "tx_json": tx_json,
            "secret": seed
        })
        
        if not sign_result or "result" not in sign_result:
            return False
        
        signed_tx = sign_result["result"].get("tx_blob")
        if not signed_tx:
            return False
        
        # Submit
        submit_result = rpc(server, BASE_PORT, "submit", {
            "tx_blob": signed_tx
        })
        
        if submit_result and "result" in submit_result:
            engine_result = submit_result["result"].get("engine_result", "?")
            if engine_result in ["tesSUCCESS", "terQUEUED"]:
                return True
        
        return False
    except Exception as e:
        return False

def main():
    print("\n" + "="*60)
    print("qXRP Remote Load Test")
    print("="*60 + "\n")
    
    # Check network
    print(f"[*] Connecting to {BASE_SERVER}:{BASE_PORT}...")
    seq = get_seq()
    if seq == 0:
        print("[!] Cannot reach network!")
        return
    
    print(f"[✓] Network healthy at ledger {seq}\n")
    
    # Fund test accounts
    print("[*] Setting up test accounts...")
    num_accounts = 20
    test_seeds = []
    for i in range(num_accounts):
        # Generate keypair
        gk = rpc(BASE_SERVER, BASE_PORT, "generate_keypair")
        if gk and "result" in gk:
            seed = gk["result"]["seed"]
            test_seeds.append(seed)
            print(f"  [{i+1}/{num_accounts}] Account seed: {seed[:20]}...")
    
    print(f"\n[*] Submitting transactions ({num_accounts} accounts × 50 txs each = {num_accounts*50} total)...\n")
    
    start_time = time.time()
    success_count = 0
    fail_count = 0
    
    # Simple send loop
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = []
        
        for account_idx, seed in enumerate(test_seeds):
            for tx_num in range(50):
                # Get account key
                gk = rpc(BASE_SERVER, BASE_PORT, "wallet_propose", {"seed": seed})
                if not gk or "result" not in gk:
                    fail_count += 1
                    continue
                
                src = gk["result"]["account"]
                
                # Get sequence
                ai = rpc(BASE_SERVER, BASE_PORT, "account_info", {
                    "account": src,
                    "ledger_index": "current"
                })
                
                if not ai or "result" not in ai:
                    fail_count += 1
                    continue
                
                current_seq = ai["result"]["account_data"]["Sequence"]
                
                # Create payment to genesis
                tx = payment_tx(src, GENESIS_ACCOUNT, current_seq, seed)
                
                # Submit
                result = submit_tx(tx, seed)
                if result:
                    success_count += 1
                else:
                    fail_count += 1
                
                if (account_idx * 50 + tx_num + 1) % 50 == 0:
                    elapsed = time.time() - start_time
                    tps = (success_count + fail_count) / elapsed if elapsed > 0 else 0
                    print(f"  Submitted {account_idx * 50 + tx_num + 1} txs ({success_count}✓ {fail_count}✗) — {tps:.1f} TPS")
    
    elapsed = time.time() - start_time
    total = success_count + fail_count
    tps = total / elapsed if elapsed > 0 else 0
    
    print(f"\n[✓] Test complete:")
    print(f"  Total submitted: {total}")
    print(f"  Successful: {success_count} ({100*success_count/total:.1f}%)" if total > 0 else "  Successful: 0")
    print(f"  Failed: {fail_count}")
    print(f"  Time elapsed: {elapsed:.1f}s")
    print(f"  Throughput: {tps:.1f} TPS\n")

if __name__ == "__main__":
    main()
