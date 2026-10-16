import { backtest, type Metrics } from 'engine'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { data } from '@/data/source'
import { bestIndexes } from '@/lib/compare'
import { betterWhen } from '@/lib/glossary'
import { presets } from '@/lib/presets'
import { fragileCheck, isFragile, shiftLookbacks } from '@/lib/sensitivity'
import { MetricsTable } from './index'

describe('compare best-value highlighting', () => {
  it('respects direction: closer to 0 for drawdown, lower for volatility, nulls never win', () => {
    expect(betterWhen.maxDrawdown).toBe('higher')
    expect([...bestIndexes([-0.3, -0.2, -0.5], betterWhen.maxDrawdown)]).toEqual([1])
    expect([...bestIndexes([0.2, 0.1], betterWhen.volatility)]).toEqual([1])
    expect([...bestIndexes([null, 5, 3], 'lower')]).toEqual([2])
  })

  it('marks one best cell per row in the rendered table', async () => {
    const results = presets.slice(0, 2).map((p) => backtest(p.config, data))
    const { container } = await render(<MetricsTable results={results} />)
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBeGreaterThan(5)
    for (const r of rows) expect(r.querySelectorAll('[data-best="true"]').length).toBeLessThanOrEqual(2)
    expect(container.querySelectorAll('[data-best="true"]').length).toBeGreaterThan(0)
  })
})

describe('fragile badge logic', () => {
  const m = (cagr: number, maxDrawdown: number) => ({ cagr, maxDrawdown }) as Metrics
  it('flags CAGR moves > 2pp or max drawdown moves > 5pp', () => {
    expect(isFragile(m(0.08, -0.2), [m(0.055, -0.2)])).toBe(true)
    expect(isFragile(m(0.08, -0.2), [m(0.08, -0.26)])).toBe(true)
    expect(isFragile(m(0.08, -0.2), [m(0.075, -0.22), m(0.09, -0.19)])).toBe(false)
  })
  it('shifts lookbacks within 1–12 and runs on a real preset', () => {
    const s = shiftLookbacks(presets[0]!.config, 1).sleeves[0]!
    expect(s.lookbacks).toEqual([12])
    expect(typeof fragileCheck(presets[0]!.config, data).fragile).toBe('boolean')
  })
})
