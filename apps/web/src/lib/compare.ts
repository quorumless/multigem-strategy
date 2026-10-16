// Compare helpers. The engine does all the math; this only runs configs on a shared range and picks winners.
import { backtest, type BacktestResult, type MonthlyData, type StrategyInput } from 'engine'

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

/** "Classic GEM grew most; Multi-sleeve had the smallest worst fall." */
export function summarySentence(rs: BacktestResult[]): string {
  if (rs.length < 2) return ''
  const grew = [...bestIndexes(rs.map((r) => r.metrics.cagr), 'higher')]
  const fall = [...bestIndexes(rs.map((r) => r.metrics.maxDrawdown), 'higher')]
  const name = (i: number) => rs[i]!.config.name
  const a = grew.map(name).join(' and ')
  const b = fall.map(name).join(' and ')
  if (!a && !b) return ''
  return a === b ? `${a} grew most and had the smallest worst fall.` : `${a} grew most; ${b} had the smallest worst fall.`
}
