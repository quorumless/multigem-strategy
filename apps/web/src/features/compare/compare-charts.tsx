import type { Entry } from '@/lib/compare'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { money } from '@/lib/format'
import { BENCH_COLOR, CAT } from '@/lib/chart-colors'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { START_AMOUNT } from '@/features/lab/results'

const tick = { fontSize: 11 }

export default function CompareCharts({ results }: { results: Entry[] }) {
  const ccy = results[0]!.currency
  const byDate = results.map((r) => new Map(r.run.series.map((p) => [p.date, p])))
  const rows = (f: (p: Entry['run']['series'][number]) => number) =>
    results[0]!.run.series.map((p) => ({
      date: p.date,
      ...Object.fromEntries(results.map((r, j) => [r.name, byDate[j]!.has(p.date) ? f(byDate[j]!.get(p.date)!) : NaN])),
    }))
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
            {results.map((r, i) => <Line key={r.name} dataKey={r.name} stroke={r.isBenchmark ? BENCH_COLOR.BH_US : CAT[i % CAT.length]} dot={false} strokeWidth={r.isBenchmark ? 1.5 : 2} strokeDasharray={r.isBenchmark ? '5 3' : undefined} />)}
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
