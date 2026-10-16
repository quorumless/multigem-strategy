import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { backtest, currentSignal, score } from '../src/backtest.ts'
import type { StrategyInput } from '../src/config.ts'
import { DataError, type MonthlyData } from '../src/data.ts'

type Cols = Record<string, (number | null)[]>

/** Consecutive months from `start`, one column per asset. */
function mk(cols: Cols, start = '2000-01'): MonthlyData {
  const n = Object.values(cols)[0]!.length
  let y = Number(start.slice(0, 4))
  let m = Number(start.slice(5)) - 1
  const dates = Array.from({ length: n }, () => {
    const d = `${y}-${String(m + 1).padStart(2, '0')}`
    m = (m + 1) % 12
    if (m === 0) y++
    return d
  })
  return { dates, series: cols }
}

type SleeveIn = StrategyInput['sleeves'][number]
type SettingsIn = NonNullable<StrategyInput['settings']>
/** Single sleeve over [A, B], L=1, zero hurdle, safe AGG, no costs unless overridden. */
const cfg = (s: Partial<SleeveIn> = {}, settings: SettingsIn = {}, extra: Partial<StrategyInput> = {}): StrategyInput => ({
  name: 't',
  sleeves: [{ id: 's', weight: 1, universe: ['A', 'B'], lookbacks: [1], absFilter: 'zero', ...s }],
  settings: { costPct: 0, ...settings },
  ...extra,
})

const flat = (n: number) => Array(n).fill(100)
/** Weights decided at t0 (first series point). */
const first = (c: StrategyInput, d: MonthlyData) => backtest(c, d).series[0]!.weights

// Look-ahead fixture (L=1, zero hurdle, no costs):
// idx   0    1    2    3    4      5
// A    100  110  121  121  121    133.1
// B    100  105  105  126  138.6  138.6
// decisions: t1 A (10% vs 5%), t2 A, t3 B (0 vs 20%), t4 B (0 vs 10%)
const la = mk({
  A: [100, 110, 121, 121, 121, 133.1],
  B: [100, 105, 105, 126, 138.6, 138.6],
  AGG: flat(6),
})

