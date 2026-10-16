// Compare helpers. The engine does all the math; this only runs configs on a shared range and picks winners.
import { backtest, type BacktestResult, type MonthlyData, type RunResult, type StrategyInput } from 'engine'

export const SP_NAME = 'S&P 500 (buy & hold)'

/** One column of the comparison: a strategy, or the engine's BH_US benchmark. */
export interface Entry {
  name: string
  currency: string
  run: RunResult
  /** vs BH_US; null for the benchmark itself. */
  behind: { yearsBehind: number; fullYears: number } | null
  isBenchmark: boolean
}

/** Strategies first, then (optionally) the engine's BH_US benchmark from the first result: same range, nothing re-computed. */
export function toEntries(results: BacktestResult[], withSp: boolean): Entry[] {
  const entries: Entry[] = results.map((r) => ({
    name: r.config.name,
    currency: r.config.settings.currency,
    run: r,
    behind: r.relative ? { yearsBehind: r.relative.yearsBehind, fullYears: r.relative.fullYears } : null,
    isBenchmark: false,
  }))
  const bh = results[0]?.benchmarks.BH_US
  if (withSp && bh) entries.push({ name: SP_NAME, currency: entries[0]!.currency, run: bh, behind: null, isBenchmark: true })
  return entries
}

export function compareRuns(inputs: StrategyInput[], data: MonthlyData) {
  const first = inputs.map((i) => backtest(i, data))
  const start = first.map((r) => r.range.start).reduce((a, b) => (a > b ? a : b))
  const end = first.map((r) => r.range.end).reduce((a, b) => (a < b ? a : b))
  const same = first.every((r) => r.range.start === start && r.range.end === end)
  const results = same ? first : inputs.map((i) => backtest({ ...i, startDate: start, endDate: end }, data))
  // report what the final runs actually cover (executionLag=1 can start a month later than asked)
  const range = {
    start: results.map((r) => r.range.start).reduce((a, b) => (a > b ? a : b)),
    end: results.map((r) => r.range.end).reduce((a, b) => (a < b ? a : b)),
  }
  return { results, range, trimmed: !same }
}

/** Indexes holding the best value (ties all win). Nulls never win. */
export function bestIndexes(values: (number | null)[], better: 'higher' | 'lower'): Set<number> {
  const xs = values.filter((v): v is number => v != null)
  if (xs.length < 2) return new Set()
  const best = better === 'higher' ? Math.max(...xs) : Math.min(...xs)
  return new Set(values.flatMap((v, i) => (v === best ? [i] : [])))
}

/** "Classic GEM grew more than simply holding the S&P 500 (10.6% vs 9.9% a year); Multi-sleeve had the smallest worst fall." */
export function summarySentence(es: Entry[]): string {
  if (es.length < 2) return ''
  const grew = [...bestIndexes(es.map((e) => e.run.metrics.cagr), 'higher')]
  const fall = [...bestIndexes(es.map((e) => e.run.metrics.maxDrawdown), 'higher')]
  const name = (i: number) => (es[i]!.isBenchmark ? 'Simply holding the S&P 500' : es[i]!.name)
  const sp = es.findIndex((e) => e.isBenchmark)
  const a = grew.map(name).join(' and ')
  const b = fall.map(name).join(' and ')
  const pc = (i: number) => `${(es[i]!.run.metrics.cagr * 100).toFixed(1)}%`
  let growth = `${a} grew most`
  if (sp >= 0 && grew.length === 1 && grew[0] !== sp) growth = `${a} grew more than simply holding the S&P 500 (${pc(grew[0]!)} vs ${pc(sp)} a year)`
  else if (sp >= 0 && grew[0] === sp && grew.length === 1) growth = `${a} grew most (${pc(sp)} a year)`
  return a === b ? `${growth} and had the smallest worst fall.` : `${growth}; ${b} had the smallest worst fall.`
}
