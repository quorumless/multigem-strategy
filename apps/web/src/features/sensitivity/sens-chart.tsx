import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { STRATEGY } from '@/lib/chart-colors'
import { ChartTooltip } from '@/lib/chart-parts'
import { axisTick, gridProps, niceTicks, valueAxisProps } from '@/lib/chart-theme'

export interface Point {
  x: string
  y: number | null
}

/** `current` marks the user's setting, with its ±1 neighbours shaded; `typical` draws a dashed reference level (caption it). */
export default function SensChart({ points, current, unit, name = 'Value', typical }: { points: Point[]; current?: string; unit: string; name?: string; typical?: number }) {
  const ys = points.map((p) => p.y).filter((y): y is number => y != null)
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys), 4)
  const i = current ? points.findIndex((p) => p.x === current) : -1
  const cur = i >= 0 ? points[i] : undefined
  const fmt = (v: number) => `${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}${unit}`
  return (
    <ResponsiveContainer>
      <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        {cur && (
          <ReferenceArea x1={points[Math.max(0, i - 1)]!.x} x2={points[Math.min(points.length - 1, i + 1)]!.x} fill='var(--muted-foreground)' fillOpacity={0.08} />
        )}
        <XAxis dataKey='x' tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval='preserveStartEnd' minTickGap={12} />
        <YAxis {...valueAxisProps} ticks={ticks} domain={[ticks[0]!, ticks.at(-1)!]} tickFormatter={(v: number) => `${v}${unit}`} />
        {typical != null && (
          <ReferenceLine y={typical} stroke='var(--muted-foreground)' strokeDasharray='4 3' />
        )}
        <Tooltip content={<ChartTooltip format={(v) => `${v.toFixed(2)}${unit}`} labelFormat={String} />} />
        <Line dataKey='y' name={name} stroke={STRATEGY} strokeWidth={2} dot={{ r: 3, fill: 'var(--card)', strokeWidth: 1.5 }} isAnimationActive={false} />
        {cur?.y != null && (
          <ReferenceLine
            x={cur.x}
            stroke='var(--muted-foreground)'
            strokeOpacity={0.5}
            label={{ value: `your choice: ${fmt(cur.y)}`, position: i > points.length / 2 ? 'insideTopRight' : 'insideTopLeft', offset: 6, fontSize: 11, fill: 'var(--foreground)' }}
          />
        )}
        {cur?.y != null && <ReferenceDot x={cur.x} y={cur.y} r={5} fill={STRATEGY} stroke='var(--card)' strokeWidth={2} />}
      </LineChart>
    </ResponsiveContainer>
  )
}
