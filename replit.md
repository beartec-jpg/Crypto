# Overview

This project is a React-based web application designed for calculating gas purging requirements according to IGE/UP/1 standards. It enables engineers to input project details, pipe configurations, and purge parameters to determine compliance for gas installations. The application features a modern UI, built with React and shadcn/ui, and a Node.js/Express backend that handles calculations and data persistence.

Additionally, it includes a standalone feature for cryptocurrency chart analysis, providing real-time data, technical indicators, and a custom indicator portal for educational purposes.

# User Preferences

- Preferred communication style: Simple, everyday language.
- Testing: User works directly in live environment. DO NOT run automated tests or suggest testing - user tests features themselves in production.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite.
- **UI Components**: shadcn/ui library with Radix UI primitives.
- **Styling**: Tailwind CSS with custom design tokens.
- **State Management**: React hooks for local state, TanStack Query for server state.
- **Routing**: Wouter for client-side routing.
- **Form Management**: React Hook Form with Zod validation.
- **SEO Management**: React Helmet Async for per-page meta tags and Open Graph tags.

## Backend Architecture
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript.
- **API Design**: RESTful endpoints with JSON responses.
- **Calculation Engine**: Custom service for IGE/UP/1 gas purging calculations.
- **Request Validation**: Zod schemas shared between frontend and backend.
- **Security**: Removal of custom Python indicator execution endpoint (RCE risk).
- **Authentication**: Clerk authentication for crypto features (VITE_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY)
- **Development/Production Auth Split**:
  - **Development** (Replit/localhost): Open access with `dev-open-access` user ID, elite tier fallback
  - **Production** (Vercel/beartec.uk): Full Clerk authentication required, real user subscriptions enforced
  - Backend checks `REPLIT_DEPLOYMENT`, `VERCEL`, `NODE_ENV` to determine environment
  - Frontend uses `client/src/lib/apiAuth.ts` centralized auth module:
    - `isDevelopmentMode` derived from hostname (replit/localhost/127.0.0.1)
    - `authenticatedApiRequest()` adds Authorization header in production only
    - `useEnsureAuthReady` hook retries Clerk getToken until valid
  - React Query enabled guards: `isDevelopment || (isAuthenticated && isElite && authReady.ready)`
  - Users are auto-created in crypto_users table if they don't exist
- **Access Model**: Tiered subscription model with capability-based access control
  - Tier hierarchy: free < beginner < intermediate < pro < elite
  - Elliott Wave add-on ($10/mo): Separate purchasable add-on
  - API returns capability flags (canUseElliott, canUseAI, hasUnlimitedAI, etc.)
  - Formula: `canUseElliott = hasElliottAddon OR tier === "elite"`

## Data Storage Solutions
- **Database**: PostgreSQL via Drizzle ORM.
- **Schema Management**: Drizzle Kit for migrations.
- **Connection**: Neon Database (serverless PostgreSQL).
- **Data Models**: Projects, pipe configurations, calculation results, and push notification subscriptions.

## Development and Build Tools
- **Development Server**: Vite dev server with HMR and Express middleware.
- **Type Checking**: TypeScript with strict mode.
- **Code Quality**: ESLint and Prettier.
- **Build Process**: Vite for frontend, esbuild for backend.
- **Package Management**: npm.
- **Error Handling**: React ErrorBoundary component wraps app to prevent white screen crashes.

