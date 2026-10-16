import type { BacktestResult } from 'engine'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { money } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { START_AMOUNT } from '@/features/lab/results'

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']
const tick = { fontSize: 11 }

export default function CompareCharts({ results }: { results: BacktestResult[] }) {
  const ccy = results[0]!.config.settings.currency
  const rows = (f: (p: BacktestResult['series'][number]) => number) =>
    results[0]!.series.map((p, i) => ({ date: p.date, ...Object.fromEntries(results.map((r) => [r.config.name, r.series[i] ? f(r.series[i]) : NaN])) }))
  const panel = (title: string, data: object[], fmt: (v: number) => string, tickFmt: (v: number) => string) => (
    <Card className='min-w-0'>
      <CardHeader>
        <CardTitle className='text-base'>{title}</CardTitle>
      </CardHeader>
      <CardContent className='h-72'>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
            <XAxis dataKey='date' tick={tick} minTickGap={40} />
            <YAxis tick={tick} tickFormatter={tickFmt} width={45} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend />
            {results.map((r, i) => <Line key={r.config.name} dataKey={r.config.name} stroke={COLORS[i]} dot={false} strokeWidth={2} />)}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
  return (
    <div className='grid gap-4 xl:grid-cols-2'>
      {panel(`Growth of ${money(START_AMOUNT, ccy)}`, rows((p) => p.value * START_AMOUNT), (v) => money(v, ccy), (v) => `${Math.round(v / 1000)}k`)}
      {panel('Falls from the previous high', rows((p) => p.drawdown * 100), (v) => `${v.toFixed(1)}%`, (v) => `${v}%`)}
    </div>
  )
}
