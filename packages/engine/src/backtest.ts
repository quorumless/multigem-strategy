// Signal (§4), timing/accounting (§5), currency/tax (§6), benchmarks (§9) of docs/STRATEGY_SPEC.md.
import { parseConfig, type Sleeve, type Strategy, type StrategyInput } from './config.ts'
import { DataError, type MonthlyData } from './data.ts'
import {
  annualReturns,
  computeDrawdown,
  computeMetrics,
  computeRelative,
  monthlyReturns,
  type AnnualReturn,
  type Metrics,
  type RelativeMetrics,
} from './metrics.ts'

export type Weights = Record<string, number>
export interface SeriesPoint {
  date: string
  /** Reporting-currency value, 1 at start. */
  value: number
  drawdown: number
  /** Weights after this month-end's trade (held during the next month); drifted weights if no trade. */
  weights: Weights
}
/** Inputs and outcome of one selection run (per sleeve and lookback), exactly as the decision used them. */
export interface SleeveSignal {
  sleeve: number
  /** L for a blend-mode run; null in average mode, where scores/hurdle are the lookback averages. */
  lookback: number | null
  /** Momentum score per universe/safe-haven asset; hurdle null = absFilter off. */
  scores: Record<string, number>
  hurdle: number | null
  /** Risky assets that got a slot (passed the hurdle). */
  picked: string[]
  /** At least one slot went to the safe haven. */
  toSafe: boolean
}
export interface Trade {
  date: string
  from: Weights
  to: Weights
  turnover: number
  /** Amounts in reporting currency (same units as `value`). */
  cost: number
  tax: number
  /** One entry per (sleeve, lookback run) of the decision this trade executes ([] for tax-only rows). */
  signals: SleeveSignal[]
}
export interface RunResult {
  metrics: Metrics
  series: SeriesPoint[]
  /** Every calendar year in the run; `full` = all 12 months present (same rule as best/worst year). */
  annual: AnnualReturn[]
  /** Return of each month after the start, `date` = that month. */
  monthly: { date: string; return: number }[]
}
export type BenchmarkId = 'BH_US' | '6040' | 'EW'
export interface BacktestResult extends RunResult {
  config: Strategy
  range: { start: string; end: string }
  trades: Trade[]
  benchmarks: Partial<Record<BenchmarkId, RunResult>>
  /** Strategy vs BH_US; null (with a warning) when BH_US is unavailable. */
  relative: ({ vs: 'BH_US' } & RelativeMetrics) | null
  warnings: string[]
}

const TBILL = 'TBILL'

function col(data: MonthlyData, a: string) {
  const c = data.series[a]
  if (!c) throw new DataError(`no data column for ${a}`)
  return c
}

function px(data: MonthlyData, a: string, t: number) {
  const v = col(data, a)[t]
  if (v == null) throw new DataError(`missing ${a} at ${data.dates[t]}`)
  return v
}

const ret = (data: MonthlyData, a: string, t: number) => px(data, a, t) / px(data, a, t - 1) - 1

/** §4 momentum score; uses P up to t only. */
export function score(data: MonthlyData, a: string, t: number, L: number, mode: Sleeve['momentum']) {
  return mode === 'total' ? px(data, a, t) / px(data, a, t - L) - 1 : px(data, a, t - 1) / px(data, a, t - L - 1) - 1
}

/** Sample stdev of the last 12 monthly returns ending at t. */
// σ uses the sample stdev (n-1), consistent with §7 volatility.
function sigma(data: MonthlyData, a: string, t: number) {
  const r = Array.from({ length: 12 }, (_, i) => ret(data, a, t - 11 + i))
  const m = r.reduce((x, y) => x + y, 0) / 12
  const s = Math.sqrt(r.reduce((x, y) => x + (y - m) ** 2, 0) / 11)
  // Zero/non-finite σ (stale or constant prices) would give NaN weights: treat it as a data problem.
  if (!(s > 0 && Number.isFinite(s))) throw new DataError(`invVol: zero or invalid volatility for ${a} at ${data.dates[t]}`)
  return s
}