describe('§4 signal', () => {
  test('momentum score total vs skip1', () => {
    // A: 100, 120, 90, 99 ; t = 3
    // total L1 = 99/90-1 = 0.1 ; total L2 = 99/120-1 = -0.175
    // skip1 L1 = 90/120-1 = -0.25 (= total of month t-1) ; skip1 L2 = 90/100-1 = -0.1
    const d = mk({ A: [100, 120, 90, 99] })
    expect(score(d, 'A', 3, 1, 'total')).toBeCloseTo(0.1, 12)
    expect(score(d, 'A', 3, 2, 'total')).toBeCloseTo(-0.175, 12)
    expect(score(d, 'A', 3, 1, 'skip1')).toBeCloseTo(-0.25, 12)
    expect(score(d, 'A', 3, 2, 'skip1')).toBeCloseTo(-0.1, 12)
  })

  // Month 1 returns: A -2%, B -3%, TBILL +0.5%, AGG +1%. t0 = 1 (L=1).
  const neg = mk({ A: [100, 98, 98], B: [100, 97, 97], TBILL: [100, 100.5, 101], AGG: [100, 101, 101] })
  // A +0.3%: beats zero, loses to TBILL 0.5%
  const small = mk({ A: [100, 100.3, 100], B: [100, 99, 99], TBILL: [100, 100.5, 101], AGG: [100, 101, 101] })
  test('hurdle tbill / zero / off', () => {
    expect(first(cfg({ absFilter: 'tbill' }), neg)).toEqual({ AGG: 1 })
    expect(first(cfg({ absFilter: 'zero' }), neg)).toEqual({ AGG: 1 })
    expect(first(cfg({ absFilter: 'off' }), neg)).toEqual({ A: 1 }) // best of negatives
    expect(first(cfg({ absFilter: 'tbill' }), small)).toEqual({ AGG: 1 }) // 0.3% ≤ 0.5%
    expect(first(cfg({ absFilter: 'zero' }), small)).toEqual({ A: 1 })
  })

  test('rank ties broken by universe order', () => {
    const d = mk({ A: [100, 110, 110], B: [100, 110, 110], AGG: flat(3) })
    expect(first(cfg(), d)).toEqual({ A: 1 })
    expect(first(cfg({ universe: ['B', 'A'] }), d)).toEqual({ B: 1 })
  })

  // A +10%, B -1%, C -2% in month 1
  const abc = mk({ A: [100, 110, 110], B: [100, 99, 99], C: [100, 98, 98], AGG: flat(3) })
  test('topN slots: failing slots go to safe haven and merge', () => {
    expect(first(cfg({ topN: 2 }), abc)).toEqual({ A: 0.5, AGG: 0.5 })
    // B and C both fail zero hurdle → two haven slots merge into AGG 2/3
    const w = first(cfg({ universe: ['A', 'B', 'C'], topN: 3 }), abc)
    expect(w.A).toBeCloseTo(1 / 3, 12)
    expect(w.AGG).toBeCloseTo(2 / 3, 12)
  })

  test('safe haven bestOf picks highest score, no hurdle', () => {
    // A,B fail; AGG +1% vs TBILL +0.5% → AGG. Flip AGG to -5% (< 0, still picked over nothing? no: TBILL +0.5% > -5%) → TBILL
    const sh = { mode: 'bestOf' as const, assets: ['AGG', 'TBILL'] }
    expect(first(cfg({ safeHaven: sh }), neg)).toEqual({ AGG: 1 })
    const d2 = mk({ ...neg.series, AGG: [100, 95, 95] })
    expect(first(cfg({ safeHaven: sh }), d2)).toEqual({ TBILL: 1 })
    // both negative: still the best of them (no hurdle): AGG -5% vs TBILL -6%
    const d3 = mk({ ...neg.series, AGG: [100, 95, 95], TBILL: [100, 94, 94] })
    expect(first(cfg({ safeHaven: sh }), d3)).toEqual({ AGG: 1 })
  })

  // invVol: 13 observations, t0 = 12. Monthly returns i = 1..12:
  //   A: +1% if i even else -1%   → σ_A = sqrt(12·0.01²/11)
  //   B: -2% if i even else +2%   → σ_B = 2·σ_A
  // L=1 scores at t=12: A +1%, B -2%.
  const path = (r: (i: number) => number) => {
    const p = [100]
    for (let i = 1; i <= 13; i++) p.push(p[i - 1]! * (1 + r(i)))
    return p
  }
  const vol = mk({
    A: path((i) => (i % 2 === 0 ? 0.01 : -0.01)),
    B: path((i) => (i % 2 === 0 ? -0.02 : 0.02)),
    AGG: flat(14),
  })
  test('invVol: risky slots ∝ 1/σ, safe slot fixed 1/N', () => {
    // off hurdle → both risky: A ∝ 1/σ, B ∝ 1/(2σ) → A 2/3, B 1/3
    const w = first(cfg({ topN: 2, weighting: 'invVol', absFilter: 'off' }), vol)
    expect(w.A).toBeCloseTo(2 / 3, 12)
    expect(w.B).toBeCloseTo(1 / 3, 12)
    // zero hurdle → B fails: AGG gets 1/N = 1/2, A gets the remaining 1/2
    expect(first(cfg({ topN: 2, weighting: 'invVol' }), vol)).toEqual({ A: 0.5, AGG: 0.5 })
  })

  test('buffer keeps incumbent within margin, switches beyond it', () => {
    // returns:      t1      t2      t3
    //   A          +5%     +3%     +1%
    //   B          +1%     +4%     +5%
    // t1 → A. t2: B leads by 1pp ≤ 2pp → keep A. t3: B leads by 4pp > 2pp → B.
    const d = mk({
      A: [100, 105, 108.15, 109.2315, 109.2315],
      B: [100, 101, 105.04, 110.292, 110.292],
      AGG: flat(5),
    })
    const w = backtest(cfg({ buffer: 0.02 }), d).series.map((p) => p.weights)
    expect(w.slice(0, 3)).toEqual([{ A: 1 }, { A: 1 }, { B: 1 }])
    const nb = backtest(cfg(), d).series.map((p) => p.weights)
    expect(nb.slice(0, 3)).toEqual([{ A: 1 }, { B: 1 }, { B: 1 }])
  })

  // A: 100, 80, 100 → L1 +25%, L2 0% ; B: 100, 110, 115.5 → L1 +5%, L2 +15.5% ; t0 = 2
  const lb = mk({ A: [100, 80, 100, 100], B: [100, 110, 115.5, 115.5], AGG: flat(4) })
  test('multiple lookbacks: blend vs average', () => {
    // blend: L1 → A, L2 → B → mean = {A .5, B .5}
    expect(first(cfg({ lookbacks: [1, 2], lookbackMode: 'blend' }), lb)).toEqual({ A: 0.5, B: 0.5 })
    // average: S_A = 12.5%, S_B = 10.25% → A
    expect(first(cfg({ lookbacks: [1, 2], lookbackMode: 'average' }), lb)).toEqual({ A: 1 })
  })

  test('strategy weights = Σ sleeve.weight × sleeve weights', () => {
    // sleeve1 (.6) [A,B] → A ; sleeve2 (.4) [B] → B −1% fails → AGG
    const c = cfg({}, {}, {
      sleeves: [
        { id: 'x', weight: 0.6, universe: ['A', 'B'], lookbacks: [1], absFilter: 'zero' },
        { id: 'y', weight: 0.4, universe: ['B'], lookbacks: [1], absFilter: 'zero' },
      ],
    })
    expect(first(c, abc)).toEqual({ A: 0.6, AGG: 0.4 })
  })
})

