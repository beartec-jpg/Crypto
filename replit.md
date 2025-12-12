# Overview

This project is a React-based web application designed for calculating gas purging requirements according to IGE/UP/1 standards, enabling engineers to determine compliance for gas installations. It also features a standalone cryptocurrency chart analysis tool providing real-time data, technical indicators, and an educational custom indicator portal. The application aims to offer essential tools for both engineering compliance and financial market analysis.

# User Preferences

- Preferred communication style: Simple, everyday language.
- Testing: User works directly in live environment. DO NOT run automated tests or suggest testing - user tests features themselves in production.

# System Architecture

## Frontend
- **Framework**: React with TypeScript (Vite).
- **UI**: shadcn/ui with Radix UI primitives.
- **Styling**: Tailwind CSS.
- **State Management**: React hooks (local), TanStack Query (server).
- **Routing**: Wouter.
- **Form Management**: React Hook Form with Zod validation.
- **SEO**: React Helmet Async.

## Backend
- **Runtime**: Node.js with Express.js (TypeScript).
- **API**: RESTful JSON endpoints.
- **Calculations**: Custom IGE/UP/1 gas purging service.
- **Validation**: Zod schemas (shared).
- **Authentication**: Clerk (with development/production split and tiered access control: free, beginner, intermediate, pro, elite, Elliott Wave add-on).
- **Access Model**: Capability-based access control tied to subscription tiers.

## Data Storage
- **Database**: PostgreSQL via Drizzle ORM.
- **Schema Management**: Drizzle Kit.
- **Connection**: Neon Database.
- **Models**: Projects, pipe configurations, calculation results, push notification subscriptions.

## Development & Deployment
- **Build**: Vite (frontend), esbuild (backend).
- **Deployment**: Vercel (serverless functions in `/api`).
- **Error Handling**: React ErrorBoundary.

## Key Features
- **Gas Purging Calculators**: Industrial and Commercial, based on IGE/UP/1.
- **Crypto Charting**: Real-time data, multiple cryptocurrencies, flexible timeframes, 8 professional trading indicators (VWAP, Supertrend, Ichimoku Cloud, Order Blocks, etc.) with adjustable parameters and save defaults.
- **Custom Indicator Portal**: Secure execution of Python-based technical indicators for learning.
- **Push & SMS Notifications**: Comprehensive alert preferences for crypto (Trade, CCI, ADX alerts), tier-based access, Twilio integration for SMS fallback, Vercel Cron for alert checks.
- **Dynamic Moving Averages**: Add/remove up to 6 customizable EMA/SMA lines with configurable periods and timeframes.
- **Indicator Layer Ordering**: Drag-and-drop reordering of chart indicators via "Layers" button, with localStorage persistence and category organization (UI/persistence phase - chart rendering integration pending).
- **Mobile Responsiveness**: Optimized header controls.
- **Elliott Wave Analysis**:
    - Diagonal Patterns: Auto-classification (contracting/expanding), Fibonacci rules, prediction Fibs, future candle attachment.
    - Chain Prediction: Conditional Wave A/C projections (same-degree ABC or cross-degree C wave extensions).
    - Wave Stack Degree Enforcement: Analysis of patterns of the same degree, nested 1-2, 1-2 detection for "Uber Bullish/Bearish" setups.
    - Fibonacci Projections: Automatic retracement and extension targets based on Wave Stack analysis.
    - Projection Mode: Toggle between ABC (WXY) and 12345 (impulse) ratios.
    - Simulated Wave Overlay: Generate future 3-wave or 5-wave patterns to selected Fibonacci targets.

# External Dependencies

- **Database**: Neon Database (PostgreSQL).
- **UI Components**: Radix UI.
- **Styling**: Tailwind CSS.
- **Fonts**: Google Fonts (Inter, DM Sans, Fira Code, Geist Mono).
- **Icons**: Lucide React.
- **Date Utilities**: date-fns.
- **Cryptocurrency Data**: Yahoo Finance API.
- **Push Notifications**: Web Push APIs, VAPID.
- **AI Analysis**: xAI Grok-4 API via OpenAI SDK.
- **Authentication**: Clerk.
- **Payments**: Stripe.
- **Liquidation Data**: Coinglass, Coinalyze.
- **SMS Notifications**: Twilio.