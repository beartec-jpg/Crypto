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
- **Access Model**: Open access - no authentication required. All features available without login.
  - All route middleware bypassed (pass-through stubs)
  - Stripe payment integration removed
  - OAuth modules deleted (cryptoAuth.ts, googleAuth.ts, replitAuth.ts)

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
- **Serverless Functions**: Located in `/api` folder for Vercel serverless deployment

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