const havens = (s: Sleeve) => (s.safeHaven.mode === 'fixed' ? [s.safeHaven.asset] : s.safeHaven.assets)
const referenced = (s: Sleeve) => [...new Set([...s.universe, ...havens(s), ...(s.absFilter === 'tbill' ? [TBILL] : [])])]

const add = (w: Weights, a: string, x: number) => {
  w[a] = (w[a] ?? 0) + x
}

/** One selection pass (§4 steps 1–5) given scores. Returns weights and the risky pick (buffer incumbent). */
function select(data: MonthlyData, s: Sleeve, t: number, S: Weights, hurdle: number, incumbent: string | null) {
  const ranked = [...s.universe].sort((a, b) => S[b]! - S[a]!) // stable: ties keep universe order
  let picks = ranked.slice(0, s.topN)
  // Buffer = 0 means disabled: "≤ 0" would let an exact tie keep the incumbent, contradicting the step-1
  // tie rule; buffer is treated as disabled when 0.
  if (s.buffer > 0 && incumbent && picks[0] !== incumbent && S[picks[0]!]! - S[incumbent]! <= s.buffer) picks = [incumbent]
  const haven =
    s.safeHaven.mode === 'fixed'
      ? s.safeHaven.asset
      : s.safeHaven.assets.reduce((best, a) => (S[a]! > S[best]! ? a : best)) // no hurdle; ties → array order
  const slots = picks.map((a) => (S[a]! > hurdle ? a : null)) // null = safe haven
  const w: Weights = {}
  const N = s.topN
  if (s.weighting === 'equal') {
    for (const a of slots) add(w, a ?? haven, 1 / N)
  } else {
    const risky = slots.filter((a): a is string => a !== null)
    const inv = risky.map((a) => 1 / sigma(data, a, t))
    const tot = inv.reduce((x, y) => x + y, 0)
    for (const a of slots) if (a === null) add(w, haven, 1 / N)
    risky.forEach((a, i) => add(w, a, (risky.length / N) * (inv[i]! / tot)))
  }
  const picked = slots.filter((a): a is string => a !== null)
  return { w, pick: slots[0] ?? null, picked, toSafe: picked.length < slots.length }
}

/** Sleeve target weights at t (§4) plus the signals used. `inc` holds buffer incumbents per lookback key; mutated. */
function sleeveWeights(data: MonthlyData, s: Sleeve, t: number, inc: Map<string, string | null>, sleeve: number) {
  const assets = [...new Set([...s.universe, ...havens(s)])]
  const scores = (L: number) => Object.fromEntries(assets.map((a) => [a, score(data, a, t, L, s.momentum)]))
  const hurdle = (L: number) => (s.absFilter === 'tbill' ? score(data, TBILL, t, L, s.momentum) : s.absFilter === 'zero' ? 0 : -Infinity)
  const runs: SleeveSignal[] = []
  const run = (key: string, S: Weights, h: number, lookback: number | null) => {
    const r = select(data, s, t, S, h, inc.get(key) ?? null)
    inc.set(key, r.pick)
    runs.push({ sleeve, lookback, scores: S, hurdle: Number.isFinite(h) ? h : null, picked: r.picked, toSafe: r.toSafe })
    return r.w
  }
  const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length
  if (s.lookbackMode === 'average' || s.lookbacks.length === 1) {
    const per = s.lookbacks.map(scores)
    const S = Object.fromEntries(assets.map((a) => [a, mean(per.map((p) => p[a]!))]))
    const lookback = s.lookbackMode === 'average' ? null : s.lookbacks[0]!
    return { w: run('avg', S, mean(s.lookbacks.map(hurdle)), lookback), signals: runs }
  }
  const out: Weights = {}
  for (const L of s.lookbacks) for (const [a, x] of Object.entries(run(`L${L}`, scores(L), hurdle(L), L))) add(out, a, x / s.lookbacks.length)
  return { w: out, signals: runs }
}

interface Ctx {
  data: MonthlyData
  t0: number
  end: number
  cfg: Strategy
  fx: (t: number) => number
}

/** §5–6 accounting. `decide(t)` is called once per month t in [t0, end) in order; null = no trade.
 * The reported run starts at t0 + lag, the first month invested (V = 1 there); the cash month before it is dropped. */
