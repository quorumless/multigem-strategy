import type { Trade } from 'engine'

/** First decision in [from, to] where the strategy left risky assets (nothing beat the hurdle), and the next one back in. */
export function findRiskOff(trades: Trade[], from: string, to: string) {
  const out = trades.find((t) => t.date >= from && t.date <= to && t.signals[0] && t.signals[0].picked.length === 0 && t.signals[0].toSafe)
  const back = out && trades.find((t) => t.date > out.date && t.signals[0] && t.signals[0].picked.length > 0)
  return { out, back }
}
