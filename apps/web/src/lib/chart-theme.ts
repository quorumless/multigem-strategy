// Shared look for every Recharts chart: recessive axes and grid, year ticks, nice value ticks, one tooltip.
// Colors only from chart-colors.ts / theme tokens.

const ink = 'var(--muted-foreground)'
export const axisTick = { fontSize: 11, fill: ink }
/** Spread onto <CartesianGrid>: horizontal lines only. */
export const gridProps = { vertical: false, stroke: 'var(--border)' } as const
/** Spread onto a date <XAxis> (dataKey 'date', values `YYYY-MM`) together with `ticks={yearTicks(dates)}`. */
export const dateAxisProps = {
  dataKey: 'date',
  tick: axisTick,
  tickLine: false,
  axisLine: { stroke: 'var(--border)' },
  interval: 0,
  tickFormatter: (d: string) => d.slice(0, 4),
} as const
/** Spread onto a value <YAxis>. */
export const valueAxisProps = { tick: axisTick, tickLine: false, axisLine: false, width: 44 } as const

const niceStep = (raw: number) => {
  const p = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)!
}

/** Round tick values covering [min, max] (about `n` of them), always including 0 when in range. */
export function niceTicks(min: number, max: number, n = 5): number[] {
  if (!(max > min)) return [min]
  const step = niceStep((max - min) / n)
  const out: number[] = []
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.999; v += step) out.push(+v.toPrecision(12))
  return out
}

/** One January tick every 1/2/5/10 years so labels never crowd. */
export function yearTicks(dates: string[], target = 6): string[] {
  const years = [...new Set(dates.map((d) => Number(d.slice(0, 4))))]
  const step = [1, 2, 5, 10, 20].find((s) => years.length / s <= target) ?? 20
  return dates.filter((d) => d.endsWith('-01') && Number(d.slice(0, 4)) % step === 0)
}

export const compactMoney = (v: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
