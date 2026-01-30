# Bear Tec Crypto Platform

A comprehensive cryptocurrency analysis platform with real-time charting, technical indicators, Elliott Wave analysis, and AI-powered insights.

## Features

### 🚀 Performance Optimized
- **82% bundle size reduction** (2MB → 350KB initial load)
- **Route-based code splitting** for faster navigation
- **Lazy loading** of D3 and heavy features
- **70%+ test coverage** with 143 automated tests

### 📊 Advanced Charting
- Real-time cryptocurrency data
- 8 professional technical indicators (VWAP, Supertrend, Ichimoku Cloud, Order Blocks)
- Dynamic moving averages (up to 6 customizable EMA/SMA lines)
- Elliott Wave analysis with Fibonacci projections
- Custom indicator portal for Python-based indicators

### 🔔 Smart Notifications
- Push notifications for crypto alerts
- SMS fallback via Twilio
- Tier-based alert preferences
- Trade, CCI, and ADX alerts

### 🎓 Educational Tools
- Elliott Wave training
- Pattern recognition
- Fibonacci analysis
- Custom indicator learning

## Development

### Prerequisites
- Node.js 18.x or 20.x
- npm or equivalent package manager
- PostgreSQL database (Neon)

### Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Access at http://localhost:3000
```

### Testing
```bash
# Run tests in watch mode
npm test

# Run tests once (CI mode)
npm run test:run

# Generate coverage report
npm run test:coverage

# Open visual test UI
npm run test:ui
```

### Performance
```bash
# Build for production
npm run build

# Analyze bundle size
npm run analyze

# Check bundle size limits
npm run check:bundle

# Preview production build
npm run preview
```

### Quality Checks
```bash
# TypeScript type checking
npm run check

# Run all tests
npm run test:run

