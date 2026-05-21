#!/usr/bin/env python3
"""
Shared constants, helpers, and RPC utilities for the qXRP testnet scripts.
All scripts import from here.
"""

import hashlib
import json
import subprocess
import time
import urllib.request

# ── Network ────────────────────────────────────────────────────────────────────
GENESIS_SEED = "snoPBrXtMeMyMHUVTgbuqAfg1SUTb"
GENESIS_ADDR = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
NETWORK_ID   = 999

# ── Node4 SSH access ───────────────────────────────────────────────────────────
NODE4_HOST     = "46.224.0.140"
NODE4_SSH_PASS = "TCECWmvAdVRr"
NODE4_SSH_USER = "root"

# ── Validator data ─────────────────────────────────────────────────────────────
# consensus_hex is derived from consensus_nkey via decode_node_pubkey()
# wallet_propose(seed) gives the transaction-signing address (not consensus key address)

VALIDATORS = [
    {
        "name":           "node1",
        "seed":           "shceNfYscsfpvw313yhmsieChXJZ7",
        "address":        "rhTyFgd1P6VN8YdXB9buQUCb47KcgPkSEA",
        "consensus_nkey": "n94RNoyd8qLHjn7FbvtpWWumSSs2S7XGncejjLLJ2FofDrBZ1Ff6",
        "consensus_hex":  "03FE4CE5C18B030A05274D25BFA179680A3CE4967C45C6337215AB447E7900896E",
        "rpc_port":       5005,
        "service":        "qxrp-node1",
        "cfg_path":       "/var/lib/qxrp/node1/xrpld.cfg",
        "data_dir":       "/var/lib/qxrp/node1",
        "falcon_pk":      (
            "FB09B26442A95183D400B6F5A3B0DDAABE919BA40721637BF6947A1DCB26244E"
            "5441B8218664F10066349EC95951D93814AE8F9CC26CC45BAF299DA9F6D8AAE2"
            "F389D16BB8144FA4B080A8F8B619CA9958F0660DD1510BE242D542D3EFA43A9F"
            "BBFD20A76F82E0854C203FBF05B66A21AB710CCD2DB014CFEF05C48F5062599E"
            "83BEF6576C99B950B82A3021CB9BA576C01707C54E2846B14752E5DC9BA150C3"
            "0CA7D749B0BE2762689353B07EB9FDE7C75456B8CAC880657376A547654DD17D"
            "C8DBEB5756FF91648F06965AD85BE5AF83E94BF260316545936A125E6EBACB33"
            "04092261193382091DBCEDFAC4F388AF39492FC4ABDC39949983401893536D0E"
            "6F96EB903D3ED1C231DD0D535A54F290D152AE5429B953861A5045095A6103EB"
            "293C860B53F980E6639912C88F564C9506F6E320AD7A7E909839C682D387B8A6"
            "04D4DB248102C6D0A927B0587C97A412DC27331E9DB22280813F6084A0B98C2F"
            "3471B07A0D016071051FB1AE04C9A8DD5E39E56E8D7E0AA7E3F684CD6CE4917"
            "69EDD12A889EE57039013689672B40F9ADF3F6572831DDB79739D96A384E9457"
            "412F344B146F3A57418F258866B98ED065139517FB9CA1D32F08D852BADAE77C"
            "32A4C5E95A53331E3B369B16702384349814DDAF386A2D52BE0DDE2E64765209"
            "6B197525D4A3132D83B96C95B36313048DC4C8048A07EABE2188F21461B61D08"
            "BED49DCE8B6C185567024565156066D7126CAB22D18098FE52BD07FEFA07D984"
            "49694215F86F09391EE8FA78752B8A2BD810979340E57BD28EC870C2FD2611F1"
            "424529580F12F6E3C6030154851FBB576346234405516B650A3041F4F5D96101"
            "591584D9BB194CABEACA41E092F736401CD8480DD55E743E73045A7A57FC4BF2"
            "BA0292A249DD7773E90E5F1888B8825D588E318964B7C578768A0EB8002CF415"
            "CA12615E9E5B610248114C25C09C80159A10E11D5A02D588F266A6BFB8708938"
            "918A7C292236F84349BEB8D2A3D3DF8EAC5ABFE906911E9DA925F1184DFC6EF"
            "5EB3295A3C02801F311421403BBAE5109CB208810F4A922F1592B332841B07CA"
            "3367802CA86D296CAA2A19434DFC77F2E3D2312FAD90D5BF1A1E2D4488F1614"
            "64215D46A6B2759EE76E95552D966834D1D4440AE6BD01FBEF5628222B0607C0"
            "9E1BBEE80B686CAC2C6DC253B2467FA0E018F16F10BDA3A82CC6ADE2F541A90B"
            "35E00B00AEFC677B8465E938DAF8D94E4B4911A4D2B32C16CC9D762C32A0D197"
            "22E5C0E"
        ),
    },
    {
        "name":           "node2",
        "seed":           "sny63XyDLBXCArFhyrK8bvksfDWEN",
        "address":        "r81WCrNbt5vkboNvUVtGRX9dvogQ3EBGC",
        "consensus_nkey": "n9MuP4C9zqXjZx18Jw7gaSSQ9bi4R7TBxn9LfmPR9Mb9JgG9sLR6",
        "consensus_hex":  "03BA84577184776A3A01E2C76783418024F7CAAAFF16694FA5A1B9B2EBC0991649",
        "rpc_port":       5006,
        "service":        "qxrp-node2",
        "cfg_path":       "/var/lib/qxrp/node2/xrpld.cfg",
        "data_dir":       "/var/lib/qxrp/node2",
        "falcon_pk":      (
            "FB0952BA684A75D4604DC803B6A969B1B0D5FFCB002E57075E6E2AEA01107A7A"
            "EE7599EAA5A3F522444EA52D4EB92C328166F06D447F80E1669614412DB540C9"
            "BE0E4AC3444FE1600ADC65B59DCA2FA9790EB5CE9BF60F656209E28900890969"
            "B67EC9B68EA154D421E99C482156BADEE4057275D1359B19D1727642339883169"
            "FEA2960BB528970A437EBF25B3D3E16515B74E8DE60DAC56B3B14AB9F5C64221"
            "96BC957EC10E26BA5A30F115BA80A1D275C5D4AB5E96D3598497D130C98A7B95"
            "1DED012ADE265D67A908A18EBB802EB171707FE42C20C13B9A9B083115271DD6"
            "A564F6C8F6BEB898C37359ADB86A72D7291C4035BCBA1BACC3FC2939941A5EE6"
            "1D2BFC2360E5875B01E6C6A8266A95B31A61485F4ACA94F11256B7E6A4276AC4"
            "F25D05356D0457C1660E6140F9CFA814A1F44A01BDC4D36FC31CBA08763A4BA9"
            "BF45AC0A470E66622DF8078B274870A2D34A83891AA89512AA32E32D28F0DDDB"
            "CBCA6C9E3DF927860D030F3A4F575FE12B2C7E24491E2A19309CDC1031DD6807"
            "BE4239562AF7741506C781C65C48F92638AE942F89902FB6BB0C8C80FAB917AD"
            "EE6E81842FF3AC07C606E9659071AAF2743E59D566951A12E521C6AC429845E1"
            "88C540D30525AA67005203794EE6E842AA5BD011AEAD35CAE417AAD187047296"
            "989C6185931705524CD0D4EBD3ABBD4D7E2716892C74B1AA9CF5611C2E9DBEC0"
            "64451A2A5FD5D3996F8534585205B49493C350BDEE46EA87F9AA8DB8443F5056"
            "A1603A29D9D9C99382F760A145370ADE3B882FA1F9BB1AC532FDDEB89D220C38"
            "4640C9A1F6F4D2F507BA9A68DE50A011FD55D80139D80D604A22A39220EFAC82"
            "26C5742D93CB44D130B9BCDF4A6878CDF2DD106C4B6C44E729DB107C61D8A1D0"
            "968EB9253A066BEB8E750C1B80FBC5606440ACCAFEC94AB6F90FD0854BB588181"
            "F409611A89734AC3B37070DB37954C514A2FE3E2A6BD3F992B44A40C965D2645"
            "E1F7C3727ED1F4A2865E3C186CB14228DF99ABB1B224024E7A856DA12025C6F0"
            "380E2C45A29C6F82FD73A255253F62CA51D9B9D328B4B1B6977C60E1895DD534"
            "17ECF565E683142022E21AA87C75214D1436060D79591C90873C53023457579724"
            "C887892BF6A155B3D2D5C6DE50A41B0038D7B62708B69B6996063E6506FBAF199"
            "D16F4448108AF2651AC648A3DDEBA9DA8F519BD24B92C529027AA13446B092DC0"
            "5C4904088A46818688701B5CEDE16D28F1134A6E702928125E8426D56283B8"
        ),
    },
    {
        "name":           "node3",
        "seed":           "snXMktzfWAzMwN6Mosdo8zTh12MML",
        "address":        "rw2PexMh8vgcjriMv4fGT85J8nMCePMQCW",
        "consensus_nkey": "n9KX6hNjxiyKSPi1vptDFsuqAMSe9dpZ5uehEnT6GdkmRvzWYMwp",
        "consensus_hex":  "0281DD0281E6AD21E19430AFB0306050F57825D27CF98B5A667B65214FCC6E62FD",
        "rpc_port":       5007,
        "service":        "qxrp-node3",
        "cfg_path":       "/var/lib/qxrp/node3/xrpld.cfg",
        "data_dir":       "/var/lib/qxrp/node3",
        "falcon_pk":      (
            "FB091E79EDA65B6E7938964822F7C9B868E54DA863D29A14D29239721FA01210"
            "44440151CFB5D82950816EF910000C971613F45CC1AFAA260CF898B1C37ABACB"
            "5980504122D12FD9A110A5E96308C37E6243F594E94152825B26116014A9B51D"
            "A0D5D4D08E696C7310C57F5BF09C4977510655A1DF80A253310F1A75A2A0C706"
            "57BCCB77FCA74F35EC723A4E25578C4AD38905EBA29985FDF2FDCB8A35A457E5"
            "15CD2E06DE78396150982F95646BA54C9548DE43B654D64E3099E4987B2DBC72"
            "ECA7AA019B2D1C9577A6D5E4B4104A91F4DADCDF8E5271D50CA28660D229151E"
            "95E81D5E6404D69858829C9B41BC65B72EA60479D7DFF158AA2E8A4BCB158AF2"
            "3A42A9D2B863286A1BAA8FD791FD1C083F09ED297AB6D121C02606AC69848A97"
            "AA8B92AA7950C08E997521813AEC9BA9C213EB76D1D001CD0CEAD90EF66A3CD5"
            "46D6C1BF552D4A02501F449271C8D34AA653B2296829BB2CFF93B8ACB9206CD8"
            "229E4F6BC4A3AE4B76B268B4EDE550D52863211DEDB804BD320711461A21393B"
            "C41517B31D91B4001DDBA26AFB4749E5C97135EA6389DA2CAF185467E6A22EB5"
            "28C7167CE51948A09098962E26183852D7CB106E67341696A747AE77FDE1317F"
            "4286014D93A5D6598014AC1C59926E7267C484390589510BDDA9706F8ED46D81"
            "7432CB8F477A02AD53BA60AFB2BC8C290EC53665FD0B4070CABE96263EEA2C8F"
            "993B996F117459A7249024A40F9E242CBA9E86872CBB66D00B27C9DB2C6B0288"
            "B2DA2CCBAC51DD55B8D2E0A0CE4C72F744CC1CF6304AFD2F972D841924FF631"
            "A289006C066DE87A0625ECAF3961E8D9944987986665CEE5214BE0E7979CE4F8"
            "BD7A10E71BD690B13EDFC80443D877929685734CB3055E0DF9C859A651E12FB5"
            "EDDF41B1D8CFE18F883034ED3FB69DC41D41F09689886F54688E54C9EBA0119D"
            "AE0BD3F9920261A18BB16B4E59876433B9515DE0B66CF62122AA4E27E22632931"
            "B429E4E5E226C0EEDAC0DE953D6D37C8CE29739DDDFF3641D223238AAD06319C"
            "FB17BE9EA6FFE6375CDE16D4151B948DACE295CC41C39A44B4042D233131C5DA"
            "3840A58F8392E3771AEDE66F4D816886AA7390BEE3B3D092D3B2C0DA28274C98"
            "9738171692424A98EEB6366CEE0DA60434F9A9285AA9F80926B46C440F926E953"
            "E96B0245D4FF66824A56BEA34C39CDBED3A3E27E229D3B64D84E1D9B34E570AB"
            "8EFA265123A8F821F367723AA74C8C61A53D6C2807A4A4AFF59E8AB22DD1B54EDB5"
        ),
    },
]

