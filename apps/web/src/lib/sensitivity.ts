import { backtest, type Metrics, type MonthlyData, type StrategyInput } from 'engine'

// ponytail: guessed thresholds (lead's default), revisit when the M7 overfitting review sets real ones.
export const FRAGILE = { cagr: 0.02, maxDrawdown: 0.05 }

/** Same strategy with every sleeve's lookbacks moved by `d` months (clamped to 1–12). Config edit only. */
export function shiftLookbacks(config: StrategyInput, d: number): StrategyInput {
  const c = structuredClone(config)
  for (const s of c.sleeves) s.lookbacks = [...new Set((s.lookbacks ?? [12]).map((l) => Math.min(12, Math.max(1, l + d))))].sort((a, b) => a - b)
  return c
}

export const isFragile = (base: Metrics, neighbours: Metrics[]) =>
  neighbours.some((m) => Math.abs(m.cagr - base.cagr) > FRAGILE.cagr || Math.abs(m.maxDrawdown - base.maxDrawdown) > FRAGILE.maxDrawdown)

export function fragileCheck(config: StrategyInput, data: MonthlyData) {
  const base = backtest(config, data).metrics
  const near = [-1, 1].map((d) => backtest(shiftLookbacks(config, d), data).metrics)
  return { base, near, fragile: isFragile(base, near) }
}
