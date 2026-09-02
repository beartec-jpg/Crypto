import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'
import { HelmetProvider } from 'react-helmet-async'
import { Router } from 'wouter'
import CryptoLanding from '@/pages/CryptoLanding'
import CryptoPricing from '@/pages/CryptoPricing'
import CryptoContact from '@/pages/CryptoContact'
import NotFound from '@/pages/not-found'
import CryptoPrivacy from '@/pages/CryptoPrivacy'
import CryptoTerms from '@/pages/CryptoTerms'
import CryptoLogin from '@/pages/CryptoLogin'

vi.mock('@assets/grok_video_2025-11-13-19-48-28_1763063433278.mp4', () => ({
  default: 'hero.mp4',
}))

vi.mock('@assets/beartec logo_1763645889028.png', () => ({
  default: 'logo.png',
}))

function renderPage(ui: ReactElement) {
  return render(
    <HelmetProvider>
      <Router>{ui}</Router>
    </HelmetProvider>
  )
}

describe('Marketing homepage', () => {
  it('shows a sparse hero and keeps the indicator list off the first heading', () => {
    renderPage(<CryptoLanding />)

    expect(screen.getByRole('heading', { level: 1, name: 'BearTec' })).toBeInTheDocument()
    expect(screen.getByText('Charts that explain themselves.')).toBeInTheDocument()
    expect(screen.getByText('Free indicators. Optional AI.')).toBeInTheDocument()
    expect(screen.getAllByTestId('cta-get-free-charts').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('cta-sign-in').length).toBeGreaterThan(0)
    expect(screen.getByTestId('hero-scroll')).toHaveTextContent('Scroll')
    expect(screen.queryByText('BREAK THE SEAL')).not.toBeInTheDocument()
    expect(screen.queryByText('TO ENTER')).not.toBeInTheDocument()
    expect(screen.queryByText(/Falcon PL/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/QBTC/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/wallet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/testnet/i)).not.toBeInTheDocument()
  })

  it('puts tools, plans, risk, and footer after the hero', () => {
    renderPage(<CryptoLanding />)

    expect(screen.getByText('Free with email')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'The tools, in English.' })).toBeInTheDocument()
    expect(screen.getByText('Oscillators')).toBeInTheDocument()
    expect(screen.getByText('RSI, MACD, Stoch RSI, MFI, OBV, Williams %R, CCI, ADX')).toBeInTheDocument()
    expect(screen.getByText('Pay only for AI.')).toBeInTheDocument()
    expect(screen.getByText('Free — charts and indicators')).toBeInTheDocument()
    expect(screen.getByText('Core £15/mo — 1 ticker, 80 tokens')).toBeInTheDocument()
    expect(screen.getByText('Charts stay free.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Open a chart.' })).toBeInTheDocument()
    expect(screen.getByTestId('risk-line')).toHaveTextContent(
      'Educational only. Not financial advice. You can lose money.'
    )
    expect(screen.getByTestId('marketing-footer')).toHaveTextContent('© 2026 BEARTEC LTD (17166952).')
    expect(screen.getByText('Privacy')).toBeInTheDocument()
    expect(screen.getByText('Terms')).toBeInTheDocument()
    expect(screen.getByText('Contact')).toBeInTheDocument()
  })
})

describe('Canonical public pages', () => {
  it('renders the pricing table', () => {
    renderPage(<CryptoPricing />)
    expect(screen.getByRole('heading', { name: 'Pay only for AI.' })).toBeInTheDocument()
    expect(screen.getByTestId('pricing-table')).toHaveTextContent('Core')
    expect(screen.getByTestId('pricing-table')).toHaveTextContent('£15/mo')
    expect(screen.getByTestId('pricing-table')).toHaveTextContent('Elite')
    expect(screen.getByText('Charts stay free.')).toBeInTheDocument()
  })

  it('renders contact with the support email', () => {
    renderPage(<CryptoContact />)
    expect(screen.getByRole('heading', { name: 'Contact' })).toBeInTheDocument()
    const mail = screen.getByRole('link', { name: 'beartec@beartec.uk' })
    expect(mail).toHaveAttribute('href', 'mailto:beartec@beartec.uk')
  })

  it('renders a branded 404 instead of null', () => {
    const { container } = renderPage(<NotFound />)
    expect(container).not.toBeEmptyDOMElement()
    expect(screen.getByTestId('not-found-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pricing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contact' })).toBeInTheDocument()
  })

  it('renders the existing login page without requiring Clerk in development', () => {
    renderPage(<CryptoLogin />)
    expect(screen.getByRole('heading', { name: 'BearTec' })).toBeInTheDocument()
    expect(screen.getByText('Development Mode')).toBeInTheDocument()
  })

  it('uses Clerk rather than Replit on legal pages', () => {
    const privacy = renderPage(<CryptoPrivacy />)
    expect(privacy.container).not.toHaveTextContent('Replit')
    expect(privacy.container).toHaveTextContent('Clerk')
    expect(privacy.container).toHaveTextContent('© 2026 BEARTEC LTD (17166952)')
    privacy.unmount()

    const terms = renderPage(<CryptoTerms />)
    expect(terms.container).not.toHaveTextContent('Replit')
    expect(terms.container).toHaveTextContent('Clerk')
    expect(terms.container).toHaveTextContent('© 2026 BEARTEC LTD (17166952)')
  })
})
