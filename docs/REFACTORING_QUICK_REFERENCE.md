# CryptoIndicators Refactoring Quick Reference

Quick navigation and task guide for the refactored CryptoIndicators architecture.

## 📍 Quick Navigation

### Where to Find Things

#### Strategies
**Location:** `/client/src/lib/strategies/`
- **BOS Structure:** `bosStructureStrategy.ts` (155 lines)
- **Change of Character + FVG:** `chochFvgStrategy.ts` (232 lines)
- **EMA Crossover:** `emaStrategy.ts` (264 lines)
- **Liquidity Grab:** `liquidityGrabStrategy.ts` (171 lines)
- **RS Flip:** `rsFlipStrategy.ts` (179 lines)
- **VWAP:** `vwapStrategy.ts` (249 lines)
- **Helpers:** `helpers.ts` (212 lines)

#### State Management Hooks
**Location:** `/client/src/hooks/`
- **Backtest Settings:** `useBacktestSettings.ts` (298 lines)
- **Chart Data:** `useChartData.ts` (214 lines)
- **Indicator State:** `useIndicatorState.ts` (377 lines)
- **Strategy Settings:** `useStrategySettings.ts` (642 lines)
- **Trading State:** `useTradingState.ts` (105 lines)
- **Watchlist State:** `useWatchlistState.ts` (86 lines)

#### Calculations
**Location:** `/client/src/lib/calculations/`
- **Divergence Detection:** `divergenceCalculations.ts` (328 lines)
- **Fair Value Gaps:** `fvgAnalysis.ts` (143 lines)
- **Market Analysis:** `marketAnalysis.ts` (125 lines)
- **Pivot Points:** `pivotCalculations.ts` (107 lines)
- **VWAP Calculations:** `vwapCalculations.ts` (134 lines)

#### Backtest Engine
**Location:** `/client/src/lib/backtest/`
- **Auto Backtest:** `autoBacktest.ts` (190 lines)
- **Backtest Helpers:** `backtestHelpers.ts` (208 lines)
- **Parameter Generator:** `parameterGenerator.ts` (235 lines)
- **Trade Simulator:** `tradeSimulator.ts` (948 lines)
- **Type Definitions:** `types.ts` (170 lines)

#### UI Components
**Location:** `/client/src/components/trading/`
- **Action Buttons:** `ActionButtonsToolbar.tsx` (62 lines)
- **Alerts:** `AlertsPanel.tsx` (76 lines)
- **Backtest:** `BacktestPanel.tsx` (44 lines)
- **Backtest Results:** `BacktestResultsPanel.tsx` (188 lines)
- **Bot Config:** `BotConfiguration.tsx` (53 lines)
- **Position Tracker:** `PositionTrackerPanel.tsx` (133 lines)
- **Replay Controls:** `ReplayModeControls.tsx` (165 lines)
- **Strategy Generator:** `StrategyGeneratorPanel.tsx` (162 lines)
- **Trade Entry:** `TradeEntryPanel.tsx` (209 lines)
- **Trade History:** `TradeHistoryPanel.tsx` (102 lines)
- **Trading Panel:** `TradingPanel.tsx` (94 lines)
- **Video Player:** `VideoSequencePlayer.tsx` (187 lines)

## 🔧 Common Tasks

### Adding a New Strategy

1. **Create strategy file:**
   ```bash
   cd client/src/lib/strategies
   touch myNewStrategy.ts
   ```

2. **Implement strategy interface:**
   ```typescript
   import { CandlestickData } from '@/types';
   
   export interface MyStrategySignal {
     type: 'LONG' | 'SHORT';
     price: number;
     confidence: number;
     reason: string;
   }
   
   export function generateMyStrategy(
     candles: CandlestickData[],
     params: MyStrategyParams
   ): MyStrategySignal[] {
     // Implementation
   }
   ```

3. **Export from index:**
   ```typescript
   // client/src/lib/strategies/index.ts
   export * from './myNewStrategy';
   ```

4. **Import in CryptoIndicators.tsx:**
   ```typescript
   import { generateMyStrategy } from '@/lib/strategies';
   ```

