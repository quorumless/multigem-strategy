import { describe, expect, test } from 'vitest'
import { annualReturns, computeMetrics, monthlyReturns } from '../src/metrics.ts'

const cum = (r: number[]) => r.reduce((v, x) => [...v, v.at(-1)! * (1 + x)], [1])
const near = (a: number | null, b: number, p = 4) => expect(a).toBeCloseTo(b, p)

// Base fixture: 6 months, V_0 at 2020-10.
// R   = [.10, -.10, .20, 0, -.05, .10]   rf = .01 every month
// V   = 1, 1.1, 0.99, 1.188, 1.188, 1.1286, 1.24146
const dates = ['2020-10', '2020-11', '2020-12', '2021-01', '2021-02', '2021-03', '2021-04']
const R = [0.1, -0.1, 0.2, 0, -0.05, 0.1]
const US: Record<string, number> = { US: 1 }
const holdings: Record<string, number>[] = [US, US, US, { AGG: 1 }, { US: 0.5, AGG: 0.5 }, { US: 0.5, AGG: 0.5 }]
const base = { dates, values: cum(R), rf: R.map(() => 0.01), holdings }
const m = computeMetrics(base)

describe('computeMetrics', () => {
  test('total return and CAGR', () => {
    // 1.24146 - 1
    near(m.totalReturn, 0.24146)
    // 1.24146^(12/6) - 1 = 1.54122 - 1
    near(m.cagr, 0.54122)
    expect(m.months).toBe(6)
  })

  test('volatility: sample stdev x sqrt(12)', () => {
    // mean = .25/6 = .041667; deviations² sum = .062083; /5 = .0124167; sd = .111430
    // vol = .111430 × 3.4641 = .38600
    near(m.volatility, 0.386, 3)
  })

  test('sharpe', () => {
    // excess = R - .01 = [.09,-.11,.19,-.01,-.06,.09]; mean = .031667; sd = .111430 (rf const)
    // sharpe = .031667×12 / (.111430×√12) = .38 / .38600
    near(m.sharpe, 0.9845, 3)
  })

  test('sortino', () => {
    // min(0,x)² = [0,.0121,0,.0001,.0036,0]; sum .0158; mean .0026333; sqrt .051316
    // sortino = .38 / (.051316×√12) = .38 / .177763
    near(m.sortino, 2.1377, 3)
  })

  test('drawdown: peak, trough, recovery', () => {
    // running max 1,1.1,1.1,1.188,...; DD = 0,0,-.10,0,0,-.05,0 → MaxDD -.10
    near(m.maxDrawdown, -0.1)
    expect(m.maxDrawdownPeak).toBe('2020-11')
    expect(m.maxDrawdownTrough).toBe('2020-12')
    // 1.188 >= 1.1 at 2021-01, one month after trough
    expect(m.maxDrawdownRecoveryMonths).toBe(1)
  })

  test('calmar and ulcer', () => {
    // .54122 / .10
    near(m.calmar, 5.4122, 3)
    // sqrt((.10² + .05²)/6) = sqrt(.0125/6)
    near(m.ulcer, 0.045644)
  })

  test('best/worst year: partial years ignored', () => {
    // 2020 (2 months) and 2021 (4 months) are both partial → no full year
    expect(m.bestYear).toBeNull()
    expect(m.worstYear).toBeNull()
  })

  test('% positive months', () => {
    // .10, .20, .10 of 6
    expect(m.pctPositiveMonths).toBe(0.5)
  })

  test('switches per year', () => {
    // sets: US,US,US,AGG,{AGG,US},{AGG,US} → 2 changes over 6/12 years = 4
    expect(m.switchesPerYear).toBeCloseTo(4, 10)
  })

  test('initial move out of empty holdings is not a switch', () => {
    // sets: {}, US, US, AGG, AGG, AGG → only US→AGG counts: 1 over 6/12 years = 2
    const r = computeMetrics({ ...base, holdings: [{}, US, US, { AGG: 1 }, { AGG: 1 }, { AGG: 1 }] })
    expect(r.switchesPerYear).toBeCloseTo(2, 10)
  })

  test('time in asset', () => {
    // US: (1+1+1+0+.5+.5)/6 = 4/6; AGG: (0+0+0+1+.5+.5)/6 = 2/6
    near(m.timeInAsset.US!, 4 / 6, 10)
    near(m.timeInAsset.AGG!, 2 / 6, 10)
  })
})

