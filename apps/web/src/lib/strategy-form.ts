// Form model <-> engine StrategyInput, plus human validation messages. No strategy math here (golden rule 5):
// the engine schema stays the final gate, these checks only translate its complaints into plain English.
import { StrategySchema, type Strategy, type StrategyInput } from 'engine'

export interface SleeveForm {
  id: string
  /** Percent, 0–100. */
  weight: number
  universe: string[]
  /** Whole months 1–12, sorted, unique. */
  lookbacks: number[]
  topN: number
  /** Percent. */
  buffer: number
  invVol: boolean
  /** '' = keep the imported safeHaven (e.g. bestOf) untouched. */
  safeAsset: string
  /** Original sleeve, so options the form has no field for (momentum, absFilter…) survive import → export. */
  raw: Record<string, unknown>
}
export interface FormValues {
  name: string
  sleeves: SleeveForm[]
  rebalance: 'monthly' | 'quarterly'
  executionLag: boolean
  startDate: string
  endDate: string
}
export interface SettingsValues {
  currency: 'USD' | 'PLN' | 'EUR'
  /** Percent. */
  costPct: number
  fxCostPct: number
  taxOn: boolean
  taxRate: number
}

/** Realistic web defaults (PRD U5); engine defaults are unchanged. */
export const defaultSettings: SettingsValues = { currency: 'USD', costPct: 0.1, fxCostPct: 0.2, taxOn: true, taxRate: 19 }

const r6 = (x: number) => Math.round(x * 1e6) / 1e6

export function toInput(f: FormValues, s: SettingsValues): StrategyInput {
  return {
    name: f.name.trim() || 'My strategy',
    sleeves: f.sleeves.map((x) => ({
      ...x.raw,
      id: x.id,
      weight: r6(x.weight / 100),
      universe: x.universe,
      lookbacks: x.lookbacks,
      topN: x.topN,
      buffer: r6(x.buffer / 100),
      weighting: x.invVol ? 'invVol' : 'equal',
      ...(x.safeAsset ? { safeHaven: { mode: 'fixed', asset: x.safeAsset } } : {}),
    })) as StrategyInput['sleeves'],
    ...(f.startDate ? { startDate: f.startDate } : {}),
    ...(f.endDate ? { endDate: f.endDate } : {}),
    settings: {
      rebalance: f.rebalance,
      executionLag: f.executionLag ? 1 : 0,
      currency: s.currency,
      costPct: r6(s.costPct / 100),
      fxCostPct: r6(s.fxCostPct / 100),
      tax: { enabled: s.taxOn, rate: r6(s.taxRate / 100) },
    },
  }
}

export function fromStrategy(c: Strategy): { form: FormValues; settings: SettingsValues } {
  const st = c.settings
  return {
    form: {
      name: c.name,
      sleeves: c.sleeves.map((s) => ({
        id: s.id,
        weight: r6(s.weight * 100),
        universe: s.universe,
        lookbacks: s.lookbacks,
        topN: s.topN,
        buffer: r6(s.buffer * 100),
        invVol: s.weighting === 'invVol',
        safeAsset: s.safeHaven.mode === 'fixed' ? s.safeHaven.asset : '',
        raw: s,
      })),
      rebalance: st.rebalance,
      executionLag: st.executionLag === 1,
      startDate: c.startDate ?? '',
      endDate: c.endDate ?? '',
    },
    settings: { currency: st.currency, costPct: r6(st.costPct * 100), fxCostPct: r6(st.fxCostPct * 100), taxOn: st.tax.enabled, taxRate: r6(st.tax.rate * 100) },
  }
}

export const newSleeve = (id: string, weight: number): SleeveForm => ({
  id,
  weight,
  universe: ['US', 'DEVXUS'],
  lookbacks: [12],
  topN: 1,
  buffer: 0,
  invVol: false,
  safeAsset: 'AGG',
  raw: {},
})

/** Human messages first; the engine schema is the backstop. Empty `errors` ⇒ `input` is safe to backtest. */
export function validate(f: FormValues, s: SettingsValues): { input: StrategyInput; errors: string[] } {
  const errors: string[] = []
  const sum = r6(f.sleeves.reduce((a, x) => a + (Number(x.weight) || 0), 0))
  if (sum !== 100) errors.push(`Sleeve weights must add up to 100% (now ${sum}%).`)
  for (const x of f.sleeves) {
    const tag = f.sleeves.length > 1 ? `Sleeve "${x.id}": ` : ''
    if (x.universe.length === 0) errors.push(`${tag}pick at least one asset to choose from.`)
    if (x.lookbacks.length === 0 || x.lookbacks.some((n) => !Number.isInteger(n) || n < 1 || n > 12))
      errors.push(`${tag}lookback must be whole months between 1 and 12.`)
    if (x.topN > x.universe.length && x.universe.length > 0) errors.push(`${tag}you can't hold ${x.topN} assets when you only picked ${x.universe.length}.`)
    if (x.buffer > 0 && x.topN !== 1) errors.push(`${tag}the switch buffer only works when holding a single asset.`)
    if (x.universe.includes(x.safeAsset)) errors.push(`${tag}the safe haven (${x.safeAsset}) is also in the list to choose from.`)
  }
  if (f.startDate && f.endDate && f.startDate > f.endDate) errors.push('The end month is before the start month.')
  const input = toInput(f, s)
  if (errors.length === 0) {
    const r = StrategySchema.safeParse(input)
    if (!r.success) errors.push(...r.error.issues.map((i) => `${i.path.join('.') || 'strategy'}: ${i.message}`))
  }
  return { input, errors }
}