# Coverage report
npm run test:coverage
```

## CI/CD

### GitHub Actions
Two automated workflows:
- **Test Suite** (`test.yml`) - Runs on every push and PR
  - Executes all 143 tests
  - Generates coverage reports
  - Tests on Node 18.x and 20.x
  - Uploads coverage to Codecov

- **Build & Performance** (`build.yml`) - Runs on main branch
  - Production build
  - Bundle size validation
  - Performance regression detection
  - Uploads bundle analysis

## Documentation

- **[PERFORMANCE.md](PERFORMANCE.md)** - Performance optimization guide
- **[TESTING.md](TESTING.md)** - Testing guide and best practices
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment and configuration
- **[METRICS.md](METRICS.md)** - Performance and quality metrics
- **[PHASE_3A_SUMMARY.md](PHASE_3A_SUMMARY.md)** - Phase 3A optimization details

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **shadcn/ui** with Radix UI components
- **Wouter** for routing
- **TanStack Query** for state management
- **D3.js** for advanced visualizations

### Testing
- **Vitest** for unit and integration tests
- **React Testing Library** for component testing
- **143 tests** with 70%+ coverage

### Backend
- **Express.js** with TypeScript
- **PostgreSQL** via Drizzle ORM
- **Clerk** for authentication
- **Stripe** for payments
- **Twilio** for SMS notifications

### Deployment
- **Vercel** for hosting and serverless functions
- **GitHub Actions** for CI/CD
- **Codecov** for coverage tracking

## Architecture

### Bundle Strategy
- **Core vendors** (~350KB): React, UI components, routing
- **Lazy loaded routes**: CryptoSandbox, Indicators, Elliott Wave, AI
- **On-demand D3** (282KB): Only loads when charting features accessed
- **Optimized caching**: Vendor chunks cached for 1 year, app code for 1 hour

### Performance Monitoring
- **Web Vitals** tracking (LCP, FID, CLS, FCP, TTFB)
- **Route load time** monitoring
- **Chunk loading** performance
- **Error tracking** with global handlers

## Phase 3 Completion

### Performance Optimization (Phase 3A) ✅
- ✅ Bundle size: 2MB → 350KB (82% reduction)
- ✅ Route code splitting
- ✅ D3 lazy loading
- ✅ Component memoization
- ✅ Vendor chunk separation

### Testing Infrastructure (Phase 3B) ✅
- ✅ 143 passing tests
- ✅ 70%+ coverage achieved
- ✅ Vitest + React Testing Library
- ✅ Hook, component, and integration tests
- ✅ Coverage thresholds enforced

### CI/CD & Monitoring (Phase 3C) ✅
- ✅ GitHub Actions pipelines
- ✅ Automated testing on every PR
- ✅ Bundle size regression detection
- ✅ Performance monitoring setup
- ✅ Error tracking integration
- ✅ Comprehensive documentation

## Project Structure
```
.
├── .github/
│   └── workflows/          # CI/CD pipelines
├── client/
│   ├── src/
│   │   ├── __tests__/      # Test files
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks
│   │   ├── lib/            # Utilities & monitoring
│   │   ├── pages/          # Route pages
│   │   └── main.tsx        # Entry point
│   └── dist/               # Build output
├── server/                 # Express backend
├── api/                    # Vercel serverless functions
├── scripts/                # Build and utility scripts
├── docs/                   # Additional documentation
├── PERFORMANCE.md          # Performance guide
├── TESTING.md              # Testing guide
├── DEPLOYMENT.md           # Deployment guide
└── METRICS.md              # Metrics and benchmarks
```

## CryptoIndicators Architecture

### Overview

The `CryptoIndicators.tsx` component (~13,875 lines) is being refactored from a monolithic structure into a modular, maintainable architecture. This massive component currently handles charting, technical indicators, Smart Money Concepts (SMC), drawing tools, trading features, AI insights, and more—all in a single file.

**Benefits of Refactoring:**
- **Maintainability**: Each file has a single, clear responsibility
- **Testability**: Isolated functions and components are easier to test
- **Reusability**: Components can be shared across pages
- **Performance**: Better code splitting and lazy loading opportunities
- **Collaboration**: Multiple developers can work on different sections without conflicts
- **Scalability**: Easy to add new features without touching existing code

### Planned File Structure

This refactoring will split the monolithic component into the following modular structure:

```
client/src/
├── pages/
│   └── CryptoIndicators.tsx           # 🎯 Main orchestrator (200-300 lines max)
├── components/
│   ├── chart/                          # Chart rendering & controls
│   │   ├── ChartContainer.tsx
│   │   ├── CandlestickChart.tsx
│   │   ├── ChartControls.tsx
│   │   ├── TimeframeSelector.tsx
│   │   ├── ChartOverlay.tsx
│   │   └── ChartLegend.tsx
│   ├── indicators/                     # Technical indicators
│   │   ├── oscillators/
│   │   │   ├── RSIPanel.tsx
│   │   │   ├── MACDPanel.tsx
│   │   │   ├── StochasticPanel.tsx
│   │   │   ├── OBVPanel.tsx
│   │   │   ├── MFIPanel.tsx
│   │   │   ├── WilliamsRPanel.tsx
│   │   │   ├── CCIPanel.tsx
│   │   │   └── ADXPanel.tsx
│   │   ├── trend/
│   │   │   ├── MovingAverages.tsx
│   │   │   ├── SupertrendOverlay.tsx
│   │   │   ├── IchimokuCloud.tsx
│   │   │   └── BollingerBands.tsx
│   │   └── volume/
│   │       ├── VolumeChart.tsx
│   │       ├── CVDChart.tsx
│   │       ├── CVDTable.tsx
│   │       └── VWAPLines.tsx
│   ├── smc/                            # Smart Money Concepts
│   │   ├── FVGOverlay.tsx
│   │   ├── OrderBlockOverlay.tsx
│   │   ├── BOSCHoCHMarkers.tsx
│   │   ├── SwingPivots.tsx
│   │   ├── LiquidityLevels.tsx
│   │   └── SMCControls.tsx
│   ├── drawings/                       # Drawing tools
│   │   ├── DrawingToolbar.tsx
│   │   ├── TrendlineDrawing.tsx
│   │   ├── HorizontalLineDrawing.tsx
│   │   ├── RectangleDrawing.tsx
│   │   ├── FibonacciRetracement.tsx
│   │   ├── TrendBasedFib.tsx
│   │   ├── ChannelDrawing.tsx
│   │   ├── DrawingContextMenu.tsx
│   │   └── DrawingStylePanel.tsx
│   ├── trading/                        # Trading & backtesting
│   │   ├── TradingPanel.tsx
│   │   ├── BacktestPanel.tsx
│   │   ├── BacktestResults.tsx
│   │   ├── AutoBacktestPanel.tsx
│   │   ├── BotConfiguration.tsx
│   │   ├── PositionManager.tsx
│   │   ├── TradeSignals.tsx
│   │   └── AlertsPanel.tsx
│   ├── watchlist/                      # Watchlist management
│   │   ├── WatchlistPanel.tsx
│   │   ├── TickerSearch.tsx          # ✅ Already exists
│   │   ├── TickerTable.tsx           # ✅ Already exists
│   │   └── TickerCard.tsx
│   ├── ai/                             # AI/Grok features
│   │   ├── GrokPanel.tsx
│   │   ├── MarketReviewButton.tsx
│   │   ├── GrokInsights.tsx
│   │   └── AILoadingState.tsx
│   └── settings/                       # Configuration
│       ├── SettingsPanel.tsx
│       ├── IndicatorSettings.tsx
│       ├── ChartSettings.tsx
│       ├── TradingSettings.tsx
│       └── APISettings.tsx
├── hooks/
│   ├── chart/                          # Chart-specific hooks
│   │   ├── useChartInstance.ts
│   │   ├── useChartSeries.ts
│   │   ├── useChartSync.ts
│   │   └── useChartResize.ts
│   ├── indicators/                     # Indicator hooks
│   │   ├── useOscillators.ts
│   │   ├── useTrendIndicators.ts
│   │   └── useVolumeIndicators.ts
│   ├── smc/                            # SMC detection hooks
│   │   ├── useSMCDetection.ts
│   │   └── useLiquidityAnalysis.ts
│   ├── trading/                        # Trading logic hooks
│   │   ├── useBacktest.ts
│   │   ├── useTradingBot.ts
│   │   └── useMarketAlerts.ts
│   ├── drawings/                       # Drawing tool hooks
│   │   ├── useDrawingTools.ts
│   │   ├── useDrawingPersistence.ts
│   │   └── useDrawingInteractions.ts
│   └── data/                           # Data fetching hooks
│       ├── useCryptoData.ts
│       ├── useWebSocket.ts
│       └── useWatchlist.ts
├── lib/
│   ├── indicators/                     # Calculation functions
│   │   ├── momentum.ts               # RSI, Stochastic, MFI
│   │   ├── trend.ts                  # MACD, ADX, CCI
│   │   ├── volume.ts                 # OBV, CMF, Volume Profile
│   │   └── volatility.ts             # ATR, Bollinger Bands
│   ├── smc/                            # SMC detection algorithms
│   │   ├── fvg.ts
│   │   ├── orderblocks.ts
│   │   ├── bosChoch.ts
│   │   └── pivots.ts
│   ├── chart/                          # Chart utilities
│   │   ├── timeUtils.ts
│   │   ├── priceUtils.ts
│   │   └── colorUtils.ts
│   └── trading/                        # Trading utilities
│       ├── backtesting.ts
│       ├── tpsl.ts
│       └── signals.ts
└── types/
    ├── chart.types.ts                 # Chart-related types
    ├── indicators.types.ts            # ✅ Already exists (extend)
    ├── smc.types.ts                   # SMC types
    ├── drawings.types.ts              # Drawing tool types
    ├── trading.types.ts               # Trading types
    └── api.types.ts                   # API request/response types