describe('§5 timing and accounting', () => {
  test('warm-up t0: maxLookback+1, +1 for skip1, 13 for invVol, late assets, startDate', () => {
    const d = mk({ A: path14(), B: path14(), AGG: flat(14), TBILL: flat(14) })
    expect(backtest(cfg({ lookbacks: [3] }), d).range.start).toBe('2000-04') // index 3
    expect(backtest(cfg({ lookbacks: [3], momentum: 'skip1' }), d).range.start).toBe('2000-05')
    expect(backtest(cfg({ lookbacks: [1, 3] }), d).range.start).toBe('2000-04')
    expect(backtest(cfg({ weighting: 'invVol' }), d).range.start).toBe('2001-01') // index 12
    // B starts at index 2 → needs 2 obs → index 3
    const late = mk({ ...d.series, B: [null, null, ...path14().slice(2)] })
    expect(backtest(cfg(), late).range.start).toBe('2000-04')
    // TBILL only counts when used as hurdle
    const lateT = mk({ ...d.series, TBILL: [null, null, null, null, ...flat(10)] })
    expect(backtest(cfg(), lateT).range.start).toBe('2000-02')
    expect(backtest(cfg({ absFilter: 'tbill' }), lateT).range.start).toBe('2000-06')
    expect(backtest(cfg({}, {}, { startDate: '2000-07', endDate: '2000-09' }), d).range).toEqual({ start: '2000-07', end: '2000-09' })
    // requested start before warm-up → clipped with a warning
    const clipped = backtest(cfg({}, {}, { startDate: '2000-01' }), d)
    expect(clipped.range.start).toBe('2000-02')
    expect(clipped.warnings.some((w) => w.includes('start'))).toBe(true)
  })

  test('drift, month return, and re-weighting turnover with unchanged asset set', () => {
    // topN 2 equal, no hurdle (off). Month 2: A +10%, B 0%.
    // R = .5×.1 = .05 ; drifted A = .55/1.05, B = .5/1.05
    // re-weight to .5/.5: T = 2 × (.55/1.05 − .5) = .05/1.05
    const d = mk({ A: [100, 110, 121, 133.1], B: [100, 105, 105, 105], AGG: flat(4) })
    const r = backtest(cfg({ topN: 2, absFilter: 'off' }), d)
    expect(r.series[1]!.value).toBeCloseTo(1.05, 12)
    expect(r.trades[1]!.from.A).toBeCloseTo(0.55 / 1.05, 12)
    expect(r.trades[1]!.from.B).toBeCloseTo(0.5 / 1.05, 12)
    expect(r.trades[1]!.turnover).toBeCloseTo(0.05 / 1.05, 12)
    expect(r.series[1]!.weights).toEqual({ A: 0.5, B: 0.5 })
    // last month (A +10%, B 0) has no trade: weights stay drifted → A .55/1.05
    expect(r.series[2]!.weights.A).toBeCloseTo(0.55 / 1.05, 12)
  })

  // A: 100,110,110,110 ; B: 100,100,120,120. t1 → A, t2 → B (A 0%, B +20%).
  const sw = mk({ A: [100, 110, 110, 110], B: [100, 100, 120, 120], AGG: flat(4), FX_PLN: [4, 4, 4, 4] })
  test('costs: initial purchase T=1, full switch T=2 costs 2×costPct', () => {
    // t1: V = 1×(1−.01) = .99 (recorded V[t0] = 1, pre-cost). t2: A 0% → .99, switch T=2 → .99×.98 = .9702
    const r = backtest(cfg({}, { costPct: 0.01 }), sw)
    expect(r.trades.map((t) => t.turnover)).toEqual([1, 2])
    expect(r.trades[0]!.cost).toBeCloseTo(0.01, 12)
    expect(r.trades[1]!.cost).toBeCloseTo(0.0198, 12)
    expect(r.series.map((p) => p.value)).toEqual([1, expect.closeTo(0.9702, 12), expect.closeTo(0.9702, 12)])
  })

  test('fxCostPct only applies when currency ≠ USD', () => {
    const usd = backtest(cfg({}, { costPct: 0.01, fxCostPct: 0.005 }), sw)
    expect(usd.series[2]!.value).toBeCloseTo(0.9702, 12)
    // PLN (FX constant): rate .015 → .985 × (1 − .03) = .95545
    const pln = backtest(cfg({}, { costPct: 0.01, fxCostPct: 0.005, currency: 'PLN' }), sw)
    expect(pln.series[2]!.value).toBeCloseTo(0.985 * 0.97, 12)
  })

  test('quarterly: trades only at t0 and Mar/Jun/Sep/Dec; zero-turnover rebalances leave no row', () => {
    // topN 2, both rising at different rates → every quarterly re-weight has turnover > 0
    const d = mk({ A: path14(), B: path14().map((x) => 2 * x - 100), AGG: flat(14) })
    const r = backtest(cfg({ topN: 2 }, { rebalance: 'quarterly' }), d)
    expect(r.trades.map((t) => t.date)).toEqual(['2000-02', '2000-03', '2000-06', '2000-09', '2000-12'])
    // single asset held throughout (A, B identical → A by tie order): only the initial purchase is a row
    const same = mk({ A: path14(), B: path14(), AGG: flat(14) })
    expect(backtest(cfg({}, { rebalance: 'quarterly' }), same).trades.map((t) => t.date)).toEqual(['2000-02'])
  })

  test('look-ahead: mutating data after t does not change decision at t; t+1 return earned', () => {
    const t = 1
    const base = backtest(cfg(), la)
    // Mutate every price strictly after t: A crashes, B doubles.
    const mut = mk({ A: [100, 110, 55, 55, 55, 55], B: [100, 105, 210, 210, 210, 210], AGG: flat(6) })
    const r = backtest(cfg(), mut)
    expect(r.series[t - 1]!.weights).toEqual(base.series[t - 1]!.weights) // decision at t unchanged: {A:1}
    expect(r.trades[0]).toEqual(base.trades[0])
    expect(r.series[t]!.weights).not.toEqual(base.series[t]!.weights) // decision at t+1 does change (→ B)
    // R[t+1] = Σ w_t × r[t+1] = 1 × (55/110 − 1) = −0.5
    expect(r.series[t]!.value / r.series[t - 1]!.value - 1).toBeCloseTo(-0.5, 12)
  })

  test('executionLag: lag 0 earns new weights in t+1; lag 1 earns previous weights in t+1', () => {
    // lag 0: V = 1, 1.1 (A +10%), 1.1 (A 0), 1.21 (B +10% in month 4, decided t3), 1.21
    const l0 = backtest(cfg(), la).series.map((p) => p.value)
    expect(l0).toEqual([1, 1.1, 1.1, expect.closeTo(1.21, 12), expect.closeTo(1.21, 12)])
    // lag 1: decision t1 (A) executes at idx2, which is where the reported run starts (cash month idx2 dropped).
    // Month idx3 holds A (decided t1) → 0%; decision t2 (A) executes at 3; month idx4 holds A → 0%;
    // decision t3 (B) executes at 4; month idx5 holds B → 0%. All flat at 1.
    const r1 = backtest(cfg({}, { executionLag: 1 }), mk({ ...la.series, US: flat(6) }))
    expect(r1.range).toEqual({ start: '2000-03', end: '2000-06' })
    expect(r1.series.map((p) => p.value)).toEqual([1, 1, 1, 1])
    expect(r1.series.map((p) => p.weights)).toEqual([{ A: 1 }, { A: 1 }, { B: 1 }, { B: 1 }])
    expect(r1.trades.map((t) => [t.date, t.to])).toEqual([['2000-03', { A: 1 }], ['2000-05', { B: 1 }]])
    // strategy and BH_US cover exactly the same months
    expect(r1.benchmarks.BH_US!.series.map((p) => p.date)).toEqual(r1.series.map((p) => p.date))
    expect(r1.metrics.months).toBe(3)
    expect(r1.benchmarks.BH_US!.metrics.months).toBe(3)
    expect(r1.metrics.switchesPerYear).toBeCloseTo(12 / 3, 12) // one switch (A→B) in 3 months
    // decision at t1 unaffected by data after t1 with lag too
    const mut = mk({ A: [100, 110, 55, 55, 55, 55], B: [100, 105, 210, 210, 210, 210], AGG: flat(6) })
    expect(backtest(cfg({}, { executionLag: 1 }), mut).series[0]!.weights).toEqual({ A: 1 })
  })

  test('deterministic and input not mutated', () => {
    const c = cfg({ topN: 2 }, { costPct: 0.001, tax: { enabled: true } })
    const frozen = JSON.stringify(la)
    expect(backtest(c, la)).toEqual(backtest(c, la))
    expect(JSON.stringify(la)).toBe(frozen)
  })

  test('data errors: missing column, startDate past data', () => {
    expect(() => backtest(cfg({ universe: ['A', 'Z'] }), la)).toThrow(DataError)
    expect(() => backtest(cfg({}, {}, { startDate: '2010-01' }), la)).toThrow(DataError)
    expect(() => backtest(cfg({ lookbacks: [12] }), la)).toThrow(DataError)
  })
})

