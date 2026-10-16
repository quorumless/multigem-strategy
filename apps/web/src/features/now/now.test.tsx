import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { presets } from '@/lib/presets'
import { monthsOld, type CurrentSignal } from '@/lib/now'
import { NowView, StaleWarning } from './index'

const input = presets[0]!.config
const signal: CurrentSignal = {
  asOf: '2026-09',
  tradeMonth: '2026-09',
  weights: { ACWXUS: 1 },
  previous: { US: 1 },
  changed: true,
  isRebalanceMonth: true,
  signals: [{ sleeve: 0, lookback: 12, scores: { US: 0.05, ACWXUS: 0.12, AGG: 0.01 }, hurdle: 0.04, picked: ['ACWXUS'], toSafe: false }],
}
const today = new Date(2026, 9, 16) // Oct 2026 → last complete month is Sep 2026

describe('what to hold now', () => {
  it('renders the plain-words headline and the change', async () => {
    const { getByText, container } = await render(<NowView name='Classic GEM' input={input} signal={signal} today={today} />)
    await expect.element(getByText(/Based on data up to end of September 2026/)).toBeInTheDocument()
    expect(container.textContent).toMatch(/hold 100% .*ACWI ex USA/)
    expect(container.textContent).toMatch(/Change: sell .*S&P 500.*buy .*ACWI/)
    expect(container.textContent).not.toMatch(/Data is \d+ month/)
  })
  it('warns when the data is old', async () => {
    expect(monthsOld('2026-09', today)).toBe(0)
    expect(monthsOld('2026-06', today)).toBe(3)
    const { getByText } = await render(<StaleWarning asOf='2026-06' today={today} />)
    await expect.element(getByText(/Data is 3 months old; refresh the data before acting/)).toBeInTheDocument()
  })
  it('says nothing changes outside rebalance months', async () => {
    const { getByText } = await render(<NowView name='X' input={input} signal={{ ...signal, isRebalanceMonth: false }} today={today} />)
    await expect.element(getByText(/not a rebalance month; keep your current holdings/)).toBeInTheDocument()
  })
})
