"""
Patch /opt/qxrp/src/tools/dashboard/server.py to fix:
1. Use ledger_entry (not account_objects with node pubkey)
2. BondedAmount (not BondAmount)
3. Bond status as int (0/1/2) not string
4. Add slash_mult display
5. VALIDATOR_ACCOUNT configurable via env
"""

path = "/opt/qxrp/src/tools/dashboard/server.py"

with open(path) as f:
    src = f.read()

# ── Fix 1: Add VALIDATOR_ACCOUNT env var ─────────────────────────────────────
old1 = 'LISTEN_PORT = int(os.environ.get("DASHBOARD_PORT", "8080"))'
new1 = (
    'LISTEN_PORT = int(os.environ.get("DASHBOARD_PORT", "8080"))\n'
    '# Validator account address (consensus key account, NOT node pubkey)\n'
    'VALIDATOR_ACCOUNT = os.environ.get("VALIDATOR_ACCOUNT", "rhTyFgd1P6VN8YdXB9buQUCb47KcgPkSEA")'
)
assert old1 in src, "Fix1: target not found"
src = src.replace(old1, new1)

# ── Fix 2: Replace account_objects block with ledger_entry ───────────────────
old2 = (
    '    # Bond / reputation data (if validator is registered)\n'
    '    bond_data: Dict[str, Any] = {}\n'
    '    if pubkey != "N/A":\n'
    '        bond_data = rpc("account_objects", {\n'
    '            "account": pubkey,\n'
    '            "type": "validator_bond",\n'
    '            "ledger_index": "validated",\n'
    '        })\n'
    '\n'
    '    bond_obj = {}\n'
    '    objects = bond_data.get("account_objects", [])\n'
    '    if objects:\n'
    '        bond_obj = objects[0]\n'
    '\n'
    '    composite_score = bond_obj.get("CompositeScore", "N/A")\n'
    '    bond_status = bond_obj.get("BondStatus", "N/A")\n'
    '    bond_amount = bond_obj.get("BondAmount", "N/A")'
)
new2 = (
    '    # Bond / reputation data via ledger_entry (keyed by validator account, NOT node pubkey)\n'
    '    bond_obj: Dict[str, Any] = {}\n'
    '    if VALIDATOR_ACCOUNT:\n'
    '        le = rpc("ledger_entry", {\n'
    '            "validator_bond": {"account": VALIDATOR_ACCOUNT},\n'
    '            "ledger_index": "validated",\n'
    '        })\n'
    '        bond_obj = le.get("node", {})\n'
    '\n'
    '    _bond_status_int = bond_obj.get("BondStatus", None)\n'
    '    _status_map = {0: "REGISTERED", 1: "BONDED", 2: "UNBONDING"}\n'
    '    bond_status = _status_map.get(_bond_status_int, "N/A") if _bond_status_int is not None else "N/A"\n'
    '    _drops = bond_obj.get("BondedAmount", None)\n'
    '    bond_amount = f"{int(_drops) // 1_000_000:,} qXRP" if _drops is not None else "N/A"\n'
    '    _cs = bond_obj.get("CompositeScore", None)\n'
    '    composite_score = _cs if _cs is not None else "N/A (pre-epoch)"\n'
    '    slash_mult = bond_obj.get("SlashMultiplier", "N/A")'
)
assert old2 in src, f"Fix2: target not found. Searched for:\n{old2}"
src = src.replace(old2, new2)

# ── Fix 3: bond_status == 'bonded' → bond_status == 'BONDED' ─────────────────
src = src.replace("bond_status == 'bonded'", "bond_status == 'BONDED'")

# ── Fix 4: Enhance bond card to show slash multiplier ────────────────────────
src = src.replace(
    '    <div class="mono">Amount: {bond_amount}</div>',
    '    <div class="mono">Amount: {bond_amount} | Slash: {slash_mult}/10000</div>'
)

with open(path, "w") as f:
    f.write(src)

# Verify
with open(path) as f:
    out = f.read()

assert "ledger_entry" in out
assert "BondedAmount" in out
assert "BONDED" in out
assert "VALIDATOR_ACCOUNT" in out
assert "slash_mult" in out
print("dashboard/server.py patched successfully - all assertions pass")