```

### Refactoring Strategy

The refactoring will be executed in six carefully planned phases to minimize risk and maintain functionality:

#### Phase 4A: Documentation (Current) ✅
- ✅ Document the planned architecture
- ✅ Create refactoring roadmap
- ✅ Get team alignment on approach

#### Phase 4B: Types & Utilities (Week 1)
- Extract all TypeScript interfaces to `/types` folder
- Extract utility functions to `/lib` folder
- No UI changes, zero user impact
- Maintain 70%+ test coverage

#### Phase 4C: Core Hooks (Week 2)
- Extract custom hooks for chart, indicators, SMC
- Refactor business logic out of component
- Maintain existing functionality
- Add tests for extracted hooks

#### Phase 4D: UI Components (Week 3-4)
- Extract chart components
- Extract indicator panels
- Extract SMC overlays
- Extract drawing tools
- Test each extraction independently

#### Phase 4E: Advanced Features (Week 5)
- Extract trading/backtest panels
- Extract AI/Grok components
- Extract settings panels
- Comprehensive integration testing

#### Phase 4F: Main Page Cleanup (Week 6)
- Refactor CryptoIndicators.tsx to orchestrate extracted components
- Remove duplicated code
- Final testing and optimization
- Performance validation

### Testing Strategy

All refactoring work will maintain the platform's high quality standards:

- **Coverage Target**: Maintain 70%+ test coverage across all new files
- **Unit Tests**: Each extracted function and hook will have dedicated unit tests
- **Component Tests**: UI components tested in isolation with React Testing Library
- **Integration Tests**: Ensure components work together seamlessly
- **Regression Prevention**: No breaking changes to existing functionality
- **CI/CD Validation**: All tests must pass in GitHub Actions before merge

### Migration Approach

To ensure zero downtime and maintain stability:

1. **Incremental Extraction**: One module at a time, never breaking existing code
2. **Feature Flags**: Use feature flags for major changes if needed
3. **Parallel Development**: Old code stays until new code is proven
4. **Code Reviews**: Each phase requires thorough review before proceeding
5. **Performance Monitoring**: Track bundle size and load times throughout
6. **Rollback Plan**: Ability to revert any phase if issues arise

### Expected Outcomes

Upon completion of Phase 4, the CryptoIndicators page will:

- **Reduce main file** from ~13,875 lines to ~250 lines (98% reduction)
- **Improve load time** through better code splitting
- **Enable parallel development** with clear module boundaries
- **Simplify debugging** with isolated, testable units
- **Accelerate feature development** with reusable components
- **Maintain 70%+ test coverage** with comprehensive test suite

## Key Metrics

### Bundle Sizes
| Chunk | Size | Gzipped | Load |
|-------|------|---------|------|
| React vendor | 142KB | 46KB | Initial |
| UI vendor | 133KB | 41KB | Initial |
| D3 vendor | 282KB | 96KB | Lazy |
| CryptoSandbox | 185KB | 32KB | Lazy |

### Performance
- **Initial Load:** ~350KB (82% reduction)
- **Time to Interactive:** ~1.5s
- **Lighthouse Score:** 95+
- **Core Web Vitals:** All green

### Quality
- **Tests:** 143 passing
- **Coverage:** 70%+
- **TypeScript:** 0 errors
- **Security:** 0 critical vulnerabilities

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm run test:run`)
5. Commit changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines
- Maintain 70%+ test coverage
- Keep bundle sizes within limits
- Follow TypeScript best practices
- Write meaningful commit messages
- Update documentation as needed

## License

MIT

## Support

For issues and questions:
- Check documentation in `/docs` folder
- Review `TESTING.md` for test-related questions
- See `DEPLOYMENT.md` for deployment issues
- Check `PERFORMANCE.md` for optimization tips
