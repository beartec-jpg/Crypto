# Tide Out → Tide In — Final Results

Research run on **beartec-brain** (28 workers) and falcon2 warehouse.

**Data:** Binance USDT perps klines, 6 coins (BTC, ETH, SOL, BNB, XRP, DOGE), 15m / 1h / 4h  
**Range:** 2019-01-01 → 2026-09-26 (SOL from 2020-08-11, DOGE from 2019-07-05)  
**Split:** train &lt; 2024-01-01 · holdout 2024+  
**Fees:** 4 bps / side  
**Tide IN:** indicator-only (bear DIV / EMA peak / score 0-cross) — never a short, never a fixed % swing as the signal

Artifacts:
- `tide_rr_pf_search.txt` — ranked RR / profit-factor report  
- `tide_rr_pf_search.jsonl` — top result rows  
- Scripts: `scripts/tide_out_in_backtest.py`, `scripts/tide_in_indicator_only.py`, `scripts/tide_rr_pf_search.py`

---

## Bottom finding (Tide out / bull DIV)

Live default `emaPeriod=8 / confirmBars=5 / belowScore=-10` is weak on 15m and fails on 4h.

| TF | Best Tide out | Holdout forward | Notes |
|---|---|---|---|
| 15m | ema8 / N=3 / below −20 or −30 | ~+0.27% @ 12h, ~58% wr | Beats live default |
| 1h | ema21 / N=8 / below 0 to −10 | ~+0.45–0.60%, ~64% wr | Slower structure |
| **4h** | **ema8 / N=3 / below −20** | **~+0.94% @ 24h, ~60% wr** | Best bottom TF |

---

## RR / +PF systems (24,304 configs)

- **7,307** strong (hold PF ≥ 1.15 and train PF ≥ 1.05)  
- **249** balanced (n≥40, hold PF≥1.5, train PF≥1.2)

### Recommended presets

#### 1) Best overall — 4h (highest PF, lowest DD)

| Setting | Value |
|---|---|
| Tide out | Hist EMA **8**, Zigzag **N=3**, belowScore **−20** |
| Tide in | Score **0-cross down** |
| Stop | **2%** |
| Target | Tide-in **or 2R** |
| Gate | min R ≈ 1.5 |
| Holdout | PF **2.66** · mean **+1.26%** · wr **55%** · n **51** · DD **−4.3%** |
| Train | PF **1.31** |

#### 2) Best indicator-pure — 4h

| Setting | Value |
|---|---|
| Tide out | ema **8** / N **3** / below **−20** |
| Tide in | Tide EMA peak **ema8 / N=5** |
| Stop | Structure under pivot (**−1 ATR**) |
| Target | Tide-in only |
| Holdout | PF **2.14** · mean **+1.75%** · wr **51%** · n **107** |
| Train | PF **1.51** |
| Exits | ~51% real Tide-in |

#### 3) 1h

| Setting | Value |
|---|---|
| Tide out | ema **21** / N **8** / below **−10** |
| Tide in | EMA peak **ema8 / N=8** (above ~10) |
| Stop | **1.5%** |
| Target | Tide-in |
| Holdout | PF **~2.29** · mean **~+1.17%** · n **48** |
| Train | PF **~1.4** |

#### 4) 15m

No balanced +PF system at this bar. Prefer 1h / 4h.

---

## Chart defaults vs live

| Setting | Live default | Recommended |
|---|---|---|
| Zigzag N (15m/4h bottoms) | 5 | **3** |
| belowScore (4h) | −10 | **−20 / −30** |
| 1h Hist EMA / N | 8 / 5 | **21 / 8** |
| Tide in | none | **0-cross or EMA peak after a buy only** |
| Exit RR | none | **Tide-in or 2R**, stop 1.5–2% or under pivot |

---

## Caveats

- Top raw PF rows with thin train PF (~1.1) and small n are optimistic — prefer balanced presets above.  
- Protective stop is risk management; Tide IN is the indicator exit.  
- Brain box has AMD iGPU (no NVIDIA CUDA); search used 32-core CPU parallelism.
