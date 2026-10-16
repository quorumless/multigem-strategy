import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const tick = { fontSize: 11 }

/** Growth of 10,000 (index) with optional log scale. */
export function GrowthChart({ rows, log }: { rows: { date: string; value: number }[]; log: boolean }) {
  return (
    <ResponsiveContainer>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
        <XAxis dataKey='date' tick={tick} minTickGap={40} />
        <YAxis scale={log ? 'log' : 'auto'} domain={log ? ['auto', 'auto'] : [0, 'auto']} tick={tick} width={50} allowDataOverflow tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
        <Tooltip formatter={(v) => Math.round(Number(v)).toLocaleString('en-US')} />
        <Line dataKey='value' stroke='var(--chart-strategy)' dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function RollingChart({ rows }: { rows: { date: string; value: number | null }[] }) {
  return (
    <ResponsiveContainer>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
        <XAxis dataKey='date' tick={tick} minTickGap={40} />
        <YAxis domain={[-1, 1]} tick={tick} width={35} />
        <ReferenceLine y={0} stroke='var(--muted-foreground)' />
        <Tooltip formatter={(v) => Number(v).toFixed(2)} />
        <Line dataKey='value' stroke='var(--chart-2)' dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
