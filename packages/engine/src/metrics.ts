// Metrics per docs/STRATEGY_SPEC.md §7. Pure; no I/O.

export interface MetricsInput {
  /** Month-end `YYYY-MM`, length n+1. dates[0] is the start (V_0); dates[i] is the end of month i. */
  dates: string[]
  /** Reporting-currency portfolio value, length n+1, values[0] = V_0. */
  values: number[]
  /** Risk-free (TBILL) monthly decimal return, length n; rf[i-1] belongs to month dates[i]. */
  rf: number[]
  /** Weights held during each month, length n; holdings[i-1] belongs to month dates[i]. */
  holdings: Record<string, number>[]
}

export interface YearReturn {
  year: number
  return: number
}

export interface DrawdownInfo {
  maxDrawdown: number // <= 0
  peakDate: string | null // null when there is no drawdown
  troughDate: string | null
  /** Months from trough until value regains the peak; null if not recovered. 0 when no drawdown. */
  monthsToRecover: number | null
}

export interface Metrics {
  months: number
  totalReturn: number
  cagr: number
  volatility: number | null
  sharpe: number | null
  sortino: number | null
  maxDrawdown: number
  maxDrawdownPeak: string | null
  maxDrawdownTrough: string | null
  maxDrawdownRecoveryMonths: number | null
  calmar: number | null
  ulcer: number
  bestYear: YearReturn | null
  worstYear: YearReturn | null
  pctPositiveMonths: number
  switchesPerYear: number
  timeInAsset: Record<string, number>
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length

const sampleStdev = (x: number[]) => {
  const m = mean(x)
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1))
}

const ratio = (num: number, den: number) => (den > 0 && Number.isFinite(num / den) ? num / den : null)

export function computeDrawdown(dates: string[], values: number[]): DrawdownInfo & { dd: number[] } {
  const dd: number[] = []
  let peakIdx = 0
  let best = { dd: 0, peak: 0, trough: 0 }
  for (let i = 0; i < values.length; i++) {
    if (values[i]! > values[peakIdx]!) peakIdx = i
    const d = values[i]! / values[peakIdx]! - 1
    dd.push(d)
    if (d < best.dd) best = { dd: d, peak: peakIdx, trough: i } // strict <: first trough wins ties
  }
  if (best.dd === 0) return { dd, maxDrawdown: 0, peakDate: null, troughDate: null, monthsToRecover: 0 }
  let rec: number | null = null
  for (let j = best.trough + 1; j < values.length; j++) {
    if (values[j]! >= values[best.peak]!) {
      rec = j - best.trough
      break
    }
  }
  return {
    dd,
    maxDrawdown: best.dd,
    peakDate: dates[best.peak]!,
    troughDate: dates[best.trough]!,
    monthsToRecover: rec,
  }
}

export function computeMetrics({ dates, values, rf, holdings }: MetricsInput): Metrics {
  const n = values.length - 1
  if (n < 1 || dates.length !== n + 1 || rf.length !== n || holdings.length !== n) {
    throw new Error('computeMetrics: need n>=1 months with dates/values of length n+1 and rf/holdings of length n')
  }
  const R = values.slice(1).map((v, i) => v / values[i]! - 1)
  const excess = R.map((r, i) => r - rf[i]!)

  const totalReturn = values[n]! / values[0]! - 1
  const cagr = (values[n]! / values[0]!) ** (12 / n) - 1
  const sd = n > 1 ? sampleStdev(R) : NaN
  const volatility = sd > 0 ? sd * Math.sqrt(12) : null // decided (§7): null when n = 1 or sd = 0
  const exMean12 = mean(excess) * 12
  const sharpe = n > 1 ? ratio(exMean12, sampleStdev(excess) * Math.sqrt(12)) : null
  const downside = Math.sqrt(mean(excess.map((x) => Math.min(0, x) ** 2)))
  const sortino = n > 1 ? ratio(exMean12, downside * Math.sqrt(12)) : null

  const d = computeDrawdown(dates, values)
  const calmar = d.maxDrawdown < 0 ? cagr / Math.abs(d.maxDrawdown) : null // decided: Calmar is null when there is no drawdown
  // decided: mean over the n monthly points (V_0 excluded; its DD is trivially 0)
  const ulcer = Math.sqrt(mean(d.dd.slice(1).map((x) => x * x)))

  const years: YearReturn[] = [...fullYearReturns(dates, values)].map(([year, r]) => ({ year, return: r }))
  const bestYear = years.length ? years.reduce((a, b) => (b.return > a.return ? b : a)) : null
  const worstYear = years.length ? years.reduce((a, b) => (b.return < a.return ? b : a)) : null

  // Switch = asset set (weight > 0) differs from previous month; initial purchase is not a switch.
  const setKey = (w: Record<string, number>) =>
    Object.keys(w)
      .filter((a) => w[a]! > 0)
      .sort()
      .join(',')
  let switches = 0
  // A move out of an empty set (cash before the first execution) is the initial purchase, not a switch.
  for (let i = 1; i < n; i++) if (setKey(holdings[i - 1]!) !== '' && setKey(holdings[i]!) !== setKey(holdings[i - 1]!)) switches++

  const timeInAsset: Record<string, number> = {}
  for (const w of holdings) for (const a in w) timeInAsset[a] = (timeInAsset[a] ?? 0) + w[a]! / n

  return {
    months: n,
    totalReturn,
    cagr,
    volatility,
    sharpe,
    sortino,
    maxDrawdown: d.maxDrawdown,
    maxDrawdownPeak: d.peakDate,
    maxDrawdownTrough: d.troughDate,
    maxDrawdownRecoveryMonths: d.monthsToRecover,
    calmar,
    ulcer,
    bestYear,
    worstYear,
    pctPositiveMonths: R.filter((r) => r > 0).length / n,
    switchesPerYear: switches / (n / 12),
    timeInAsset,
  }
}