NODE4 = {
    "name":           "node4",
    "seed":           "snTrSqpVoAna3Grv2FUVXS5xhXeSF",
    "address":        "rUnB1yVhL1wui6eGuTjSPxe2RWTyXeUT6D",
    "consensus_nkey": "n9LhNgHysZfTubvZa9v5kCQooWZAXdMZptrcifZXpH6EbLdj6fGt",
    "consensus_hex":  "02C7384DA3E623479BECF4218FFA64BAF4244E475E7C197B556A6865E625C6A5DC",
    "rpc_port":       5005,
    "service":        "qxrp",
    "cfg_path":       "/etc/qxrp/xrpld.cfg",
    "data_dir":       "/var/lib/qxrp",
    "host":           NODE4_HOST,
    # falcon_pk is generated fresh in outsider_join.py each time
}

# validators.txt content — used for fresh start (nodes 1-3 only initially)
VALIDATORS_TXT_3 = "[validators]\n" + "\n".join(v["consensus_nkey"] for v in VALIDATORS) + "\n"
# validators.txt with all 4 (used after node4 joins)
VALIDATORS_TXT_4 = VALIDATORS_TXT_3.rstrip("\n") + f"\n{NODE4['consensus_nkey']}\n"

# ── XRP base58 ─────────────────────────────────────────────────────────────────
ALPHA = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz"

