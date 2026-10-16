import { useState } from 'react'
import type { BacktestResult } from 'engine'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fullYears, heatmapRows } from '@/lib/chart-data'
import { BENCH_COLOR, CAT, STRATEGY, diverging } from '@/lib/chart-colors'
import { MONTH_ABBR, money, pct } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { assetLabel, holdableAssets } from './assets'
import { START_AMOUNT } from './results'

const BENCH: Record<string, string> = { BH_US: 'US stocks only', '6040': '60/40 US stocks/bonds', EW: 'Equal mix of your assets' }
// An asset keeps its color whatever else is held (color follows entity).
const assetColor = (id: string) => CAT[Math.max(0, holdableAssets.findIndex((a) => a.id === id)) % CAT.length]
const tick = { fontSize: 11 }

function Panel({ title, note, action, children }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className='min-w-0'>
      <CardHeader className='flex-row items-center justify-between'>
        <CardTitle className='text-base'>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>
        <div className='h-64'>{children}</div>
        {note && <p className='mt-2 text-xs text-muted-foreground'>{note}</p>}
      </CardContent>
    </Card>
  )
}

export default function Charts({ result }: { result: BacktestResult }) {
  const [log, setLog] = useState(false)
  const ccy = result.config.settings.currency
  const benchIds = Object.keys(result.benchmarks) as (keyof typeof result.benchmarks)[]
  const benchByDate = Object.fromEntries(benchIds.map((b) => [b, new Map(result.benchmarks[b]!.series.map((p) => [p.date, p.value]))]))
  const equity = result.series.map((p) => ({
    date: p.date,
    Strategy: p.value * START_AMOUNT,
    ...Object.fromEntries(benchIds.map((b) => [BENCH[b], (benchByDate[b]!.get(p.date) ?? NaN) * START_AMOUNT])),
  }))
  const dd = result.series.map((p) => ({ date: p.date, drawdown: p.drawdown * 100 }))
  const sAnn = fullYears(result)
  const bAnn = result.benchmarks.BH_US ? fullYears(result.benchmarks.BH_US) : new Map<number, number>()
  const annual = [...sAnn].map(([year, r]) => ({ year, Strategy: r * 100, 'US stocks only': bAnn.has(year) ? bAnn.get(year)! * 100 : undefined }))
  const assetIds = [...new Set(result.series.flatMap((p) => Object.keys(p.weights)))]
  const alloc = result.series.map((p) => ({ date: p.date, ...Object.fromEntries(assetIds.map((a) => [a, (p.weights[a] ?? 0) * 100])) }))
  const heat = [...heatmapRows(result)]
  const x = <XAxis dataKey='date' tick={tick} minTickGap={40} />

  return (
    <div className='grid gap-4 xl:grid-cols-2'>
      <Panel title={`Growth of ${money(START_AMOUNT, ccy)}`} action={<label className='flex items-center gap-2 text-xs'><Switch checked={log} onCheckedChange={setLog} /> Log scale</label>}>
        <ResponsiveContainer>
          <LineChart data={equity}>
            <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
            {x}
            <YAxis scale={log ? 'log' : 'auto'} domain={log ? ['auto', 'auto'] : [0, 'auto']} tick={tick} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={45} allowDataOverflow />
            <Tooltip formatter={(v) => money(Number(v), ccy)} />
            <Legend />
            <Line dataKey='Strategy' stroke={STRATEGY} dot={false} strokeWidth={2} />
            {benchIds.map((b) => <Line key={b} dataKey={BENCH[b]!} stroke={BENCH_COLOR[b]} dot={false} strokeWidth={1.5} strokeDasharray='5 3' />)}
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title='Falls from the previous high' note='Monthly data hides falls within a month, so real dips were probably deeper than shown.'>
        <ResponsiveContainer>
          <AreaChart data={dd}>
            <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
            {x}
            <YAxis tick={tick} tickFormatter={(v: number) => `${v}%`} width={45} />
            <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
            <Area dataKey='drawdown' name='Fall' stroke={STRATEGY} fill={STRATEGY} fillOpacity={0.3} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title='Return per calendar year' note='Full years only.'>
        <ResponsiveContainer>
          <BarChart data={annual}>
            <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
            <XAxis dataKey='year' tick={tick} />
            <YAxis tick={tick} tickFormatter={(v: number) => `${v}%`} width={45} />
            <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
            <Legend />
            <Bar dataKey='Strategy' fill={STRATEGY} />
            <Bar dataKey='US stocks only' fill={BENCH_COLOR.BH_US} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title='What you held over time'>
        <ResponsiveContainer>
          <AreaChart data={alloc}>
            <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
            {x}
            <YAxis tick={tick} tickFormatter={(v: number) => `${v}%`} width={45} domain={[0, 100]} />
            <Tooltip formatter={(v) => `${Number(v).toFixed(0)}%`} />
            <Legend />
            {assetIds.map((a) => <Area key={a} dataKey={a} name={assetLabel(a)} stackId='1' stroke={assetColor(a)} fill={assetColor(a)} fillOpacity={0.8} />)}
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Card className='min-w-0 xl:col-span-2'>
        <CardHeader>
          <CardTitle className='text-base'>Every month</CardTitle>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          <table className='w-full min-w-[640px] border-separate border-spacing-0.5 text-center text-[11px]'>
            <thead>
              <tr>
                <th />
                {MONTH_ABBR.map((m) => <th key={m} className='font-normal text-muted-foreground'>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {heat.map(([year, row]) => (
                <tr key={year}>
                  <th className='pe-2 text-end font-normal text-muted-foreground'>{year}</th>
                  {row.map((r, m) => (
                    <td
                      key={m}
                      title={r == null ? undefined : pct(r)}
                      style={r == null ? undefined : { background: diverging((r / 0.08) * 0.6) }}
                      className='rounded-sm py-1'
                    >
                      {r == null ? '' : (r * 100).toFixed(1)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
