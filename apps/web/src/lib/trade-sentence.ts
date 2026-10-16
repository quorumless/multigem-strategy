// Plain-sentence trade log lines (PRD U6), built from trades[].signals. Presentation only, no strategy math.
import type { Strategy, Trade } from 'engine'
import { monthName, pct } from './format.ts'

const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] ?? ''))
const EPS = 0.005

export function tradeSentence(t: Trade, cfg: Strategy, label: (id: string) => string): string {
  const head = `${monthName(t.date)}: `
  if (t.signals.length === 0) return `${head}tax paid on gains from earlier sales.`
  const ids = new Set([...Object.keys(t.from), ...Object.keys(t.to)])
  const sold = [...ids].filter((a) => (t.from[a] ?? 0) - (t.to[a] ?? 0) > EPS).map(label)
  const bought = [...ids].filter((a) => (t.to[a] ?? 0) - (t.from[a] ?? 0) > EPS).map(label)
  const action =
    Object.keys(t.from).length === 0
      ? `started with ${list(bought)}`
      : sold.length && bought.length
        ? `switched ${list(sold)} → ${list(bought)}`
        : bought.length
          ? `bought ${list(bought)}`
          : 'rebalanced'
  // ponytail: explains the first signal only; multi-sleeve / multi-lookback decisions get "(+N more checks)"
  const s = t.signals[0]!
  const sl = cfg.sleeves[s.sleeve]
  let why = ''
  if (s.picked.length === 0 && sl) {
    const best = [...sl.universe].sort((a, b) => s.scores[b]! - s.scores[a]!)[0]!
    const bar = sl.absFilter === 'tbill' ? 'T-bills' : 'zero'
    const months = s.lookback ? ` over ${s.lookback} months` : ''
    why = s.hurdle == null ? 'safe haven chosen' : `nothing beat ${bar}${months}; best was ${label(best)} at ${pct(s.scores[best])} vs ${pct(s.hurdle)}`
  } else if (s.picked.length) {
    why = `${list(s.picked.map(label))} had the strongest momentum${s.hurdle == null ? '' : ' and beat the hurdle'}`
  }
  const more = t.signals.length > 1 ? ` (+${t.signals.length - 1} more checks)` : ''
  return `${head}${action}${why ? ` (${why})` : ''}${more}.`
}