def b58decode(s):
    n = 0
    for c in s:
        n = n * 58 + ALPHA.index(c)
    res = []
    while n:
        res.append(n & 0xFF)
        n >>= 8
    res.reverse()
    pad = len(s) - len(s.lstrip(ALPHA[0]))
    return bytes(pad) + bytes(res)

def decode_node_pubkey(nkey):
    """n... validator public key → 33-byte hex (ConsensusKey for TXs)."""
    return b58decode(nkey)[1:34].hex().upper()

def pubkey_hex_to_account_id_bytes(pubkey_hex: str) -> bytes:
    """Compute XRPL AccountID (20 bytes) from a 33-byte compressed pubkey hex."""
    raw = bytes.fromhex(pubkey_hex)
    sha = hashlib.sha256(raw).digest()
    ripe = hashlib.new("ripemd160", sha).digest()
    return ripe

def account_id_bytes_to_address(account_id: bytes) -> str:
    """Base58check encode 20-byte AccountID to r... address."""
    payload = b"\x00" + account_id
    checksum = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
    full = payload + checksum
    n = int.from_bytes(full, "big")
    result = ""
    while n:
        n, rem = divmod(n, 58)
        result = ALPHA[rem] + result
    for b in full:
        if b == 0:
            result = ALPHA[0] + result
        else:
            break
    return result