5. **Add tests:**
   ```bash
   cd client/src/__tests__/strategies
   touch myNewStrategy.test.ts
   ```

### Modifying Backtest Logic

1. **Locate the relevant file:**
   - Core logic: `client/src/lib/backtest/tradeSimulator.ts`
   - Auto backtest: `client/src/lib/backtest/autoBacktest.ts`
   - Helpers: `client/src/lib/backtest/backtestHelpers.ts`

2. **Make changes to isolated function:**
   ```typescript
   // Example: Modify trade simulation
   export function simulateTrade(
     entry: TradeEntry,
     candles: CandlestickData[],
     params: BacktestParams
   ): TradeResult {
     // Your modifications
   }
   ```

3. **Update types if needed:**
   ```typescript
   // client/src/lib/backtest/types.ts
   export interface BacktestParams {
     // Add new parameters
   }
   ```

4. **Test changes:**
   ```bash
   npm run test -- backtest
   ```

### Debugging Signal Generation

1. **Check strategy files:**
   ```bash
   # Find where strategy is defined
   cd client/src/lib/strategies
   grep -r "generateStrategy" .
   ```

2. **Add console logging:**
   ```typescript
   // In strategy file
   export function generateMyStrategy(...) {
     console.log('Strategy params:', params);
     const signals = computeSignals();
     console.log('Generated signals:', signals);
     return signals;
   }
   ```

3. **Check hook integration:**
   ```bash
   # See how strategy is called
   cd client/src/pages
   grep -A 10 "generateMyStrategy" CryptoIndicators.tsx
   ```

4. **Verify state management:**
   ```typescript
   // Check useStrategySettings hook
   // client/src/hooks/useStrategySettings.ts
   ```

### Adding a New Indicator

1. **Create calculation function:**
   ```typescript
   // client/src/lib/calculations/myIndicator.ts
   export function calculateMyIndicator(
     candles: CandlestickData[],
     params: MyIndicatorParams
   ): IndicatorResult[] {
     // Pure calculation logic
   }
   ```

2. **Update indicator state hook:**
   ```typescript
   // client/src/hooks/useIndicatorState.ts
   export function useIndicatorState() {
     const [myIndicator, setMyIndicator] = useState({
       enabled: false,
       ...defaultParams
     });
     
     return { myIndicator, setMyIndicator, ... };
   }
   ```

3. **Create UI component (if needed):**
   ```bash
   cd client/src/components/indicators
   touch MyIndicatorPanel.tsx
   ```

4. **Integrate in main component:**
   ```typescript
   // client/src/pages/CryptoIndicators.tsx
   const indicators = useIndicatorState();
   
   // Use indicators.myIndicator
   ```

### Adding a New Trading Panel

1. **Create component:**
   ```bash
   cd client/src/components/trading
   touch MyTradingPanel.tsx
   ```

2. **Implement component:**
   ```typescript
   import { useTradingState } from '@/hooks/useTradingState';
   
   export function MyTradingPanel() {
     const tradingState = useTradingState();
     
     return (
       <div>
         {/* Your UI */}
       </div>
     );
   }
   ```

3. **Export from index:**
   ```typescript
   // client/src/components/trading/index.ts
   export { MyTradingPanel } from './MyTradingPanel';
   ```

4. **Import in CryptoIndicators.tsx:**
   ```typescript
   import { MyTradingPanel } from '@/components/trading';
   ```

## 📋 Integration Checklists

### When Extracting New Module

- [ ] Create new file in appropriate directory
- [ ] Move code to new file
- [ ] Export from module's index.ts
- [ ] Import in CryptoIndicators.tsx
- [ ] Verify functionality unchanged
- [ ] Add tests for extracted code
- [ ] Run test suite: `npm run test:run`
- [ ] Check bundle size: `npm run build && npm run analyze`
- [ ] Update documentation
- [ ] Commit changes

### When Modifying Extracted Module

- [ ] Locate the module file
- [ ] Make targeted changes
- [ ] Update TypeScript types if needed
- [ ] Add/update tests
- [ ] Run relevant tests: `npm run test -- <module>`
- [ ] Verify in CryptoIndicators.tsx
- [ ] Check for breaking changes
- [ ] Update documentation if needed
- [ ] Commit changes