## Vercel Deployment
- **Build Command**: `npx vite build` (skips TypeScript check for faster builds)
- **Output Directory**: `client/dist`
- **Root Directory**: `.` (project root)
- **Required Environment Variables in Vercel**:
  - `XAI_API_KEY` - Required for AI market analysis features
  - `DATABASE_URL` - PostgreSQL connection string
  - `CLERK_SECRET_KEY` - Clerk authentication backend
  - `VITE_CLERK_PUBLISHABLE_KEY` - Clerk authentication frontend
  - `STRIPE_SECRET_KEY` - Stripe API for subscription payments
  - `STRIPE_WEBHOOK_SECRET` - Stripe webhook signature verification
  - `SITE_URL` - Site URL for redirects (e.g., https://beartec.uk)
  - `COINGLASS_API_KEY` - For predicted liquidation data
  - `COINALYZE_API_KEY` - Fallback for liquidation data
  - `PUBLIC_VAPID_KEY` / `PRIVATE_VAPID_KEY` - Push notifications
- **Serverless Functions**: Located in `/api` folder for Vercel serverless deployment
  - `api/crypto/checkout.ts` - Stripe checkout session creation (authenticated)
  - `api/stripe/webhook.ts` - Stripe webhook handler for subscription sync
  - `api/crypto/liquidations/realtime.ts` - Fetches real liquidation data from Binance/Bybit REST APIs
  - `api/crypto/liquidations/predicted.ts` - Fetches predicted liquidation zones from Coinglass/Coinalyze
  - `api/crypto/my-subscription.ts` - Returns subscription tier with capability flags
  - `api/crypto/market-structure.ts` - Market structure analysis
  - `api/crypto/multi-exchange-orderflow.ts` - Multi-exchange orderflow data
  - `api/binance/klines.ts` - Candlestick data from Binance

## UI/UX and Features
- **Gas Purging Calculators**: Industrial and Commercial calculators for new and existing installations, covering strength, tightness, and purge tests based on IGE/UP/1 standards.
- **Crypto Chart Feature**: Standalone chart with real-time data, multiple cryptocurrencies, flexible timeframes, and built-in technical indicators.
- **Professional Trading Indicators** (8 indicators total):
  - **VWAP Tools**: VWAP Bands (adjustable std dev), Session VWAP (Asia/London/NY)
  - **Trend Tools**: Supertrend (ATR-based signals), SMA (dual moving averages), Ichimoku Cloud (adjustable periods: 9/26/52 default, supports larger timeframes like 18/52/104), Parabolic SAR (dynamic dots)
  - **SMC Tools**: Order Blocks (horizontal zones), Premium/Discount Zones (adjustable lookback: 20-200 candles, default 50)
- **Indicator Settings**: All indicators have adjustable parameters with Save Defaults persistence
- **Custom Indicator Portal (Crypto)**: Allows users to paste Python code for technical indicators for demo/learning purposes, with security measures like restricted builtins, code length limits, and timeout enforcement.
- **Push Notification System**: Comprehensive alert preferences system for crypto, with database persistence, tier-based access control, and service worker registration.
  - **Trade Alerts**: Entry/SL/TP notifications for tracked trades with 30-second price monitoring
  - **CCI Indicator Alerts**: Detect crosses above +100 (overbought), below -100 (oversold), and above/below 0 (momentum shifts) - Intermediate+ tiers only
  - **ADX Indicator Alerts**: Detect crosses above 25 (strong trend), below 20 (ranging), and +DI/-DI crossovers (directional changes) - Intermediate+ tiers only
  - **Alert State Tracking**: Persistent state storage in `indicatorAlertState` table prevents duplicate alerts and enables cross detection
  - **Crypto-Specific Notifications**: Separate `sendCryptoNotification` method handles UUID-based crypto users independently from calculator users
- **Mobile Responsiveness**: Header controls optimized for mobile screens.
- **Error Handling**: Graceful AI error handling and race condition fixes for chart updates using AbortController.
- **SEO Optimization**: Each crypto page (Indicators, AI Analysis, Training) has unique title, description, and Open Graph tags using React Helmet Async for proper social media sharing and search engine indexing.
- **Elliott Wave Diagonal Patterns**: Unified "Diagonal" pattern type with auto-classification:
  - System automatically detects contracting vs expanding diagonals based on trendline convergence
  - Trendlines connect W2→W4 (lower boundary) and W1→W3 (upper boundary), extended to W5 time
  - Classification shown in validation panel: "Contracting Diagonal", "Expanding Diagonal", or "Parallel Diagonal (unusual)"
  - Diagonal-specific Fibonacci rules: wave2 50-88.6%, wave3 61.8-161.8%, wave4 50-78.6%, wave5 38.2-123.6% of W3
  - **Prediction Fibs**: Two sets of projections for waves 2-5 (contracting in yellow, expanding in cyan)
  - Future candle attachment: Click on projection lines to snap points to predicted levels beyond current candles
- **Chain Prediction with Conditional Wave A Projections**:
  - Click on predicted W5 point to start ABC correction when drawing mode OFF or with 0 points
  - **Requires complete 5-wave impulse of same degree**: System finds parent impulse with 6 points matching selected degree
  - `correctionContextRef` stores parent pattern data (labelId, degree, points, W0/W4/W5 prices, trend direction)
  - **Wave A projections** only appear when correction context exists:
    - Red/coral lines: 38.2%, 50%, 61.8% retracement of full impulse
    - Purple lines: 100%, 127.2%, 161.8% extension of Wave 5
    - Blue solid line: Wave 4 support/resistance level
  - Context cleared on pattern save, clear points, or pattern type change
- **Wave Stack Degree Enforcement**:
  - Pattern sequence analysis (5-3-5-3-5, etc.) only counts patterns of the SAME DEGREE
  - Different degree patterns are nested subwaves, not continuations of the sequence
  - System finds highest (most significant) degree with patterns and analyzes only those
  - Suggestions now include degree name: "Minor: Impulse + correction - building W1-W2"
  - Lower degree patterns within the stack are shown but don't affect sequence counting
- **Nested 1-2, 1-2 Detection (Uber Bullish/Bearish Setup)**:
  - Detects W1-W2 patterns (5-3) at multiple degree levels simultaneously
  - When 2+ degrees have 5-3 patterns with same direction = nested setup detected
  - Shows "🚀 1-2, 1-2 setup (Minor + Minute) - UBER BULLISH on confirmation!"
  - Triple nested (3 degrees) shows "Triple 1-2" setup
  - Direction-aware: bullish for upward impulses, bearish for downward
- **Wave Stack Fibonacci Projections**:
  - Automatic projection targets based on Wave Stack pattern analysis
  - `analyzeWaveStack()` returns `ProjectionContext` with anchor prices and Fib levels
  - **Retracement levels** (amber): W2 (38.2-78.6% of W1), W4 (23.6-50% of W3)
  - **Extension levels** (cyan): W3/W5/C/Y (61.8-161.8% of prior wave)
  - Click individual levels or "Show All" to add projection lines to chart
  - "Clear Lines" button removes all Stack projection lines
  - Cross-degree analysis includes projections (e.g., higher impulse + lower A-B → C wave targets)
  - Triangle patterns (B/X/4 waves) show C/Y/5 extension targets

# External Dependencies

- **Database Provider**: Neon Database (serverless PostgreSQL).
- **UI Component System**: Radix UI.
- **Styling Framework**: Tailwind CSS.
- **Font Services**: Google Fonts (Inter, DM Sans, Fira Code, Geist Mono).
- **Icons**: Lucide React.
- **Date Handling**: date-fns.
- **Cryptocurrency Data**: Yahoo Finance API (for crypto charts).
- **Push Notifications**: Web Push APIs, VAPID.
- **AI Analysis**: xAI Grok-4 API via OpenAI SDK (baseURL: api.x.ai, 120s timeout).