def consensus_key_to_slash_target(consensus_hex: str) -> str:
    """Given consensus pubkey hex, return the r... slash target address."""
    account_id = pubkey_hex_to_account_id_bytes(consensus_hex)
    return account_id_bytes_to_address(account_id)

# ── RPC helpers ────────────────────────────────────────────────────────────────
PRIMARY_NODE = "http://127.0.0.1:5005"

def rpc(url_or_port, method, params=None):
    """Call RPC. url_or_port can be a full URL or just a port number."""
    if isinstance(url_or_port, int):
        url = f"http://127.0.0.1:{url_or_port}"
    else:
        url = url_or_port
    body = json.dumps({"method": method, "params": [params or {}]}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())["result"]

def rpc_any(method, params=None):
    """Try each node in order; return first success."""
    for port in [5005, 5006, 5007]:
        try:
            r = rpc(port, method, params)
            if r and "error" not in r:
                return r
        except Exception:
            pass
    raise RuntimeError(f"All nodes failed for {method}")

def get_seq(address, port=5005):
    r = rpc(port, "account_info", {"account": address, "ledger_index": "current"})
    return r["account_data"]["Sequence"]

def sign_and_submit(seed, tx_json, port=5005):
    """Sign a TX with seed and submit; return (engine_result, hash)."""
    r = rpc(port, "sign", {"secret": seed, "tx_json": tx_json})
    if r.get("status") != "success":
        return "SIGN_ERR: " + str(r.get("error_message", r)), ""
    blob = r["tx_blob"]
    tx_hash = r["tx_json"]["hash"]
    sub = rpc_any("submit", {"tx_blob": blob})
    return sub.get("engine_result", "?"), tx_hash