export interface RelativeInput {
  /** Same shape as MetricsInput: length n+1, dates[0] = start. */
  dates: string[]
  values: number[]
  /** Benchmark value on the same dates. */
  benchValues: number[]
}

export interface RelativeMetrics {
  /** Full calendar years in the run (all 12 months), same rule as best/worst year. */
  fullYears: number
  /** Full years in which the strategy returned less than the benchmark. */
  yearsBehind: number
  /** Longest relative drawdown of strategy/benchmark, in months from peak to recovery (or to run end). */
  longestBehindMonths: number
  /** Date of the relative peak that stretch started from; null if never behind. */
  longestBehindStart: string | null
  /** Recovery date (ratio back at its peak); null if never behind or never recovered. */
  longestBehindEnd: string | null
}

export interface AnnualReturn {
  year: number
  return: number
  /** All 12 months of the year are in the run (partial first/last years are false). */
  full: boolean
}

/** Every calendar year in the run: return of year Y = V(end of Y's last month in run) / V(end of previous
 * year, or V_0) - 1. A year is full when all 12 of its months are in the run. */
export function annualReturns(dates: string[], values: number[]): AnnualReturn[] {
  const out: AnnualReturn[] = []
  let base = values[0]!
  let count = 0
  for (let i = 1; i < values.length; i++) {
    const y = Number(dates[i]!.slice(0, 4))
    count++
    if (i === values.length - 1 || Number(dates[i + 1]!.slice(0, 4)) !== y) {
      out.push({ year: y, return: values[i]! / base - 1, full: count === 12 })
      base = values[i]!
      count = 0
    }
  }
  return out
}

/** Monthly returns: entry i is the return of month dates[i+1]. */
export const monthlyReturns = (dates: string[], values: number[]) =>
  dates.slice(1).map((date, i) => ({ date, return: values[i + 1]! / values[i]! - 1 }))

/** Full calendar years only (decided: partial first/last years are ignored). Keyed by year, in order. */
const fullYearReturns = (dates: string[], values: number[]) =>
  new Map(annualReturns(dates, values).filter((a) => a.full).map((a) => [a.year, a.return]))

export function computeRelative({ dates, values, benchValues }: RelativeInput): RelativeMetrics {
  if (dates.length < 2 || values.length !== dates.length || benchValues.length !== dates.length) {
    throw new Error('computeRelative: need n>=1 months with dates/values/benchValues of length n+1')
  }
  const s = fullYearReturns(dates, values)
  const b = fullYearReturns(dates, benchValues)
  let yearsBehind = 0
  for (const [y, r] of s) if (r < b.get(y)!) yearsBehind++

  // Relative drawdown stretches of q = strategy/benchmark: from a running peak until q regains it.
  const q = values.map((v, i) => v / benchValues[i]!)
  let best = { months: 0, start: null as string | null, end: null as string | null }
  let peak = 0
  for (let i = 1; i <= q.length; i++) {
    const done = i === q.length
    if (done || q[i]! >= q[peak]!) {
      const months = (done ? q.length - 1 : i) - peak
      // a stretch exists only if some month between peak and i was below the peak
      if (months > 0 && q.slice(peak + 1, done ? q.length : i).some((x) => x < q[peak]!) && months > best.months)
        best = { months, start: dates[peak]!, end: done ? null : dates[i]! }
      if (!done) peak = i
    }
  }
  return {
    fullYears: s.size,
    yearsBehind,
    longestBehindMonths: best.months,
    longestBehindStart: best.start,
    longestBehindEnd: best.end,
  }
}
