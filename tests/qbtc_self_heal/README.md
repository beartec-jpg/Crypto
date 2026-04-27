# QBTC Self-Heal Ops Package

This package automates the controls you requested:

1. Canonical-node-led self-healing for lagging nodes.
2. Continuous health checks every 30-60s.
3. Auto restart/reconnect on lag, flatline, or low-peer conditions.
4. Auto recopy from canonical if restart does not recover node.
5. Scheduled UTXO protection by auto-triggering consolidation when count is high.
6. Pre-test gate to block stress tests until network is healthy.

## Files

- `config.example.json`: Template config for your 3-node environment.
- `self_heal.py`: Continuous monitor and healer.
- `preflight_gate.py`: Pass/fail readiness gate for flood tests.
- `run_self_heal.sh`: Wrapper to run self-heal loop.
- `launch_ramp_guarded.py`: Gate-aware launcher for N2/N3/N4 ramp.
- `launch_ramp_guarded.sh`: One-liner shell wrapper for guarded ramp launch.
- `pretest_readiness.py`: Strict funding/timing/readiness checker.
- `pretest_readiness.sh`: Wrapper for strict readiness checks.
- `launch_when_ready.sh`: Waits for readiness PASS, then launches ramp.

## Setup

1. Copy template and set node SSH passwords:

```bash
cp tests/qbtc_self_heal/config.example.json tests/qbtc_self_heal/config.json
```

2. Edit `tests/qbtc_self_heal/config.json`:
- Fill `nodes.<NODE>.ssh_password`.
- Confirm `canonical_node` is your preferred source (currently `N2`).
- Keep `fixed_peers` populated with N1/N2/N3/N4.

3. Make scripts executable:

```bash
chmod +x tests/qbtc_self_heal/*.py tests/qbtc_self_heal/*.sh
```

## Run modes

### One-shot check/heal cycle

```bash
python3 tests/qbtc_self_heal/self_heal.py --config tests/qbtc_self_heal/config.json --once
```

### Continuous self-heal daemon (foreground)

```bash
bash tests/qbtc_self_heal/run_self_heal.sh tests/qbtc_self_heal/config.json
```

### Continuous self-heal daemon (background)

```bash
nohup bash tests/qbtc_self_heal/run_self_heal.sh tests/qbtc_self_heal/config.json > /tmp/qbtc_self_heal.log 2>&1 &
```

### Dry-run (no changes)

```bash
python3 tests/qbtc_self_heal/self_heal.py --config tests/qbtc_self_heal/config.json --once --dry-run
```

## Pre-test gate

Run before flood/ramp:

```bash
python3 tests/qbtc_self_heal/preflight_gate.py --config tests/qbtc_self_heal/config.json --nodes N2,N3,N4
```

Gate criteria:

1. All specified load nodes at same height.
2. `peers >= 3` on each load node.
3. No stuck signature in last 5 minutes:
- `not punishing manually connected peer`
- `invalid header received`
- `Misbehaving`

If any check fails, script exits non-zero and prints `GATE=FAIL` with reasons.

## Notes

- Recopy excludes wallet files by design (`wallets/`) to avoid wallet corruption.
- If `stop_canonical_during_recopy=true`, recopy is consistent but briefly pauses canonical node.
- UTXO auto-consolidation expects `/tmp/consolidate2.py` on canonical node.

## One-line onboarding launchers

For stress-test onboarding, update launchers to include self-heal and preflight gate.

### 1) Start self-heal daemon on control host

```bash
nohup bash tests/qbtc_self_heal/run_self_heal.sh tests/qbtc_self_heal/config.json > /tmp/qbtc_self_heal.log 2>&1 &
```

### 2) Validate cluster before load launch

```bash
python3 tests/qbtc_self_heal/preflight_gate.py --config tests/qbtc_self_heal/config.json --nodes N2,N3,N4
```

### 3) Gate-aware launcher pattern

Use this pattern in any one-line ramp/flood launcher so load only starts on PASS:

```bash
python3 tests/qbtc_self_heal/preflight_gate.py --config tests/qbtc_self_heal/config.json --nodes N2,N3,N4 \
	&& echo "GATE PASS -> launch load" \
	|| { echo "GATE FAIL -> abort"; exit 1; }
```

### 4) Ready-to-use guarded ramp launcher

```bash
bash tests/qbtc_self_heal/launch_ramp_guarded.sh tests/qbtc_self_heal/config.json
```

Optional overrides:

```bash
N2_PEAK=45 N3_PEAK=65 N4_PEAK=60 DURATION=3600 bash tests/qbtc_self_heal/launch_ramp_guarded.sh
```

### 5) Wait-until-ready launcher

This launcher waits until strict readiness passes (funding confirmed + stable gate), then starts ramp:

```bash
bash tests/qbtc_self_heal/launch_when_ready.sh tests/qbtc_self_heal/config.json
```

Optional timing controls:

```bash
TIMEOUT_MIN=90 INTERVAL_S=20 bash tests/qbtc_self_heal/launch_when_ready.sh
```

### 6) Backward-compatible aliases

Legacy-style names now route to the guarded launcher:

```bash
bash start_ramp_flood.sh
bash launch_ramp_flood.sh
```