### When Adding New Feature

- [ ] Determine which module(s) affected
- [ ] Create/modify calculation functions in `/lib`
- [ ] Update or create hooks in `/hooks`
- [ ] Create UI components in `/components`
- [ ] Integrate in CryptoIndicators.tsx
- [ ] Add comprehensive tests
- [ ] Run full test suite
- [ ] Check bundle size impact
- [ ] Document new feature
- [ ] Commit changes

## 📊 Metrics Tracking

### Current State (Feb 2, 2026)
- **Main File:** 6,773 lines
- **Extracted:** 7,350 lines (51% reduction)
- **Test Coverage:** 70%+
- **Build Status:** ✅ Passing

### Phase Completion
- ✅ Phase 1: Strategies (1,474 lines)
- ✅ Phase 2: Hooks (1,722 lines)
- ✅ Phase 3: Calculations (857 lines)
- ✅ Phase 4: Backtest (1,770 lines)
- ✅ Phase 5: UI Components (1,527 lines)
- 🔄 Phase 6: Final optimization (1,415 lines remaining)

### Target Metrics (Phase 6 Complete)
- **Main File:** ~5,358 lines (61% reduction)
- **Total Extracted:** ~8,765 lines
- **Test Coverage:** 70%+ (maintained)
- **Build Status:** ✅ Passing

## 🔍 Code Search Tips

### Find Strategy Implementation
```bash
grep -r "export function generate.*Strategy" client/src/lib/strategies/
```

### Find Hook Usage
```bash
grep -r "use.*Settings\|use.*State" client/src/pages/CryptoIndicators.tsx
```

### Find Calculation Functions
```bash
grep -r "export function calculate" client/src/lib/calculations/
```

### Find Component Usage
```bash
grep -r "import.*from '@/components/trading'" client/src/pages/
```

### Find Type Definitions
```bash
grep -r "export interface.*Signal\|export type.*" client/src/lib/backtest/types.ts
```

## 🐛 Debugging Tips

### Strategy Not Working
1. Check strategy file in `/lib/strategies/`
2. Verify parameters in `useStrategySettings` hook
3. Check signal generation in CryptoIndicators.tsx
4. Add logging to strategy function
5. Test in isolation with sample data

### Backtest Failures
1. Check `tradeSimulator.ts` for logic errors
2. Verify trade parameters in `useBacktestSettings`
3. Check `backtestHelpers.ts` for utility issues
4. Add logging at each step
5. Test with minimal dataset

### Hook State Not Updating
1. Check hook implementation in `/hooks/`
2. Verify state initialization
3. Check if hook is properly imported
4. Add React DevTools to inspect state
5. Check for missing dependencies in useEffect

### Component Not Rendering
1. Check component file in `/components/trading/`
2. Verify import in CryptoIndicators.tsx
3. Check conditional rendering logic
4. Verify prop passing
5. Add console.log to track render

## 📚 Related Documentation

- **[REFACTORING_2026.md](./REFACTORING_2026.md)** - Complete refactoring overview
- **[PHASE_6_ROADMAP.md](./PHASE_6_ROADMAP.md)** - Detailed Phase 6 implementation plan
- **[../README.md](../README.md)** - Project overview and setup
- **[../TESTING.md](../TESTING.md)** - Testing guide
- **[../PERFORMANCE.md](../PERFORMANCE.md)** - Performance optimization guide

## 🚀 Quick Commands

```bash
# Development
npm run dev                    # Start dev server

# Testing
npm run test                   # Run tests in watch mode
npm run test:run               # Run tests once
npm run test -- strategies     # Test specific module
npm run test:coverage          # Coverage report

# Building
npm run build                  # Production build
npm run analyze                # Bundle analysis
npm run check:bundle           # Check bundle limits

# Quality
npm run check                  # TypeScript check
npm run lint                   # Lint code (if configured)
```

---

**Last Updated:** February 2, 2026  
**Quick Reference Version:** 1.0
