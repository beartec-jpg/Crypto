import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import path from 'path'

describe('production client router', () => {
  const app = readFileSync(path.resolve(process.cwd(), 'client/src/App.tsx'), 'utf8')
  const vercel = readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')
  const apiIndex = readFileSync(path.resolve(process.cwd(), 'api/index.ts'), 'utf8')
  const auth = readFileSync(path.resolve(process.cwd(), 'client/src/hooks/useCryptoAuth.ts'), 'utf8')

  it('does not import or register QBTC pages, wallet, or marketplace', () => {
    expect(app).not.toMatch(/QBTCFaucet|QBTCScan|QBTCHomePage|QBTCMining|QBTCMarketplace/)
    expect(app).not.toMatch(/pages\/Wallet/)
    expect(app).not.toMatch(/path="\/qbtc/)
    expect(app).not.toMatch(/path="\/wallet"/)
    expect(app).not.toMatch(/path="\/marketplace"/)
    expect(app).not.toMatch(/SHOW_QBTC/)
  })

  it('404s /admin and /dev on the public production host', () => {
    expect(app).toMatch(/function InternalOnlyRoute/)
    expect(app).toMatch(/path="\/admin"/)
    expect(app).toMatch(/path="\/admin\/users"/)
    expect(app).toMatch(/path="\/dev\/analytics"/)
    expect(app).toMatch(/path="\/dev\/sandbox"/)
    expect(app).toContain('<InternalOnlyRoute component={DevAnalytics} />')
    expect(app).toContain('<InternalOnlyRoute component={AdminPanel} />')
    expect(app).toContain('<InternalOnlyRoute component={CryptoSandbox} />')
    expect(auth).not.toMatch(/pathname.*\/dev/)
  })

  it('does not enumerate a public API on /api', () => {
    expect(apiIndex).not.toMatch(/availableEndpoints/)
    expect(apiIndex).not.toMatch(/Access-Control-Allow-Origin/)
    expect(apiIndex).toMatch(/status\(404\)/)
    expect(vercel).not.toMatch(/Access-Control-Allow-Origin/)
    expect(vercel).toMatch(/admin\(\?:\/\|\$\)\|dev\(\?:\/\|\$\)/)
  })
})