describe('§6 currency and tax', () => {
  // FX_PLN: 4, 4, 5, 4.5, 4.5, 6 (PLN per USD)
  const fx = [4, 4, 5, 4.5, 4.5, 6]
  test('reporting currency: same weights/turnover, V_ccy = V × FX[t]/FX[t0]', () => {
    const d = mk({ ...la.series, FX_PLN: fx })
    const usd = backtest(cfg(), d)
    const pln = backtest(cfg({}, { currency: 'PLN' }), d)
    expect(pln.trades.map((t) => [t.date, t.to, t.turnover])).toEqual(usd.trades.map((t) => [t.date, t.to, t.turnover]))
    pln.series.forEach((p, i) => expect(p.value).toBeCloseTo((usd.series[i]!.value * fx[i + 1]!) / fx[1]!, 12))
  })

  test('run start clipped to first FX month', () => {
    const d = mk({ ...la.series, FX_PLN: [null, null, null, 4, 4, 4] })
    expect(backtest(cfg({}, { currency: 'PLN' }), d).range.start).toBe('2000-04')
    expect(backtest(cfg(), d).range.start).toBe('2000-02')
  })

  test('tax on realised gain at year end, basis scaled after tax', () => {
    // idx0 2000-10, idx1 Nov (t0), idx2 Dec, idx3 2001-01, idx4 Feb (end). absFilter off.
    // A: 100,110,132,158.4,158.4 ; B: 100,100,130,143,143
    // Nov: buy A, basis 1. Dec: A +20% → V 1.2; B (+30%) leads → sell A: gain .2; buy B basis 1.2.
    //   year-end tax = .19×.2 = .038 → V 1.162, f = 1.162/1.2 → B basis scaled to 1.162.
    // Jan: B +10% → V 1.2782; A (+20%) leads → sell B: gain 1.2782 − 1.162 = .1162.
    // Feb (run end): tax .19×.1162 = .022078 → V 1.256122 (unscaled basis would give 1.263342).
    const d = mk({ A: [100, 110, 132, 158.4, 158.4], B: [100, 100, 130, 143, 143], AGG: flat(5) }, '2000-10')
    const r = backtest(cfg({ absFilter: 'off' }, { tax: { enabled: true } }), d)
    expect(r.series.map((p) => p.value)).toEqual([1, expect.closeTo(1.162, 12), expect.closeTo(1.2782, 12), expect.closeTo(1.256122, 12)])
    expect(r.trades.filter((t) => t.tax > 0).map((t) => [t.date, t.tax])).toEqual([
      ['2000-12', expect.closeTo(0.038, 12)],
      ['2001-02', expect.closeTo(0.022078, 12)],
    ])
  })

  test('losses do not carry to next year', () => {
    // universe [B, A]; idx0 2000-09 … idx5 2001-02
    // A: 100,110,88,88,114.4,114.4 ; B: 100,100,105,105,131.25,131.25
    // Oct: buy A (A +10%). Nov: A −20% → V .8; B leads → sell A, loss −.2 (2000). Dec: tie → B, no tax.
    // Jan: B +25% → V 1.0; A +30% leads → sell B: gain 1.0 − .8 = .2 (2001). Feb (end): tax .038 → .962
    const d = mk({ A: [100, 110, 88, 88, 114.4, 114.4], B: [100, 100, 105, 105, 131.25, 131.25], AGG: flat(6) }, '2000-09')
    const r = backtest(cfg({ universe: ['B', 'A'], absFilter: 'off' }, { tax: { enabled: true } }), d)
    expect(r.series.at(-1)!.value).toBeCloseTo(0.962, 12)
    expect(r.trades.filter((t) => t.tax > 0).map((t) => t.date)).toEqual(['2001-02'])
  })

  test('tax in reporting currency; December run end taxed once', () => {
    // idx0 2000-09, idx1 Oct (t0), idx2 Nov, idx3 Dec (end). A flat in USD after t0; FX 4 → 5.
    // USD: switch A→B at Nov realises 0 → no tax, V end 1.
    // PLN: buy A basis 1 PLN-normalised; Nov V_ccy = 5/4 = 1.25; sell A → gain .25; Dec (year end = run end)
    //      tax = .19×.25 = .0475 once → 1.2025
    const d = mk({ A: [100, 110, 110, 110], B: [100, 100, 110, 110], AGG: flat(4), FX_PLN: [4, 4, 5, 5] }, '2000-09')
    const usd = backtest(cfg({}, { tax: { enabled: true } }), d)
    expect(usd.series.at(-1)!.value).toBeCloseTo(1, 12)
    expect(usd.trades.every((t) => t.tax === 0)).toBe(true)
    const pln = backtest(cfg({}, { tax: { enabled: true }, currency: 'PLN' }), d)
    expect(pln.series.at(-1)!.value).toBeCloseTo(1.2025, 12)
    expect(pln.trades.filter((t) => t.tax > 0).map((t) => [t.date, t.tax])).toEqual([['2000-12', expect.closeTo(0.0475, 12)]])
  })
})

