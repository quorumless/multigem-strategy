import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { glossary } from '@/lib/glossary'
import { presets } from '@/lib/presets'
import { runBoth } from '@/lib/run'
import { defaultSettings, fromStrategy, validate } from '@/lib/strategy-form'
import { tradeSentence } from '@/lib/trade-sentence'
import { parseConfig } from 'engine'
import { assetLabel } from './assets'
import { Headline } from './results'

const gcfg = presets[0]!.config
const fx = { form: fromStrategy(parseConfig(gcfg)).form, settings: defaultSettings }

describe('builder validation', () => {
  it('explains bad sleeve weights in plain words', () => {
    const form = { ...fx.form, sleeves: [{ ...fx.form.sleeves[0]!, weight: 90 }] }
    expect(validate(form, fx.settings).errors).toContain('Sleeve weights must add up to 100% (now 90%).')
  })
  it('accepts the starting preset', () => {
    expect(validate(fx.form, fx.settings).errors).toEqual([])
  })
})

describe('results', () => {
  const run = runBoth(validate(fx.form, fx.settings).input)

  it('renders the plain-language headline from a real engine run', async () => {
    const { getByText } = await render(<Headline result={run.result!} gross={run.gross!} />)
    await expect.element(getByText(/Simply buying US stocks would have given/)).toBeInTheDocument()
    await expect.element(getByText(/Worst fall/)).toBeInTheDocument()
    await expect.element(getByText(/full years\./)).toBeInTheDocument()
  })

  it('recomputes (both runs) in under 300 ms', () => {
    const ms = Math.min(...[1, 2, 3].map(() => runBoth(validate(fx.form, fx.settings).input).ms))
    expect(ms).toBeLessThan(300)
  })

  it('glossary covers every metric key the engine returns', () => {
    for (const k of Object.keys(run.result!.metrics)) expect(glossary[k], k).toBeDefined()
  })

  it('writes the trade log in sentences', () => {
    const sentences = run.result!.trades.map((t) => tradeSentence(t, run.result!.config, assetLabel))
    expect(sentences.length).toBeGreaterThan(0)
    expect(sentences.some((s) => s.includes('→'))).toBe(true)
  })
})
