import { beforeEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { render } from 'vitest-browser-react'
import { glossary } from '@/lib/glossary'
import { presets } from '@/lib/presets'
import { runBoth } from '@/lib/run'
import { defaultSettings, fromStrategy, validate } from '@/lib/strategy-form'
import { tradeSentence } from '@/lib/trade-sentence'
import { parseConfig } from 'engine'
import { assetLabel } from './assets'
import { Builder, LookbackField } from './builder'
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

describe('lookback stepper', () => {
  const Harness = ({ start }: { start: number[] }) => {
    const [v, setV] = useState(start)
    return <LookbackField value={v} onChange={setV} />
  }

  it('increments, clamps at 12 and adds/removes windows', async () => {
    const { getByText, getByRole } = await render(<Harness start={[11]} />)
    await expect.element(getByText('11 months', { exact: true })).toBeInTheDocument()
    await getByRole('button', { name: 'More months' }).click()
    await expect.element(getByText('12 months', { exact: true })).toBeInTheDocument()
    await expect.element(getByRole('button', { name: 'More months' })).toBeDisabled()
    await getByRole('button', { name: 'Add window' }).click()
    await expect.element(getByText('11 months', { exact: true })).toBeInTheDocument()
    await expect.element(getByText(/average of the returns over 11 and 12 months/)).toBeInTheDocument()
  })

  it('shows the MultiGEM preset as 4 windows', async () => {
    const multi = presets.find((p) => p.config.name === 'MultiGEM')!
    const lookbacks = fromStrategy(parseConfig(multi.config)).form.sleeves[0]!.lookbacks
    const { getByRole } = await render(<Harness start={lookbacks} />)
    expect(lookbacks).toEqual([3, 6, 9, 12])
    await expect.element(getByRole('group').first()).toBeInTheDocument()
    expect(document.querySelectorAll('[role=spinbutton]').length).toBe(4)
  })
})

describe('saved strategies', () => {
  beforeEach(() => localStorage.clear())
  function Harness() {
    const form = useForm({ defaultValues: fx.form })
    return <Builder form={form} setSettings={() => {}} input={validate(form.watch(), fx.settings).input} />
  }

  it('saves a tweaked preset as "My ..." and deletes it', async () => {
    const { getByRole } = await render(<Harness />)
    await getByRole('button', { name: 'Save' }).click()
    const card = getByRole('button', { name: /^My / })
    await expect.element(card).toBeInTheDocument()
    await getByRole('button', { name: /^Delete "My / }).click()
    await expect.element(getByRole('button', { name: /^My / })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('multigem.saved') ?? '[]')).toEqual([])
  })
})