describe('§9 benchmarks', () => {
  // idx   0    1    2    3
  // US   100  110  121  108.9   (month2 +10%, month3 −10%)
  // AGG  100  100  110  110     (+10%, 0)
  // A    100  100  120  120     (+20%, 0)
  // B    100  100  100  90      (0, −10%)
  const d = mk({ US: [100, 110, 121, 108.9], AGG: [100, 100, 110, 110], A: [100, 100, 120, 120], B: [100, 100, 100, 90] })
  test('BH_US, 6040, EW on the strategy range', () => {
    const r = backtest(cfg(), d)
    const v = (id: 'BH_US' | '6040' | 'EW') => r.benchmarks[id]!.series.map((p) => p.value)
    expect(v('BH_US')).toEqual([1, expect.closeTo(1.1, 12), expect.closeTo(0.99, 12)])
    // 6040: .6×.1 + .4×.1 = .1 → 1.1 ; rebalance; .6×(−.1) + .4×0 = −.06 → 1.034
    expect(v('6040')).toEqual([1, expect.closeTo(1.1, 12), expect.closeTo(1.034, 12)])
    // EW {A,B}: .5×.2 = .1 → 1.1 ; .5×(−.1) = −.05 → 1.045
    expect(v('EW')).toEqual([1, expect.closeTo(1.1, 12), expect.closeTo(1.045, 12)])
    expect(r.benchmarks.BH_US!.series.map((p) => p.date)).toEqual(r.series.map((p) => p.date))
    expect(r.benchmarks.BH_US!.metrics.totalReturn).toBeCloseTo(-0.01, 12)
  })

  test('EW = union of risky universes (not safe havens); BH never taxed, 6040 is', () => {
    const c = cfg({}, { tax: { enabled: true } }, {
      sleeves: [
        { id: 'x', weight: 0.5, universe: ['A', 'B'], lookbacks: [1], absFilter: 'zero' },
        { id: 'y', weight: 0.5, universe: ['B', 'US'], lookbacks: [1], absFilter: 'zero' },
      ],
    })
    const r = backtest(c, d)
    expect(Object.keys(r.benchmarks.EW!.series[0]!.weights)).toEqual(['A', 'B', 'US'])
    expect(r.benchmarks.BH_US!.series.at(-1)!.value).toBeCloseTo(0.99, 12)
    // AGG flat: month-2 rebalance sells US after +10% → realised gain → taxed at run end
    const flatAgg = mk({ ...d.series, AGG: flat(4) })
    const taxed = backtest(c, flatAgg).benchmarks['6040']!.series.at(-1)!.value
    const untaxed = backtest({ ...c, settings: { costPct: 0 } }, flatAgg).benchmarks['6040']!.series.at(-1)!.value
    expect(taxed).toBeLessThan(untaxed - 1e-6)
  })
})