def wait_validated(tx_hash, retries=30, sleep_s=3):
    for _ in range(retries):
        time.sleep(sleep_s)
        try:
            r = rpc_any("tx", {"transaction": tx_hash, "binary": False})
            if r.get("validated"):
                return r.get("meta", {}).get("TransactionResult", "?")
        except Exception:
            pass
    return "TIMEOUT"

def current_ledger_seq(port=5005):
    r = rpc(port, "server_info")
    return r["info"]["validated_ledger"]["seq"]

def current_epoch(port=5005):
    """Return (epoch_number, epoch_start_ledger, pool_balance_drops) or (0, 0, 0) if no epoch yet."""
    r = rpc(port, "ledger_data", {"ledger_index": "validated", "binary": False, "limit": 400})
    for obj in r.get("state", []):
        if obj.get("LedgerEntryType") == "RewardEpoch":
            return (
                obj.get("EpochNumber", 0),
                obj.get("EpochStartLedger", 0),
                int(obj.get("EpochPoolBalance", "0")),
            )
    return (0, 0, 0)

def all_validator_bonds(port=5005):
    """Return list of ValidatorBond SLE dicts from the validated ledger."""
    r = rpc(port, "ledger_data", {"ledger_index": "validated", "binary": False, "limit": 400})
    return [o for o in r.get("state", []) if o.get("LedgerEntryType") == "ValidatorBond"]

# ── SSH helpers for node4 ──────────────────────────────────────────────────────
def ssh4(cmd: str, capture=True) -> str:
    """Run a shell command on node4 via SSH. Returns stdout."""
    full = [
        "sshpass", "-p", NODE4_SSH_PASS,
        "ssh", "-o", "StrictHostKeyChecking=no",
        f"{NODE4_SSH_USER}@{NODE4_HOST}", cmd,
    ]
    result = subprocess.run(full, capture_output=capture, text=True, timeout=60)
    return result.stdout.strip()

def ssh4_rpc(method, params=None):
    """Call RPC on node4 via SSH."""
    params_json = json.dumps(params or {}).replace('"', '\\"')
    body = json.dumps({"method": method, "params": [params or {}]})
    cmd = f"curl -s -X POST http://127.0.0.1:5005 -H 'Content-Type: application/json' -d '{body}'"
    out = ssh4(cmd)
    return json.loads(out)["result"]

# ── Logging ────────────────────────────────────────────────────────────────────
def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")

def ok(msg):
    print(f"[{time.strftime('%H:%M:%S')}] \033[32m✓ {msg}\033[0m")

def warn(msg):
    print(f"[{time.strftime('%H:%M:%S')}] \033[33m⚠ {msg}\033[0m")

def err(msg):
    print(f"[{time.strftime('%H:%M:%S')}] \033[31m✗ {msg}\033[0m")
