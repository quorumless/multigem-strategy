import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { STRATEGY } from '@/lib/chart-colors'
import { ChartTooltip } from '@/lib/chart-parts'
import { compactMoney, dateAxisProps, gridProps, niceTicks, valueAxisProps, yearTicks } from '@/lib/chart-theme'

const margin = { top: 8, right: 12, left: 0, bottom: 0 }

/** Growth of 10,000 (index) with optional log scale. */
export function GrowthChart({ rows, log }: { rows: { date: string; value: number }[]; log: boolean }) {
  const ticks = niceTicks(0, Math.max(...rows.map((r) => r.value)), 4)
  return (
    <ResponsiveContainer>
      <LineChart data={rows} margin={margin}>
        <CartesianGrid {...gridProps} />
        <XAxis {...dateAxisProps} ticks={yearTicks(rows.map((r) => r.date))} />
        <YAxis
          {...valueAxisProps}
          scale={log ? 'log' : 'linear'}
          domain={log ? ['auto', 'auto'] : [0, ticks.at(-1)!]}
          ticks={log ? undefined : ticks}
          allowDataOverflow
          tickFormatter={compactMoney}
        />
        <Tooltip content={<ChartTooltip format={(v) => Math.round(v).toLocaleString('en-US')} />} />
        <Line dataKey='value' name='Value' stroke={STRATEGY} dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function RollingChart({ rows }: { rows: { date: string; value: number | null }[] }) {
  return (
    <ResponsiveContainer>
      <LineChart data={rows} margin={margin}>
        <CartesianGrid {...gridProps} />
        <XAxis {...dateAxisProps} ticks={yearTicks(rows.map((r) => r.date))} />
        <YAxis {...valueAxisProps} domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} />
        <ReferenceLine y={0} stroke='var(--muted-foreground)' strokeOpacity={0.6} />
        <Tooltip content={<ChartTooltip format={(v) => v.toFixed(2)} />} />
        <Line dataKey='value' name='Correlation' stroke={STRATEGY} dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