test('engine purity: no I/O imports outside cli.ts', () => {
  const dir = new URL('../src/', import.meta.url)
  for (const f of readdirSync(dir).filter((f) => f !== 'cli.ts')) {
    expect(readFileSync(new URL(f, dir), 'utf8'), f).not.toMatch(/from ['"](node:|fs|path|os|child_process)/)
  }
})

/** 14 months, A/B identical rising paths (used where only dates/ranges matter). */
function path14() {
  return Array.from({ length: 14 }, (_, i) => 100 + i)
}

test('metrics wired with drifted holdings', () => {
  // topN 2, off hurdle on la, t0 = idx1, re-weighted to A .5 / B .5 every month. Months idx2..5 returns (A, B):
  //   (1.1, 1), (1, 1.2), (1, 1.1), (1.1, 1) → drifted A = a/(a+b): 1.1/2.1, 1/2.2, 1/2.1, 1.1/2.1
  const r = backtest(cfg({ topN: 2, absFilter: 'off' }), la)
  expect(r.metrics.months).toBe(4)
  expect(r.metrics.totalReturn).toBeCloseTo(r.series.at(-1)!.value - 1, 12)
  expect(r.metrics.timeInAsset.A).toBeCloseTo((1.1 / 2.1 + 1 / 2.2 + 1 / 2.1 + 1.1 / 2.1) / 4, 12)
  expect(r.benchmarks.EW!.metrics.months).toBe(4)
})

describe('trade signals', () => {
  test('captured from the decision: scores, hurdle, picked, toSafe', () => {
    // small: month 1 A +0.3%, B −1%, AGG +1%, TBILL +0.5% → hurdle .005; A .003 fails → safe
    const small = mk({ A: [100, 100.3, 100], B: [100, 99, 99], TBILL: [100, 100.5, 101], AGG: [100, 101, 101] })
    const r = backtest(cfg({ absFilter: 'tbill' }), small)
    expect(r.trades[0]!.signals).toEqual([
      {
        sleeve: 0,
        lookback: 1,
        scores: { A: expect.closeTo(0.003, 12), B: expect.closeTo(-0.01, 12), AGG: expect.closeTo(0.01, 12) },
        hurdle: expect.closeTo(0.005, 12),
        picked: [],
        toSafe: true,
      },
    ])
    // absFilter off → hurdle null, A picked
    expect(backtest(cfg({ absFilter: 'off' }), small).trades[0]!.signals[0]).toMatchObject({ hurdle: null, picked: ['A'], toSafe: false })
  })

  test('lag 1: trade carries the signal of the decision month, not the execution month', () => {
    // trade 2000-05 executes decision at idx3 (2000-04): B 126/105−1 = .2 (at idx4 it would be 138.6/126−1 = .1)
    const r = backtest(cfg({}, { executionLag: 1 }), la)
    const t = r.trades.find((x) => x.date === '2000-05')!
    expect(t.signals[0]!.scores.B).toBeCloseTo(0.2, 12)
    expect(t.signals[0]!.scores.A).toBeCloseTo(0, 12)
    expect(t.signals[0]).toMatchObject({ lookback: 1, hurdle: 0, picked: ['B'], toSafe: false })
  })

  test('one entry per (sleeve, lookback run): blend per L, average once with lookback null', () => {
    // lb: A L1 100/80−1 = .25, L2 0 ; B L1 115.5/110−1 = .05, L2 .155 ; AGG 0. Zero hurdle.
    // blend: L1 picks A, L2 picks B, each with its own scores.
    const r = backtest(cfg({ lookbacks: [1, 2], lookbackMode: 'blend' }), lb2())
    expect(r.trades[0]!.signals).toEqual([
      { sleeve: 0, lookback: 1, scores: { A: expect.closeTo(0.25, 12), B: expect.closeTo(0.05, 12), AGG: 0 }, hurdle: 0, picked: ['A'], toSafe: false },
      { sleeve: 0, lookback: 2, scores: { A: 0, B: expect.closeTo(0.155, 12), AGG: 0 }, hurdle: 0, picked: ['B'], toSafe: false },
    ])
    // average: one run on S_avg (A .125, B .1025) → A
    const avg = backtest(cfg({ lookbacks: [1, 2], lookbackMode: 'average' }), lb2())
    expect(avg.trades[0]!.signals).toEqual([
      { sleeve: 0, lookback: null, scores: { A: expect.closeTo(0.125, 12), B: expect.closeTo(0.1025, 12), AGG: 0 }, hurdle: 0, picked: ['A'], toSafe: false },
    ])
    // two sleeves: x [A,B] picks A ; y [B] with B −1% → safe
    const abc = mk({ A: [100, 110, 110], B: [100, 99, 99], AGG: flat(3) })
    const c = cfg({}, {}, {
      sleeves: [
        { id: 'x', weight: 0.6, universe: ['A', 'B'], lookbacks: [1], absFilter: 'zero' },
        { id: 'y', weight: 0.4, universe: ['B'], lookbacks: [1], absFilter: 'zero' },
      ],
    })
    expect(backtest(c, abc).trades[0]!.signals.map((s) => [s.sleeve, s.picked, s.toSafe])).toEqual([
      [0, ['A'], false],
      [1, [], true],
    ])
  })
})

test('relative metrics wired vs BH_US; null with warning when US missing', () => {
  const r = backtest(cfg(), mk({ ...la.series, US: flat(6) }))
  expect(r.relative).toMatchObject({ vs: 'BH_US', fullYears: 0 })
  // strategy ends 1.21 vs BH 1 → ratio peak at end; first months both 1 → never behind
  expect(r.relative!.longestBehindMonths).toBe(0)
  const none = backtest(cfg(), la)
  expect(none.relative).toBeNull()
  expect(none.warnings.some((w) => w.includes('relative'))).toBe(true)
})

function lb2() {
  return mk({ A: [100, 80, 100, 100], B: [100, 110, 115.5, 115.5], AGG: flat(4) })
}

describe('review fixes', () => {
  test('sell-side cost reduces proceeds: full switch', () => {
    // costPct .01, tax rate 1. idx1 2000-10 (t0): buy A, V = .99, basis A .99.
    // Nov: A doubles → V 1.98; B (+110%) leads → switch T = 2 → V 1.98 × .98 = 1.9404.
    // Proceeds of A = 1.9404 → gain 1.9404 − .99 = .9504 (pre-fix: 1.98 − .99 = .99). Dec: tie → B, no trade.
    const d = mk({ A: [100, 110, 220, 220], B: [100, 100, 210, 210], AGG: flat(4) }, '2000-09')
    const r = backtest(cfg({ universe: ['B', 'A'], absFilter: 'off' }, { costPct: 0.01, tax: { enabled: true, rate: 1 } }), d)
    expect(r.trades.filter((t) => t.tax > 0).map((t) => t.tax)).toEqual([expect.closeTo(0.9504, 12)])
  })

  test('sell-side cost: re-weight realises only the real weight change', () => {
    // topN 2 off, costPct .01, tax rate 1. Oct (t0): buy .5/.5 → V .99, basis A .495, B .495.
    // Nov: A +50%, B 0 → V .99 × 1.25 = 1.2375, drifted A .6, B .4 → T = .2 → after = 1.2375 × .998 = 1.235025.
    // A: held .6 × 1.235025 = .741015 → .5 × 1.235025 = .6175125: sold .1235025 = 1/6 of holding,
    //    basis sold .495/6 = .0825 → gain .0410025. B is bought (no gain). Dec (end): tax .0410025.
    //    (pre-fix used the pre-cost holding .7425: sold .1249875, basis .0833250 → gain ≈ .0416625)
    const d = mk({ A: [100, 100, 150, 150], B: flat(4), AGG: flat(4) }, '2000-09')
    const r = backtest(cfg({ topN: 2, absFilter: 'off' }, { costPct: 0.01, tax: { enabled: true, rate: 1 } }), d)
    expect(r.trades.filter((t) => t.tax > 0).map((t) => t.tax)).toEqual([expect.closeTo(0.0410025, 12)])
  })

  test('invVol with zero σ on a risky asset is a DataError', () => {
    // A constant for 12 months → σ_A = 0; off hurdle keeps A as risky slot
    const d = mk({ A: flat(14), B: Array.from({ length: 14 }, (_, i) => 100 * 1.01 ** i * (i % 2 ? 1.01 : 1)), AGG: flat(14) })
    expect(() => backtest(cfg({ topN: 2, weighting: 'invVol', absFilter: 'off' }), d)).toThrow(/A at 2001-01/)
    expect(() => backtest(cfg({ topN: 2, weighting: 'invVol', absFilter: 'off' }), d)).toThrow(DataError)
  })
})

/** Copy of d with prices strictly after index t replaced via f[col](i). */
function mutateAfter(d: MonthlyData, t: number, f: Record<string, (i: number) => number>): MonthlyData {
  const series = Object.fromEntries(
    Object.entries(d.series).map(([c, v]) => [c, f[c] ? v.map((x, i) => (i > t ? f[c]!(i) : x)) : v]),
  )
  return { dates: d.dates, series }
}

/** Decision at series[0] (month t) and its trade unchanged; decision at series[k] does change. */
function expectNoLookAhead(c: StrategyInput, base: MonthlyData, mut: MonthlyData, k: number) {
  const a = backtest(c, base)
  const b = backtest(c, mut)
  expect(b.series[0]!.weights).toEqual(a.series[0]!.weights)
  expect(b.trades[0]).toEqual(a.trades[0])
  expect(b.series[k]!.weights).not.toEqual(a.series[k]!.weights)
}

describe('look-ahead per feature', () => {
  test('skip1', () => {
    // L1 skip1, t0 = idx2: S = P[1]/P[0]−1 → A .1 vs B .05 → A.
    // Mutate after idx2 (A → 300, B → 50). Decision idx3 uses P[2]/P[1] only (unchanged).
    // Decision idx4: base A 0 vs B 115/110−1 → B ; mutated A 300/121−1 → A.
    const d = mk({ A: [100, 110, 121, 121, 121, 121], B: [100, 105, 110, 115, 120, 125], AGG: flat(6) })
    const m = mutateAfter(d, 2, { A: () => 300, B: () => 50 })
    const c = cfg({ momentum: 'skip1' })
    expectNoLookAhead(c, d, m, 2)
    expect(backtest(c, m).series[1]!.weights).toEqual(backtest(c, d).series[1]!.weights)
  })

  test('tbill hurdle', () => {
    // t0 = idx1: A +10% > TBILL +.1% → A. Mutate TBILL after idx1 to 200, 400 → idx2 hurdle ≈ +100% → AGG.
    const d = mk({ A: [100, 110, 121, 133.1], B: flat(4), AGG: flat(4), TBILL: [100, 100.1, 100.2, 100.3] })
    const m = mutateAfter(d, 1, { TBILL: (i) => 100 * 2 ** (i - 1) })
    expectNoLookAhead(cfg({ absFilter: 'tbill' }), d, m, 1)
  })

  test('bestOf safe haven', () => {
    // A, B falling → safe. t0 = idx1: AGG +1% > TBILL +.1% → AGG. Mutate AGG after idx1 to 50 → idx2 picks TBILL.
    const d = mk({ A: [100, 90, 81, 72.9], B: [100, 90, 81, 72.9], AGG: [100, 101, 102, 103], TBILL: [100, 100.1, 100.2, 100.3] })
    const m = mutateAfter(d, 1, { AGG: () => 50 })
    expectNoLookAhead(cfg({ safeHaven: { mode: 'bestOf', assets: ['AGG', 'TBILL'] } }), d, m, 1)
  })

  test('invVol', () => {
    // 15 months; A ±1%, B ±2% alternating (both net up via +.5% drift). t0 = idx12: A 2/3, B 1/3 (σ_B ≈ 2σ_A).
    // Mutate after idx12: A swings ±20% → σ_A at idx13 jumps → weights change.
    const path = (amp: number) => {
      const p = [100]
      for (let i = 1; i < 15; i++) p.push(p[i - 1]! * (1.005 + (i % 2 ? amp : -amp)))
      return p
    }
    const d = mk({ A: path(0.01), B: path(0.02), AGG: flat(15) })
    const m = mutateAfter(d, 12, { A: (i) => d.series.A![12]! * (i % 2 ? 1.2 : 1.2 * 0.8) })
    const c = cfg({ topN: 2, weighting: 'invVol', absFilter: 'off' })
    expectNoLookAhead(c, d, m, 1)
  })
})

test('annual/monthly exported for strategy and benchmarks', () => {
  // la with US flat; strategy V = 1, 1.1, 1.1, 1.21, 1.21 on 2000-02..2000-06 → one partial year 2000 = +21%
  const r = backtest(cfg(), mk({ ...la.series, US: flat(6) }))
  expect(r.annual).toEqual([{ year: 2000, return: expect.closeTo(0.21, 12), full: false }])
  expect(r.monthly.map((m) => m.date)).toEqual(['2000-03', '2000-04', '2000-05', '2000-06'])
  expect(r.monthly.map((m) => m.return)).toEqual([expect.closeTo(0.1, 12), 0, expect.closeTo(0.1, 12), 0])
  expect(r.benchmarks.BH_US!.annual).toEqual([{ year: 2000, return: 0, full: false }])
  expect(r.benchmarks.BH_US!.monthly).toHaveLength(4)
})

describe('currentSignal', () => {
  // la (L=1, zero hurdle): decisions idx1 A, idx2 A, idx3 B (A 0% vs B +20%), idx4 B, idx5 A (A +10% vs B 0%)
  test('asOf decision differs from previous, hand-computed signals', () => {
    const s = currentSignal(cfg(), la)
    // asOf idx5 2000-06: A 133.1/121−1 = .1, B 138.6/138.6−1 = 0, AGG 0 → A ; previous decision idx4 → B
    expect(s).toEqual({
      asOf: '2000-06',
      tradeMonth: '2000-07',
      weights: { A: 1 },
      previous: { B: 1 },
      changed: true,
      signals: [{ sleeve: 0, lookback: 1, scores: { A: expect.closeTo(0.1, 12), B: 0, AGG: 0 }, hurdle: 0, picked: ['A'], toSafe: false }],
      isRebalanceMonth: true,
    })
    expect(currentSignal(cfg({}, { executionLag: 1 }), la).tradeMonth).toBe('2000-08')
  })

  test('matches the backtest decision at the same month (shared decision path)', () => {
    // full backtest switches A→B at idx3 (2000-04); currentSignal on data cut at idx3 makes the same decision
    const cut = mk(Object.fromEntries(Object.entries(la.series).map(([k, v]) => [k, v.slice(0, 4)])))
    const s = currentSignal(cfg(), cut)
    const trade = backtest(cfg(), la).trades.find((t) => t.date === '2000-04')!
    expect(s.asOf).toBe('2000-04')
    expect(s.weights).toEqual(trade.to)
    expect(s.signals).toEqual(trade.signals)
  })

  test('no look-ahead: asOf is the last data month; appending a month moves asOf and keeps the old decision', () => {
    // There is no month after asOf in the input, so data after asOf cannot exist by construction.
    const cut = mk(Object.fromEntries(Object.entries(la.series).map(([k, v]) => [k, v.slice(0, 4)])))
    const before = currentSignal(cfg(), cut) // asOf 2000-04 (idx3) → B
    expect(before.asOf).toBe('2000-04')
    const after = currentSignal(cfg(), mk(Object.fromEntries(Object.entries(la.series).map(([k, v]) => [k, v.slice(0, 5)]))))
    expect(after.asOf).toBe('2000-05')
    expect(after.previous).toEqual(before.weights)
  })

  test('quarterly: non-quarter-end asOf repeats the last decision', () => {
    // la is 2000-01..2000-06; quarterly decisions at t0 (2000-02), 2000-03, 2000-06. Cut at 2000-05 → last = 2000-03 (A)
    const cut = mk(Object.fromEntries(Object.entries(la.series).map(([k, v]) => [k, v.slice(0, 5)])))
    const s = currentSignal(cfg({}, { rebalance: 'quarterly' }), cut)
    expect(s).toMatchObject({ asOf: '2000-05', isRebalanceMonth: false, weights: { A: 1 }, previous: { A: 1 }, changed: false })
    // asOf 2000-06 is a quarter-end: A again vs previous 2000-03 A
    expect(currentSignal(cfg({}, { rebalance: 'quarterly' }), la)).toMatchObject({ isRebalanceMonth: true, changed: false })
  })

  test('first decision month has no previous', () => {
    const cut = mk(Object.fromEntries(Object.entries(la.series).map(([k, v]) => [k, v.slice(0, 2)])))
    expect(currentSignal(cfg(), cut)).toMatchObject({ asOf: '2000-02', previous: {}, changed: true })
    expect(() => currentSignal(cfg(), mk({ A: [100], B: [100], AGG: [100] }))).toThrow(DataError)
  })
})
