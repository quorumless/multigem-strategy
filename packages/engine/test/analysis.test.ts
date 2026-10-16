import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { correlationMatrix, rollingCorrelation, rollingStart } from '../src/analysis.ts'
import { backtest } from '../src/backtest.ts'
import { DataError, parseMonthlyCsv, type MonthlyData } from '../src/data.ts'

// Returns (months 2..5): X +1%, +2%, +3%, +1% ; Y +1%, +3%, +2%, +1% ; Z = −X ; W starts one month later
const grow = (start: number, rs: number[]) => rs.reduce((p, r) => [...p, p.at(-1)! * (1 + r)], [start])
const data: MonthlyData = {
  dates: ['2000-01', '2000-02', '2000-03', '2000-04', '2000-05'],
  series: {
    X: grow(100, [0.01, 0.02, 0.03, 0.01]),
    Y: grow(100, [0.01, 0.03, 0.02, 0.01]),
    Z: grow(100, [-0.01, -0.02, -0.03, -0.01]),
    W: [null, ...grow(100, [0.05, 0.05, 0.05])],
    C: [100, 100, 100, 100, 100],
  },
}

test('correlationMatrix: Pearson on monthly returns, overlap only, range filter', () => {
  // first 3 months: x = 1,2,3 ; y = 1,3,2 (%). dev x −1,0,1 ; y −1,1,0 → sxy 1, sxx 2, syy 2 → 0.5
  const m = correlationMatrix(data, ['X', 'Y', 'Z'], { to: '2000-04' })
  expect(m.ids).toEqual(['X', 'Y', 'Z'])
  expect(m.months).toBe(3)
  expect(m.matrix[0]![1]).toBeCloseTo(0.5, 12)
  expect(m.matrix[1]![0]).toBeCloseTo(0.5, 12)
  expect(m.matrix[0]![2]).toBeCloseTo(-1, 12) // Z = −X
  expect(m.matrix[2]![2]).toBe(1)
  // W has returns only from 2000-03 → overlap with X is 3 months (2000-03..05)
  expect(correlationMatrix(data, ['X', 'W']).months).toBe(3)
  // constant series → null
  expect(correlationMatrix(data, ['X', 'C']).matrix[0]![1]).toBeNull()
  expect(() => correlationMatrix(data, ['X', 'Y'], { from: '2000-04' })).toThrow(DataError)
  expect(() => correlationMatrix(data, ['X', 'Q'])).toThrow(/Q/)
})

test('rollingCorrelation: trailing window, dates where the window is complete', () => {
  // window 3: ends 2000-04 (x 1,2,3 / y 1,3,2 → .5) and 2000-05 (x 2,3,1 / y 3,2,1 → dev x 0,1,−1 ; y 1,0,−1 → .5)
  expect(rollingCorrelation(data, 'X', 'Y', 3)).toEqual([
    { date: '2000-04', value: expect.closeTo(0.5, 12) },
    { date: '2000-05', value: expect.closeTo(0.5, 12) },
  ])
  // W: first complete 3-month window ends 2000-05
  expect(rollingCorrelation(data, 'X', 'W', 3).map((r) => r.date)).toEqual(['2000-05'])
})

test('rollingStart: one backtest per January, windows past the data skipped', () => {
  const real = parseMonthlyCsv(readFileSync(new URL('fixtures/monthly.csv', import.meta.url), 'utf8'))
  // fixture 2000-01..2002-12; L=1 → first feasible 2000-02 → first January start 2001.
  // horizon 1: 2001-01..2002-01 ; 2002-01..2003-01 runs past 2002-12 → skipped.
  const cfg = { name: 't', sleeves: [{ id: 'g', weight: 1, universe: ['US', 'DEVXUS'], lookbacks: [1] }] }
  const rows = rollingStart(cfg, real, { horizonYears: 1, metric: 'cagr' })
  expect(rows.map((r) => [r.startYear, r.range])).toEqual([[2001, { start: '2001-01', end: '2002-01' }]])
  // same number as a direct backtest of that window (12 months → CAGR = total return)
  const direct = backtest({ ...cfg, startDate: '2001-01', endDate: '2002-01' }, real).metrics
  expect(rows[0]!.value).toBe(direct.cagr)
  expect(direct.months).toBe(12)
  expect(rollingStart(cfg, real, { horizonYears: 2, metric: 'maxDrawdown' })).toEqual([])
  expect(() => rollingStart(cfg, real, { horizonYears: 0, metric: 'cagr' })).toThrow(RangeError)
})
