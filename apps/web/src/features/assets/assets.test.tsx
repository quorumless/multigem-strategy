import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { AssetsContent, CorrelationGrid } from './index'

describe('assets page', () => {
  it('renders an N×N correlation grid', async () => {
    const { container } = await render(<CorrelationGrid ids={['US', 'AGG', 'GOLD']} />)
    expect(container.querySelectorAll('[data-testid=corr-cell]').length).toBe(9)
  })
  it('flags an investable example that tracks a different index', async () => {
    const { getByText } = await render(<AssetsContent />)
    await expect.element(getByText(/Tracks FTSE All-World ex US/).first()).toBeInTheDocument()
  })
})
