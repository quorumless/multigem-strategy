import { backtest, DataError, type BacktestResult, type StrategyInput } from 'engine'
import { data } from '@/data/source'

export interface Run {
  result?: BacktestResult
  /** Same run without fees and tax, for the "before vs after" line. */
  gross?: BacktestResult
  error?: string
  ms: number
}

/** Plain-words version of an engine error. */
export function errorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (e instanceof DataError) {
    if (/not enough data/.test(m)) return "There isn't enough data for that period. Try a wider date range, or assets with a longer history."
    return `${m}. One of the chosen assets may not have data for those dates.`
  }
  return m
}

/** Runs the engine (twice: real costs, and no costs/tax). Errors become messages, never exceptions. */
export function runBoth(input: StrategyInput): Run {
  const t0 = performance.now()
  try {
    const result = backtest(input, data)
    const s = result.config.settings
    const gross = backtest({ ...input, settings: { ...s, costPct: 0, fxCostPct: 0, tax: { ...s.tax, enabled: false } } }, data)
    return { result, gross, ms: performance.now() - t0 }
  } catch (e) {
    if (e instanceof DataError) return { error: errorMessage(e), ms: performance.now() - t0 }
    throw e
  }
}

