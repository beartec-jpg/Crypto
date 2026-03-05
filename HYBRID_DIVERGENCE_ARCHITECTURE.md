# Hybrid Divergence Architecture (SMT Primary + Single-Asset Fallback)

## Strategy Summary

The Smart Money system now uses **SMT divergence as the PRIMARY signal** with **single-asset divergence (RSI/MACD) as a fallback and confluence booster**.

## Scoring Hierarchy

### Case 1: SMT is Valid ✅ (Best Case)
```
SMT divergence detected + valid
├─ If RSI/MACD AGREES (same direction)
│  └─ Score boosted by 30% (confluence bonus)
│  └─ Source: "SMT (bullish/bearish) + RSI/MACD confluence"
└─ If RSI/MACD disagrees or absent
   └─ Use SMT score as-is
   └─ Source: "SMT primary (bullish/bearish)"
```

**Examples:**
- Main asset makes HL, Corr makes LL (Bullish SMT) + RSI divergence bullish
  - Score: SMT * 1.3 (boosted)
- Main asset makes LH, Corr makes HH (Bearish SMT) + RSI normal
  - Score: SMT as-is

### Case 2: SMT Unavailable ⚠️ (Fallback)
```
No SMT (correlated data missing or correlation too low)
└─ Fall back to RSI/MACD divergence
   └─ Source: "RSI/MACD divergence (SMT unavailable)"
```

**Examples:**
- No BTC data fetched → Use XRP RSI/MACD divs alone
- BTC-XRP correlation = 0.3 (below 0.5 threshold) → Use XRP divs alone

### Case 3: No Divergence Signal 🔴 (No-op)
```
Both SMT and single-asset unavailable/invalid
└─ Score = 0, confidence = 0
   └─ Source: "No divergence signal"
```

## Practical Impact

### Before (Separate Conditions)
- SMT: Weight 2
- Single-asset divergence: Weight 1
- Total divergence contribution: Could be weighted twice if both present

### After (Merged Hybrid)
- Divergence Confluence: Weight 1
- Includes both SMT + single-asset in one smart scoring function
- Only ONE divergence contribution to system score
- But internal logic boosts when both agree (+30%)

**Result:** Cleaner scoring, no double-weighting, automatic confluence detection

## Configuration

Currently: `divergenceConfluence: 1` in smart-money weights

Users can still adjust this, though the 30% confluence bonus is built into the score calculation itself.

## Code Flow

```typescript
// In scoreSmartMoney():

// Step 1: Get single-asset baseline
const singleAssetScore = scoreDivergenceConfluence(priceHistory, rsiHistory, ...);

// Step 2: Hybrid logic (SMT primary, fallback to single-asset, confluence boost)
const hybrid = scoreHybridDivergence(smtDivergence, singleAssetScore);
//  ├─ If SMT valid & agrees with single-asset → boost 30%
//  ├─ If SMT valid & single-asset different → use SMT
//  ├─ If SMT invalid → use single-asset
//  └─ If neither → return 0

// Step 3: Use hybrid score
const divergenceFinalScore = hybrid.score;
const description = hybrid.source; // Display which signal is active
```

## Signal Alignment Detection

```typescript
const bothBullish = smtDivergence.type === 'bullish' && singleAssetScore > 0;
const bothBearish = smtDivergence.type === 'bearish' && singleAssetScore < 0;

if ((bothBullish || bothBearish) && Math.abs(singleAssetScore) > 0) {
  // CONFLUENCE! Both systems agree
  finalScore = smtScore * 1.3; // 30% boost
}
```

## Examples in Action

### Example 1: Strong Bullish Confluence
```
Main:  Higher Low (stronger than previous)
Corr:  Lower Low (weaker than previous)
RSI:   Bullish divergence (price HL, RSI LL)

SMT Bullish ✓
RSI Bullish ✓
→ Score boosted 30%
→ Display: "SMT (bullish) + RSI/MACD confluence"
```

**Confidence: Very high** (two separate systems confirm)

### Example 2: SMT Alone
```
Main:  Higher Low
Corr:  Lower Low
RSI:   No clear divergence

SMT Bullish ✓
RSI None
→ Score from SMT only
→ Display: "SMT primary (bullish)"
```

**Confidence: Medium** (multi-asset signal but no single-asset confirmation)

### Example 3: Fallback to Single-Asset
```
No correlated data available (BTC fetch failed)
RSI:   Strong bullish divergence

SMT: Unavailable
RSI:  Bullish ✓
→ Score from RSI divergence
→ Display: "RSI/MACD divergence (SMT unavailable)"
```

**Confidence: Lower** (no multi-asset perspective)

## Invalidation Rules

- **SMT Invalidated:** Price breaks structure → score capped at 50% of max
- **Single-Asset Invalidated:** RSI recovers to centerline → baseline score drops
- **Hybrid Effect:** If SMT invalidated but RSI still valid → use RSI instead

## Future Enhancements

1. **Confidence Scoring:** Return confidence alongside score
   - SMT + RSI confluence = 95% confidence
   - SMT alone = 70% confidence
   - RSI fallback = 50% confidence

2. **Weighted Fallback:** Don't discount fallback divs
   - Current: Binary (use SMT OR use RSI)
   - Future: Blend both with fallback weight

3. **Multiple Timeframe SMT:** 
   - SMT on 4H + single-asset on 1H
   - Higher confluence if both timeframes agree

4. **SMT Divergence Strength Tiers:**
   - High correlation + clear mismatch + time-synced = 100% weight
   - Medium correlation + clear mismatch = 75% weight
   - Low specificity = 50% weight + fallback to RSI
