import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import path from 'path'

describe('production client router', () => {
  const app = readFileSync(path.resolve(process.cwd(), 'client/src/App.tsx'), 'utf8')

  it('does not import or register QBTC pages, wallet, or marketplace', () => {
    expect(app).not.toMatch(/QBTCFaucet|QBTCScan|QBTCHomePage|QBTCMining|QBTCMarketplace/)
    expect(app).not.toMatch(/pages\/Wallet/)
    expect(app).not.toMatch(/path="\/qbtc/)
    expect(app).not.toMatch(/path="\/wallet"/)
    expect(app).not.toMatch(/path="\/marketplace"/)
    expect(app).not.toMatch(/SHOW_QBTC/)
  })
})
