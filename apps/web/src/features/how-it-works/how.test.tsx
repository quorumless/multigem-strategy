import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { presets } from '@/lib/presets'
import { runBoth } from '@/lib/run'
import { Walkthrough } from './index'

describe('explainer', () => {
  it('shows real signals from the 2008 switch (scores vs the T-bill hurdle)', async () => {
    const { getByText, container } = await render(<Walkthrough />)
    await expect.element(getByText(/Moving out: /)).toBeInTheDocument()
    await expect.element(getByText(/The bar to beat \(T-bills\)/).first()).toBeInTheDocument()
    expect(container.textContent).toMatch(/Moving out: \w+ (2007|2008|2009)/)
    expect(container.textContent).toMatch(/Momentum over the last 12 months/)
    expect(container.textContent).toMatch(/-?\d+\.\d%/)
  })
})

describe('engine data errors', () => {
  it('turn into a friendly message instead of crashing', () => {
    const run = runBoth({ ...presets[0]!.config, startDate: '2090-01' })
    expect(run.result).toBeUndefined()
    expect(run.error).toMatch(/isn't enough data for that period/)
  })
})