// No trade at the final month (nothing is held after it), so its weights are the drifted ones.
// Rebalances with zero turnover (≤ 1e-12) produce no `trades` row.
interface Decision {
  w: Weights
  signals: SleeveSignal[]
}

function simulate(ctx: Ctx, decide: (t: number) => Decision | null, lag: number) {
  const { data, t0, end, fx } = ctx
  const start = t0 + lag
  const s = ctx.cfg.settings
  const rate = s.costPct + (s.currency !== 'USD' ? s.fxCostPct : 0)
  let V = 1 // USD
  let w: Weights = {} // empty = cash (before first execution)
  const basis: Weights = {} // reporting currency, per asset
  let gains = 0 // realised in current calendar year, reporting currency
  const values: number[] = []
  const weights: Weights[] = []
  const drifted: Weights[] = [] // end-of-month weights before trading, per month start+1..end (metrics holdings)
  const trades: Trade[] = []
  const pending: (Decision | null)[] = []
  for (let t = t0; t <= end; t++) {
    if (t > t0) {
      const nw: Weights = {}
      let g = 1 - Object.values(w).reduce((x, y) => x + y, 0) // cash part earns 0
      for (const [a, x] of Object.entries(w)) g += nw[a] = x * (1 + ret(data, a, t))
      V *= g
      for (const a in nw) nw[a]! /= g
      w = nw
      if (t > start) drifted.push(w)
    }
    const vc = () => (V * fx(t)) / fx(start)
    if (t < end) pending.push(decide(t))
    const decision = t < end && pending.length > lag ? pending[pending.length - 1 - lag]! : null
    const target = decision?.w
    let trade: Trade | null = null
    if (target) {
      const from = w
      const keys = [...new Set([...Object.keys(from), ...Object.keys(target)])]
      const T = keys.reduce((x, a) => x + Math.abs((target[a] ?? 0) - (from[a] ?? 0)), 0)
      if (T > 1e-12) {
        const before = vc()
        V *= 1 - T * rate
        const after = vc()
        for (const a of keys) {
          // Cost shrinks every holding proportionally without realising anything; only weight changes trade.
          const hb = after * (from[a] ?? 0)
          const ha = after * (target[a] ?? 0)
          if (ha < hb) {
            const soldBasis = ((basis[a] ?? 0) * (hb - ha)) / hb
            gains += hb - ha - soldBasis
            basis[a] = (basis[a] ?? 0) - soldBasis
          } else basis[a] = (basis[a] ?? 0) + ha - hb
        }
        w = { ...target }
        trade = { date: data.dates[t]!, from, to: w, turnover: T, cost: before - after, tax: 0, signals: decision!.signals }
        trades.push(trade)
      }
    }
    if (s.tax.enabled && (data.dates[t]!.endsWith('-12') || t === end)) {
      const tax = s.tax.rate * Math.max(0, gains)
      gains = 0 // losses don't carry forward
      if (tax > 0) {
        // Paying tax is modelled as a proportional reduction of all holdings (basis scaled the
        // same way), not as a sale that realises further gains.
        const f = 1 - tax / vc()
        V *= f
        for (const a in basis) basis[a]! *= f
        if (trade) trade.tax = tax
        else trades.push({ date: data.dates[t]!, from: w, to: w, turnover: 0, cost: 0, tax, signals: [] })
      }
    }
    if (t < start) continue
    // V[start] = 1 is recorded before the initial purchase cost, so that cost lands in month start+1's return.
    values.push(t === start ? 1 : vc())
    weights.push(w)
  }
  return { start, values, weights, drifted, trades }
}

function finish(ctx: Ctx, rfAt: (t: number) => number, sim: ReturnType<typeof simulate>): RunResult {
  const dates = ctx.data.dates.slice(sim.start, ctx.end + 1)
  const rf = dates.slice(1).map((_, i) => rfAt(sim.start + 1 + i))
  const metrics = computeMetrics({ dates, values: sim.values, rf, holdings: sim.drifted })
  const { dd } = computeDrawdown(dates, sim.values)
  return {
    metrics,
    series: dates.map((date, i) => ({ date, value: sim.values[i]!, drawdown: dd[i]!, weights: sim.weights[i]! })),
    annual: annualReturns(dates, sim.values),
    monthly: monthlyReturns(dates, sim.values),
  }
}

