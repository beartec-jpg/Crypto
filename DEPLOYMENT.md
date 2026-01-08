# Deployment Guide

## Overview
This application is configured for deployment on Vercel with automatic CI/CD integration.

## Vercel Deployment

### Initial Setup
1. **Connect Repository**
   - Visit [vercel.com](https://vercel.com)
   - Import GitHub repository
   - Select the `Crypto` repository

2. **Configure Build Settings**
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `client/dist`
   - Install Command: `npm ci`

3. **Environment Variables**
   Add these in Vercel Dashboard → Settings → Environment Variables:
   ```
   VITE_CLERK_PUBLISHABLE_KEY=your_clerk_key
   VITE_API_URL=your_api_url
   DATABASE_URL=your_database_url
   ```

### Automatic Deployments
- **Production:** Every push to `main` branch
- **Preview:** Every pull request
- **Build Time:** ~2-3 minutes

### vercel.json Configuration
The project includes a `vercel.json` with:
- Build commands and output directory
- API function configuration
- URL rewrites for SPA routing
- CORS headers for API endpoints
- Cache headers for optimized assets

## GitHub Actions CI/CD

### Test Workflow (`test.yml`)
Runs on every push and pull request to `main` and `develop`:
1. Install dependencies
2. Run test suite
3. Generate coverage report
4. Upload coverage to Codecov
5. Comment coverage on PR

**Matrix Testing:**
- Node.js 18.x
- Node.js 20.x

### Build Workflow (`build.yml`)
Runs on every push and pull request to `main`:
1. Install dependencies
2. Build application
3. Generate bundle analysis
4. Check bundle size limits
5. Upload bundle stats as artifact

**Bundle Size Limits:**
- Main bundle: 400KB max
- D3 vendor: 300KB max
- UI vendor: 150KB max
- React vendor: 150KB max

## Pre-Deployment Checklist

### Before Merging to Main
- [ ] All tests passing locally
- [ ] Coverage meets 70% threshold
- [ ] Bundle size within limits
- [ ] TypeScript compiles without errors
- [ ] No console errors in browser
- [ ] Performance metrics reviewed

### Before Production Deploy
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] API endpoints tested
- [ ] Error tracking configured (optional)
- [ ] Performance monitoring enabled

## Build Commands

### Local Development
```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run preview      # Preview production build
```

### Testing
```bash
npm test             # Run tests in watch mode
npm run test:run     # Run tests once
npm run test:coverage # Generate coverage report
```

### Quality Checks
```bash
npm run check        # TypeScript type checking
npm run analyze      # Bundle analysis
npm run check:bundle # Verify bundle sizes
```

## Performance Optimization

### Asset Caching
Configured in `vercel.json`:
- **Vendor chunks:** 1 year immutable cache
- **Main bundle:** 1 hour with revalidation
- **Static assets:** Long-term caching with hash-based versioning

### Bundle Splitting
- React vendor chunk (142KB)
- UI vendor chunk (133KB)
- D3 vendor chunk (282KB) - lazy loaded
- Route-based code splitting
- Query vendor chunk (41KB)

### Loading Strategy
1. **Initial Load:** Core vendors + landing page (~350KB)
2. **Route Navigation:** Load route chunks on demand
3. **Feature Access:** Load D3 when CryptoSandbox accessed
4. **Progressive Enhancement:** Load features as needed

## Monitoring

### Performance Tracking
Web Vitals automatically tracked:
- **LCP** (Largest Contentful Paint)
- **FID** (First Input Delay)
- **FCP** (First Contentful Paint)
- **TTFB** (Time to First Byte)
- **CLS** (Cumulative Layout Shift)

### Error Tracking
Global error handlers configured:
- Uncaught errors
- Unhandled promise rejections
- React error boundaries

### Optional Integrations
To enable advanced monitoring:
1. Install Sentry: `npm install @sentry/react`
2. Uncomment Sentry code in `lib/errorTracking.ts`
3. Add `VITE_SENTRY_DSN` environment variable

## Troubleshooting

### Build Failures

#### TypeScript Errors
```bash
npm run check
# Fix errors and rebuild
```

#### Bundle Size Exceeded
```bash
npm run analyze
# Review stats.html to identify large dependencies
# Refactor or lazy load heavy features
```

#### Test Failures
```bash
npm run test:run
# Fix failing tests
# Verify coverage meets threshold
```

### Deployment Failures

#### Environment Variables Missing
- Check Vercel dashboard → Settings → Environment Variables
- Ensure all required variables are set
- Redeploy after adding variables

#### API Routes Not Working
- Verify `vercel.json` rewrites are correct
- Check API function paths match expected routes
- Review function logs in Vercel dashboard

#### Assets Not Loading
- Check build output directory: `client/dist`
- Verify Vercel output directory setting
- Check asset paths in browser network tab

## Rollback Procedure

### Vercel Rollback
1. Go to Vercel Dashboard
2. Select your project
3. Navigate to Deployments
4. Find previous working deployment
5. Click "⋯" → "Promote to Production"

### Git Rollback
```bash
# Revert last commit
git revert HEAD
git push origin main

# Or rollback to specific commit
git reset --hard <commit-hash>
git push --force origin main
```

## Security

### Environment Variables
- Never commit secrets to repository
- Use Vercel environment variables
- Rotate keys regularly
- Use different keys for production/preview

### Dependencies
- Review `npm audit` regularly
- Update dependencies with security patches
- Test thoroughly after updates

### CORS Configuration
- API endpoints have CORS configured
- Adjust in `vercel.json` as needed
- Restrict origins in production

## Post-Deployment Verification

### Smoke Tests
1. Visit production URL
2. Test main navigation
3. Verify API endpoints responding
4. Check console for errors
5. Test critical user flows

### Performance Checks
1. Run Lighthouse audit
2. Check Core Web Vitals
3. Verify bundle sizes in Network tab
4. Test lazy loading behavior
5. Confirm caching working

### Monitoring
1. Check error tracking dashboard
2. Review performance metrics
3. Monitor API response times
4. Check database connections
5. Verify cron jobs running

## Support

### Issues
- Check GitHub Actions logs
- Review Vercel deployment logs
- Check browser console for client errors
- Review server logs for API errors

### Resources
- [Vercel Documentation](https://vercel.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [GitHub Actions Docs](https://docs.github.com/en/actions)