describe('edge cases', () => {
  test('no drawdown', () => {
    // V = 1, 1.01, 1.0201 — monotone up
    const r = computeMetrics({
      dates: ['2021-01', '2021-02', '2021-03'],
      values: cum([0.01, 0.01]),
      rf: [0, 0],
      holdings: [US, US],
    })
    expect(r.maxDrawdown).toBe(0)
    expect(r.maxDrawdownPeak).toBeNull()
    expect(r.maxDrawdownTrough).toBeNull()
    expect(r.maxDrawdownRecoveryMonths).toBe(0)
    expect(r.calmar).toBeNull()
    expect(r.ulcer).toBe(0)
    // identical returns → zero stdev → Sharpe undefined; no downside → Sortino undefined
    expect(r.sortino).toBeNull()
    expect(r.switchesPerYear).toBe(0)
  })

  test('never recovered', () => {
    // V = 1, 1.2, 0.9, 1.0 ; peak 1.2 never regained
    const r = computeMetrics({
      dates: ['2021-01', '2021-02', '2021-03', '2021-04'],
      values: [1, 1.2, 0.9, 1.0],
      rf: [0, 0, 0],
      holdings: [US, US, US],
    })
    near(r.maxDrawdown, -0.25) // .9/1.2 - 1
    expect(r.maxDrawdownPeak).toBe('2021-02')
    expect(r.maxDrawdownTrough).toBe('2021-03')
    expect(r.maxDrawdownRecoveryMonths).toBeNull()
  })

  test('single full calendar year', () => {
    // V_0 at 2020-12, 12 months of +1% in 2021 → full year, not partial
    const d = ['2020-12', ...Array.from({ length: 12 }, (_, i) => `2021-${String(i + 1).padStart(2, '0')}`)]
    const r = computeMetrics({
      dates: d,
      values: cum(Array(12).fill(0.01)),
      rf: Array(12).fill(0),
      holdings: Array(12).fill(US),
    })
    expect(r.bestYear).toEqual(r.worstYear)
    expect(r.bestYear!.year).toBe(2021)
    near(r.bestYear!.return, 1.01 ** 12 - 1, 10)
    near(r.cagr, 1.01 ** 12 - 1, 10) // n = 12 → CAGR = total return
  })

  test('partial first/last years with highest return are ignored', () => {
    // V_0 at 2019-12; 2020 full year: 12 × -1%; 2021-01 partial: +50%
    const d = ['2019-12', ...Array.from({ length: 12 }, (_, i) => `2020-${String(i + 1).padStart(2, '0')}`), '2021-01']
    const r = [...Array(12).fill(-0.01), 0.5]
    const x = computeMetrics({ dates: d, values: cum(r), rf: r.map(() => 0), holdings: r.map(() => US) })
    expect(x.bestYear!.year).toBe(2020)
    near(x.bestYear!.return, 0.99 ** 12 - 1, 10)
    expect(x.worstYear).toEqual(x.bestYear)
  })

  test('rejects mismatched lengths', () => {
    expect(() => computeMetrics({ ...base, rf: [0] })).toThrow()
  })
})

describe('null conventions', () => {
  test('n = 1: volatility, Sharpe, Sortino are null', () => {
    // one month: −10% vs rf 0 → a sample stdev needs n ≥ 2
    const r = computeMetrics({ dates: ['2021-01', '2021-02'], values: [1, 0.9], rf: [0], holdings: [US] })
    expect(r.volatility).toBeNull()
    expect(r.sharpe).toBeNull()
    expect(r.sortino).toBeNull()
  })

  test('sd = 0: volatility is null', () => {
    // V flat → R = 0, 0 → sd exactly 0
    const r = computeMetrics({ dates: ['2021-01', '2021-02', '2021-03'], values: [1, 1, 1], rf: [0, 0], holdings: [US, US] })
    expect(r.volatility).toBeNull()
  })
})

describe('annual and monthly returns', () => {
  test('every calendar year with full flag; monthly per month', () => {
    // 2020-11 (V_0) … 2022-02: 2020 = Dec only (partial), 2021 full, 2022 = Jan–Feb (partial)
    // V: 1, 1.1 (Dec 2020), then 2021 months +1% each → 1.1·1.01^12, then Jan 2022 −10%, Feb 2022 0%
    const dates = ['2020-11', '2020-12', ...Array.from({ length: 12 }, (_, i) => `2021-${String(i + 1).padStart(2, '0')}`), '2022-01', '2022-02']
    const v21 = Array.from({ length: 12 }, (_, i) => 1.1 * 1.01 ** (i + 1))
    const values = [1, 1.1, ...v21, v21[11]! * 0.9, v21[11]! * 0.9]
    const a = annualReturns(dates, values)
    expect(a.map((x) => [x.year, x.full])).toEqual([[2020, false], [2021, true], [2022, false]])
    expect(a[0]!.return).toBeCloseTo(0.1, 12) // 1.1/1 − 1
    expect(a[1]!.return).toBeCloseTo(1.01 ** 12 - 1, 12)
    expect(a[2]!.return).toBeCloseTo(-0.1, 12)
    const mo = monthlyReturns(dates, values)
    expect(mo).toHaveLength(15)
    expect(mo[0]).toEqual({ date: '2020-12', return: expect.closeTo(0.1, 12) })
    expect(mo[13]).toEqual({ date: '2022-01', return: expect.closeTo(-0.1, 12) })
    // best/worst year still consider full years only
    expect(computeMetrics({ dates, values, rf: Array(15).fill(0), holdings: Array(15).fill(US) }).bestYear!.year).toBe(2021)
  })
})