const firstIdx = (c: (number | null)[]) => c.findIndex((v) => v != null)
const lastIdx = (c: (number | null)[]) => c.findLastIndex((v) => v != null)

/** Run a strategy on monthly data. Throws ZodError (invalid config) or DataError (insufficient data). */
/** §5 warm-up: t0 = earliest month every referenced asset has enough observations; end = last month all have data. */
function warmup(cfg: Strategy, data: MonthlyData) {
  let t0 = 0
  let end = data.dates.length - 1
  for (const s of cfg.sleeves) {
    let need = Math.max(...s.lookbacks) + 1 + (s.momentum === 'skip1' ? 1 : 0)
    if (s.weighting === 'invVol') need = Math.max(need, 13)
    for (const a of referenced(s)) {
      const c = col(data, a)
      if (firstIdx(c) < 0) throw new DataError(`no data for ${a}`)
      t0 = Math.max(t0, firstIdx(c) + need - 1)
      end = Math.min(end, lastIdx(c))
    }
  }
  return { t0, end }
}

/**
 * §4 strategy targets. Returns decide(t), to be called once per month in order from t0 (buffer incumbents are
 * carried between calls); null = not a rebalance month. t0 is always a decision month (initial purchase), even
 * if not a quarter-end with rebalance = quarterly.
 */
function decider(cfg: Strategy, data: MonthlyData, t0: number) {
  const inc = cfg.sleeves.map(() => new Map<string, string | null>())
  return (t: number): Decision | null => {
    if (t !== t0 && cfg.settings.rebalance === 'quarterly' && Number(data.dates[t]!.slice(5)) % 3 !== 0) return null
    const w: Weights = {}
    const signals = cfg.sleeves.flatMap((s, i) => {
      const r = sleeveWeights(data, s, t, inc[i]!, i)
      for (const [a, x] of Object.entries(r.w)) add(w, a, s.weight * x)
      return r.signals
    })
    return { w, signals }
  }
}

export function backtest(input: StrategyInput, data: MonthlyData): BacktestResult {
  const cfg = parseConfig(input)
  const { currency, executionLag } = cfg.settings
  const warnings: string[] = []

  let { t0, end } = warmup(cfg, data)
  const fxCol = currency === 'USD' ? null : col(data, `FX_${currency}`)
  if (fxCol) {
    if (firstIdx(fxCol) < 0) throw new DataError(`no FX data for ${currency}`)
    t0 = Math.max(t0, firstIdx(fxCol)) // §6: clip start to first FX month
    end = Math.min(end, lastIdx(fxCol))
  }
  if (cfg.startDate) t0 = Math.max(t0, data.dates.findIndex((d) => d >= cfg.startDate!))
  if (cfg.endDate) end = Math.min(end, data.dates.findLastIndex((d) => d <= cfg.endDate!))
  if (t0 < 0 || end <= t0 + executionLag || (cfg.startDate && data.dates.every((d) => d < cfg.startDate!)))
    throw new DataError('not enough data for the requested range')
  // A requested range wider than the data allows is clipped with a warning, not exit code 2.
  if (cfg.startDate && data.dates[t0]! > cfg.startDate) warnings.push(`start clipped to ${data.dates[t0]} (warm-up/data/FX)`)
  if (cfg.endDate && data.dates[end]! < cfg.endDate) warnings.push(`end clipped to ${data.dates[end]} (data)`)
  const ctx: Ctx = { data, t0, end, cfg, fx: fxCol ? (t) => px(data, `FX_${currency}`, t) : () => 1 }

  let rfOk = true
  try {
    for (let t = t0 + 1; t <= end; t++) ret(data, TBILL, t)
  } catch {
    rfOk = false
    warnings.push('TBILL data missing in range; risk-free rate set to 0')
  }
  const rfAt = (t: number) => (rfOk ? ret(data, TBILL, t) : 0)

  const decide = decider(cfg, data, t0)
  // With executionLag = 1 the portfolio sits in cash (0 return) during month t0+1.
  const sim = simulate(ctx, decide, executionLag)

  // §9 benchmarks: same costs/tax/currency/end. They start at the month the strategy is first invested
  // (t0 + executionLag) so the comparison is fair, and ignore the rebalance setting (BH never rebalances;
  // 6040 and EW rebalance monthly).
  const ew = [...new Set(cfg.sleeves.flatMap((s) => s.universe))]
  const defs: [BenchmarkId, Weights, boolean][] = [
    ['BH_US', { US: 1 }, false],
    ['6040', { US: 0.6, AGG: 0.4 }, true],
    ['EW', Object.fromEntries(ew.map((a) => [a, 1 / ew.length])), true],
  ]
  const benchmarks: Partial<Record<BenchmarkId, RunResult>> = {}
  const bctx: Ctx = { ...ctx, t0: t0 + executionLag }
  for (const [id, target, monthly] of defs) {
    try {
      benchmarks[id] = finish(ctx, rfAt, simulate(bctx, (t) => (monthly || t === bctx.t0 ? { w: target, signals: [] } : null), 0))
    } catch (e) {
      if (!(e instanceof DataError)) throw e
      warnings.push(`benchmark ${id} skipped: ${e.message}`)
    }
  }

  const run = finish(ctx, rfAt, sim)
  const bh = benchmarks.BH_US
  if (!bh) warnings.push('relative metrics skipped: BH_US benchmark unavailable')
  const relative = bh
    ? {
        vs: 'BH_US' as const,
        ...computeRelative({ dates: run.series.map((p) => p.date), values: sim.values, benchValues: bh.series.map((p) => p.value) }),
      }
    : null

  return {
    config: cfg,
    range: { start: data.dates[sim.start]!, end: data.dates[end]! },
    ...run,
    relative,
    trades: sim.trades,
    benchmarks,
    warnings,
  }
}

