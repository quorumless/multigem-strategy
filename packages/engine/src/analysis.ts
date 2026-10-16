// Rolling-start robustness and asset correlations (ROADMAP M7/M8). Pure; shared by the CLI and the web.
import { backtest } from './backtest.ts'
import type { StrategyInput } from './config.ts'
import { DataError, type MonthlyData } from './data.ts'
import type { Metrics } from './metrics.ts'

/** Metrics keys with a numeric (or null) value. */
export type NumericMetric = { [K in keyof Metrics]: Metrics[K] extends number | null ? K : never }[keyof Metrics]

export interface RollingWindow {
  startYear: number
  value: number | null
  range: { start: string; end: string }
}

/**
 * Backtest the config once per start year: startDate = January of each year from the first feasible start,
 * endDate = January `horizonYears` later (V = 1 at the start close, so each window is exactly horizon × 12
 * months). Windows ending after the feasible end (data or config.endDate) are skipped.
 */
export function rollingStart(
  config: StrategyInput,
  data: MonthlyData,
  { horizonYears, metric }: { horizonYears: number; metric: NumericMetric },
): RollingWindow[] {
  if (!(Number.isInteger(horizonYears) && horizonYears >= 1)) throw new RangeError('horizonYears must be an integer ≥ 1')
  const full = backtest(config, data).range
  const first = Number(full.start.slice(0, 4)) + (full.start.endsWith('-01') ? 0 : 1)
  const out: RollingWindow[] = []
  for (let y = first; `${y + horizonYears}-01` <= full.end; y++) {
    const r = backtest({ ...config, startDate: `${y}-01`, endDate: `${y + horizonYears}-01` }, data)
    out.push({ startYear: y, value: r.metrics[metric], range: r.range })
  }
  return out
}

function pearson(x: number[], y: number[]): number | null {
  const n = x.length
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my)
    sxx += (x[i]! - mx) ** 2
    syy += (y[i]! - my) ** 2
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null // null: constant series
}

/** Monthly return of column `a` at t, or null when P[t] or P[t-1] is missing. */
function ret(data: MonthlyData, a: string, t: number) {
  const c = data.series[a]
  if (!c) throw new DataError(`no data column for ${a}`)
  const p = c[t]
  const q = c[t - 1]
  return p != null && q != null ? p / q - 1 : null
}

/**
 * Pearson correlation of monthly returns over the months (return dates within [from, to]) where every asset
 * has a return. matrix[i][j] is null when a series is constant over those months.
 */
export function correlationMatrix(data: MonthlyData, assetIds: string[], { from, to }: { from?: string; to?: string } = {}) {
  const rets: number[][] = assetIds.map(() => [])
  for (let t = 1; t < data.dates.length; t++) {
    const d = data.dates[t]!
    if ((from && d < from) || (to && d > to)) continue
    const r = assetIds.map((a) => ret(data, a, t))
    if (r.some((x) => x === null)) continue
    r.forEach((x, i) => rets[i]!.push(x!))
  }
  if (assetIds.length > 0 && rets[0]!.length < 3) throw new DataError('correlation needs at least 3 overlapping months')
  const matrix = assetIds.map((_, i) => assetIds.map((_, j) => (i === j ? 1 : pearson(rets[i]!, rets[j]!))))
  return { ids: assetIds, months: rets[0]?.length ?? 0, matrix }
}

/** Correlation of a and b over the trailing `window` monthly returns ending at each date where all are available. */
export function rollingCorrelation(data: MonthlyData, a: string, b: string, window = 36) {
  if (!(Number.isInteger(window) && window >= 3)) throw new RangeError('window must be an integer ≥ 3')
  const out: { date: string; value: number | null }[] = []
  for (let t = window; t < data.dates.length; t++) {
    const x: number[] = []
    const y: number[] = []
    for (let k = t - window + 1; k <= t; k++) {
      const ra = ret(data, a, k)
      const rb = ret(data, b, k)
      if (ra === null || rb === null) break
      x.push(ra)
      y.push(rb)
    }
    if (x.length === window) out.push({ date: data.dates[t]!, value: pearson(x, y) })
  }
  return out
}
