# QBTC Node Stability Fix Report (2026-04-25)

## Scope

This fix package targeted operational node resilience under sustained transaction stress on qbtctestnet.

Important: No consensus or protocol source code in bitcoind was modified in this package. The implemented changes are an operations control layer (health checks, auto-heal, and launch gating).

## Root Causes Observed

1. Sync stall pattern on lagging nodes:
- Nodes could remain behind with IBD false and low/unstable peers.
- Repeated log signature: not punishing manually connected peer.
- Symptom: persistent height flatline while leader nodes advanced.

2. Funding wallet UTXO explosion:
- Mining rewards created thousands of small UTXOs.
- Large send operations failed due to transaction input weight constraints.

3. Stress launch without hard readiness gate:
- Flood/ramp jobs could be started while one node was unhealthy.

## Fixes Implemented

### 1) Continuous self-heal controller

File: tests/qbtc_self_heal/self_heal.py

Implemented controls:

- Poll interval: configurable (default 30 seconds).
- Degraded detection based on:
  - leader lag threshold (default >20 blocks),
  - height flatline across consecutive checks,
  - low peers threshold (default <2).
- Automatic recovery sequence:
  1. restart daemon + reconnect fixed peers,
  2. if still degraded, recopy chain data from canonical node,
  3. restart and re-bootstrap peers.
- Canonical node selection is configurable (current: N2).
- Recovery state persistence stored in /tmp/qbtc_self_heal_state.json.

### 2) UTXO safeguard automation

File: tests/qbtc_self_heal/self_heal.py

Implemented controls:

- Canonical funding wallet UTXO count checked every cycle.
- If count exceeds configured threshold (default 500), auto-start consolidation job.
- Uses existing consolidation script on canonical node: /tmp/consolidate2.py.
- Avoids duplicate starts if consolidation is already running.

### 3) Pre-test hard gate

File: tests/qbtc_self_heal/preflight_gate.py

Implemented controls:

- Validates all load nodes before flood/ramp:
  1. same block height,
  2. peers >= 3 each,
  3. no stuck-signature log pattern in last 5 minutes.
- Returns non-zero on failure and prints explicit reasons.
- Prevents starting stress tests in known-bad topology.

### 4) Runtime wrapper and config

Files:
- tests/qbtc_self_heal/run_self_heal.sh
- tests/qbtc_self_heal/config.json
- tests/qbtc_self_heal/config.example.json

Implemented controls:

- One-command daemon start.
- Unbuffered logging for real-time monitoring.
- Environment-specific configuration externalized from code.

### 5) Operator documentation

File: tests/qbtc_self_heal/README.md

Added setup, run modes, gate usage, and operational notes.

## Validation Results

1. Self-heal correctly identified N3 degraded state in live checks.
2. Automated restart/reconnect + recopy workflow was triggered and completed.
3. N3 recovered to leader height and stable peer count.
4. Preflight gate moved from FAIL to PASS after remediation.
5. Continuous self-heal loop is running with active PID/log tracking.

## Security Note

Current operational config contains live SSH passwords in tests/qbtc_self_heal/config.json.

Immediate hardening:
- chmod 600 tests/qbtc_self_heal/config.json
- Restrict repository exposure and shell history retention.
- Preferred next step: move secrets to environment variables or an out-of-repo secrets file.

## Files Added in This Fix Package

- tests/qbtc_self_heal/self_heal.py
- tests/qbtc_self_heal/preflight_gate.py
- tests/qbtc_self_heal/run_self_heal.sh
- tests/qbtc_self_heal/config.json
- tests/qbtc_self_heal/config.example.json
- tests/qbtc_self_heal/README.md
- QBTC_NODE_FIX_REPORT_20260425.md
