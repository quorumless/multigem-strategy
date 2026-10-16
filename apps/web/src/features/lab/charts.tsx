import { useState } from 'react'
import type { BacktestResult } from 'engine'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fullYears, heatmapRows } from '@/lib/chart-data'
import { BENCH_COLOR, CAT, STRATEGY, diverging } from '@/lib/chart-colors'
import { ChartLegend, ChartTooltip, Panel, ScaleToggle } from '@/lib/chart-parts'
import { axisTick, compactMoney, dateAxisProps, gridProps, niceTicks, valueAxisProps, yearTicks } from '@/lib/chart-theme'
import { MONTH_ABBR, money, monthName, pct } from '@/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { assetLabel, holdableAssets } from './assets'
import { START_AMOUNT } from './results'

const BENCH: Record<string, string> = { BH_US: 'US stocks only', '6040': '60/40 US stocks/bonds', EW: 'Equal mix of your assets' }
// An asset keeps its color whatever else is held (color follows entity).
const assetColor = (id: string) => CAT[Math.max(0, holdableAssets.findIndex((a) => a.id === id)) % CAT.length]!
const pctTick = (v: number) => `${v}%`

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
  const dates = result.series.map((p) => p.date)
  const ticks = yearTicks(dates)
  const lastRow = equity.at(-1)!
  const eqMax = Math.max(...[result, ...benchIds.map((b) => result.benchmarks[b]!)].flatMap((r) => r.series.map((p) => p.value))) * START_AMOUNT

  const eqTicks = niceTicks(0, eqMax, 4)
  const dd = result.series.map((p) => ({ date: p.date, Fall: p.drawdown * 100 }))
  const trough = result.metrics.maxDrawdownTrough
  const ddTicks = niceTicks(result.metrics.maxDrawdown * 100, 0, 4)

  const sAnn = fullYears(result)
  const bAnn = result.benchmarks.BH_US ? fullYears(result.benchmarks.BH_US) : new Map<number, number>()
  const annual = [...sAnn].map(([year, r]) => ({ year, Strategy: r * 100, 'US stocks only': bAnn.has(year) ? bAnn.get(year)! * 100 : undefined }))
  const annVals = annual.flatMap((a) => [a.Strategy, a['US stocks only'] ?? 0])
  const annTicks = niceTicks(Math.min(0, ...annVals), Math.max(0, ...annVals), 5)
  const yearStep = annual.length > 24 ? 5 : annual.length > 10 ? 2 : 1
  const annXTicks = annual.map((a) => a.year).filter((y) => y % yearStep === 0)

  const assetIds = [...new Set(result.series.flatMap((p) => Object.keys(p.weights)))]
  const alloc = result.series.map((p) => ({ date: p.date, ...Object.fromEntries(assetIds.map((a) => [a, (p.weights[a] ?? 0) * 100])) }))
  const heat = [...heatmapRows(result)]

  return (
    <div className='space-y-4'>
      <Panel
        title={`Growth of ${money(START_AMOUNT, ccy)}`}
        note='Value at each month-end, after costs and tax. Dashed lines are simple alternatives.'
        label={`Line chart: the strategy grew ${money(START_AMOUNT, ccy)} to ${money(lastRow.Strategy, ccy)} from ${monthName(dates[0]!)} to ${monthName(dates.at(-1)!)}.`}
        height='h-72 sm:h-80'
        action={<ScaleToggle log={log} setLog={setLog} />}
        footer={
          <ChartLegend
            items={[
              { label: 'Strategy', color: STRATEGY, value: money(lastRow.Strategy, ccy) },
              ...benchIds.map((b) => ({ label: BENCH[b]!, color: BENCH_COLOR[b]!, dashed: true, value: money(Number(lastRow[BENCH[b]! as 'Strategy']), ccy) })),
            ]}
          />
        }
      >
        <ResponsiveContainer>
          <LineChart data={equity} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...dateAxisProps} ticks={ticks} />
            <YAxis
              {...valueAxisProps}
              scale={log ? 'log' : 'linear'}
              domain={log ? ['auto', 'auto'] : [0, eqTicks.at(-1)!]}
              ticks={log ? undefined : eqTicks}
              tickFormatter={compactMoney}
              allowDataOverflow
            />
            <Tooltip content={<ChartTooltip format={(v) => money(v, ccy)} />} />
            {benchIds.map((b) => (
              <Line key={b} dataKey={BENCH[b]!} stroke={BENCH_COLOR[b]} dot={false} strokeWidth={1.5} strokeDasharray='4 3' isAnimationActive={false} />
            ))}
            <Line dataKey='Strategy' stroke={STRATEGY} dot={false} strokeWidth={2.5} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        title='Falls from the previous high'
        note='Monthly data hides falls within a month, so real dips were probably deeper than shown.'
        label={`Area chart of falls from the previous high; the worst was ${pct(result.metrics.maxDrawdown, 0)}${trough ? ` in ${monthName(trough)}` : ''}.`}
        height='h-56'
      >
        <ResponsiveContainer>
          <AreaChart data={dd} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...dateAxisProps} ticks={ticks} />
            <YAxis {...valueAxisProps} ticks={ddTicks} domain={[ddTicks[0]!, 0]} tickFormatter={pctTick} />
            <Tooltip content={<ChartTooltip format={(v) => `${v.toFixed(1)}%`} />} />
            <Area dataKey='Fall' stroke='var(--div-neg)' fill='var(--div-neg)' fillOpacity={0.18} strokeWidth={1.5} isAnimationActive={false} />
            {trough && (
              <ReferenceDot
                x={trough}
                y={result.metrics.maxDrawdown * 100}
                r={3.5}
                fill='var(--div-neg)'
                stroke='var(--card)'
                strokeWidth={2}
                label={{ value: `${pct(result.metrics.maxDrawdown, 0)} · ${monthName(trough)}`, position: 'right', fontSize: 11, fill: 'var(--foreground)' }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        title='Return per calendar year'
        note='Full years only.'
        label={`Bar chart of yearly returns for ${annual.length} full years, strategy next to US stocks.`}
        footer={
          <ChartLegend
            items={[
              { label: 'Strategy', color: STRATEGY },
              ...(bAnn.size ? [{ label: 'US stocks only', color: BENCH_COLOR.BH_US! }] : []),
            ]}
          />
        }
      >
        <ResponsiveContainer>
          <BarChart data={annual} barGap={1} barCategoryGap='20%' margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey='year' tick={axisTick} tickLine={false} axisLine={false} ticks={annXTicks} interval={0} />
            <YAxis {...valueAxisProps} ticks={annTicks} domain={[annTicks[0]!, annTicks.at(-1)!]} tickFormatter={pctTick} />
            <ReferenceLine y={0} stroke='var(--muted-foreground)' strokeOpacity={0.6} />
            <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.6 }} content={<ChartTooltip format={(v) => `${v.toFixed(1)}%`} labelFormat={String} />} />
            <Bar dataKey='Strategy' fill={STRATEGY} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Bar dataKey='US stocks only' fill={BENCH_COLOR.BH_US} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        title='What you held over time'
        label={`Stacked area chart of holdings over time: ${assetIds.map(assetLabel).join(', ')}.`}
        height='h-48'
        footer={<ChartLegend items={assetIds.map((a) => ({ label: assetLabel(a), color: assetColor(a), value: pct(result.metrics.timeInAsset[a], 0) }))} />}
      >
        <ResponsiveContainer>
          <AreaChart data={alloc} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <XAxis {...dateAxisProps} ticks={ticks} />
            <YAxis {...valueAxisProps} ticks={[0, 50, 100]} domain={[0, 100]} tickFormatter={pctTick} />
            <Tooltip content={<ChartTooltip format={(v) => `${v.toFixed(0)}%`} />} />
            {assetIds.map((a) => (
              <Area key={a} type='stepAfter' dataKey={a} name={assetLabel(a)} stackId='1' stroke='none' fill={assetColor(a)} fillOpacity={0.85} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Card className='min-w-0 gap-4'>
        <CardHeader>
          <CardTitle className='text-base'>Every month</CardTitle>
          <CardDescription className='text-xs'>Return in each month, in %. Hover a cell for the exact value.</CardDescription>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          <table className='w-full min-w-[560px] border-separate border-spacing-0.5 text-center text-[11px] tabular-nums'>
            <thead>
              <tr>
                <th />
                {MONTH_ABBR.map((m) => <th key={m} className='pb-1 font-normal text-muted-foreground'>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {heat.map(([year, row]) => (
                <tr key={year}>
                  <th className='pe-2 text-end font-normal text-muted-foreground'>{year}</th>
                  {row.map((r, m) => (
                    <td
                      key={m}
                      title={r == null ? undefined : `${MONTH_ABBR[m]} ${year}: ${pct(r)}`}
                      style={r == null ? undefined : { background: diverging((r / 0.08) * 0.75) }}
                      className='rounded-sm py-1'
                    >
                      {r == null ? '' : (r * 100).toFixed(1)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className='mt-3 flex items-center gap-2 text-xs text-muted-foreground' aria-hidden>
            <span className='tabular-nums'>−8%</span>
            <span className='h-2 w-32 rounded-full' style={{ background: `linear-gradient(90deg, ${diverging(-0.75)}, ${diverging(0)}, ${diverging(0.75)})` }} />
            <span className='tabular-nums'>+8%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
