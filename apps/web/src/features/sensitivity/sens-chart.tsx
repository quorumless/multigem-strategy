import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface Point {
  x: string
  y: number | null
}

export default function SensChart({ points, current, unit }: { points: Point[]; current?: string; unit: string }) {
  return (
    <ResponsiveContainer>
      <LineChart data={points}>
        <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
        <XAxis dataKey='x' tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}${unit}`} width={50} domain={['auto', 'auto']} />
        <Tooltip formatter={(v) => `${Number(v).toFixed(2)}${unit}`} />
        {current && <ReferenceLine x={current} stroke='var(--chart-2)' strokeDasharray='4 4' label={{ value: 'yours', fontSize: 11 }} />}
        <Line dataKey='y' stroke='var(--chart-1)' strokeWidth={2} dot isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
