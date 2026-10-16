// Reshapes engine output (`annual`, `monthly`) for the charts. No math here (golden rule 5).
import type { RunResult } from 'engine'

/** Full calendar years only, so the bars agree with `relative.fullYears`. */
export const fullYears = (r: RunResult) => new Map(r.annual.filter((a) => a.full).map((a) => [a.year, a.return]))

/** `{ year → [12 monthly returns | null] }` for the heatmap. */
export function heatmapRows(r: RunResult): Map<number, (number | null)[]> {
  const out = new Map<number, (number | null)[]>()
  for (const { date, return: ret } of r.monthly) {
    const y = Number(date.slice(0, 4))
    if (!out.has(y)) out.set(y, Array<number | null>(12).fill(null))
    out.get(y)![Number(date.slice(5)) - 1] = ret
  }
  return out
}