export interface CurrentSignal {
  /** Last month in the data used for the decision (decision at month-end asOf). */
  asOf: string
  /** Month whose return the new weights first earn (asOf+1 with lag 0, asOf+2 with lag 1); may be beyond the data. */
  tradeMonth: string
  /** Target weights from the decision at asOf (after sleeve weighting). */
  weights: Weights
  /** Target weights from the previous decision month (respecting the rebalance frequency); {} if none. */
  previous: Weights
  /** Asset set of `weights` differs from `previous`. */
  changed: boolean
  /** Same shape as trades[].signals, for the decision behind `weights`. */
  signals: SleeveSignal[]
  /** False when asOf is not a decision month (e.g. quarterly, not a quarter-end); weights then repeat the last decision. */
  isRebalanceMonth: boolean
}

const addMonths = (d: string, k: number) => {
  const n = Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1 + k
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`
}

/**
 * What to hold now: replays the backtest's decisions from t0 (same decider, so buffer incumbents match) up to
 * the last month every referenced asset has data. Signals are USD-only, so FX data and `endDate` are ignored;
 * `startDate` is respected because it changes where the decision path (buffer) starts.
 * Throws ZodError (invalid config) or DataError (not enough data for a decision).
 */
export function currentSignal(input: StrategyInput, data: MonthlyData): CurrentSignal {
  const cfg = parseConfig(input)
  let { t0, end: asOf } = warmup(cfg, data)
  if (cfg.startDate) t0 = Math.max(t0, data.dates.findIndex((d) => d >= cfg.startDate!))
  if (t0 < 0 || asOf < t0) throw new DataError('not enough data for a current signal')
  const decide = decider(cfg, data, t0)
  let last: Decision | null = null
  let prev: Decision | null = null
  let isRebalanceMonth = false
  for (let t = t0; t <= asOf; t++) {
    const d = decide(t)
    isRebalanceMonth = d !== null
    if (d) [prev, last] = [last, d]
  }
  // Not a decision month: the previous decision month is the latest one, so nothing changes now.
  const previous = isRebalanceMonth ? (prev?.w ?? {}) : last!.w
  const key = (w: Weights) => Object.keys(w).filter((a) => w[a]! > 0).sort().join(',')
  return {
    asOf: data.dates[asOf]!,
    tradeMonth: addMonths(data.dates[asOf]!, 1 + cfg.settings.executionLag),
    weights: last!.w,
    previous,
    changed: key(last!.w) !== key(previous),
    signals: last!.signals,
    isRebalanceMonth,
  }
}
