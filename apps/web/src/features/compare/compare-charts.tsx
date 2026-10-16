import type { Entry } from '@/lib/compare'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { money, monthName } from '@/lib/format'
import { ChartLegend, ChartTooltip, Panel } from '@/lib/chart-parts'
import { compactMoney, dateAxisProps, gridProps, niceTicks, valueAxisProps, yearTicks } from '@/lib/chart-theme'
import { START_AMOUNT } from '@/features/lab/results'

/** `colorOf` keeps each strategy's color stable whatever else is picked (color follows entity). */
export default function CompareCharts({ results, colorOf }: { results: Entry[]; colorOf: (e: Entry) => string }) {
  const ccy = results[0]!.currency
  const byDate = results.map((r) => new Map(r.run.series.map((p) => [p.date, p])))
  const dates = results[0]!.run.series.map((p) => p.date)
  const ticks = yearTicks(dates)
  const rows = (f: (p: Entry['run']['series'][number]) => number) =>
    dates.map((date) => ({
      date,
      ...Object.fromEntries(results.map((r, j) => [r.name, byDate[j]!.has(date) ? f(byDate[j]!.get(date)!) : NaN])),
    }))
  const growth = rows((p) => p.value * START_AMOUNT)
  const falls = rows((p) => p.drawdown * 100)
  const legend = (fmt?: (e: Entry) => string) => (
    <ChartLegend items={results.map((e) => ({ label: e.name, color: colorOf(e), dashed: e.isBenchmark, value: fmt?.(e) }))} />
  )
  const lines = results.map((r) => (
    <Line
      key={r.name}
      dataKey={r.name}
      stroke={colorOf(r)}
      dot={false}
      strokeWidth={r.isBenchmark ? 1.5 : 2}
      strokeDasharray={r.isBenchmark ? '4 3' : undefined}
      isAnimationActive={false}
    />
  ))
  const maxGrowth = Math.max(...results.flatMap((e) => e.run.series.map((p) => p.value))) * START_AMOUNT
  const gTicks = niceTicks(0, maxGrowth, 4)
  const ddTicks = niceTicks(Math.min(...results.map((e) => e.run.metrics.maxDrawdown)) * 100, 0, 4)
  const span = `${monthName(dates[0]!)} to ${monthName(dates.at(-1)!)}`
  return (
    <div className='grid gap-4 xl:grid-cols-2'>
      <Panel
        title={`Growth of ${money(START_AMOUNT, ccy)}`}
        label={`Line chart of growth, ${span}: ${results.map((e) => `${e.name} ${money(e.run.series.at(-1)!.value * START_AMOUNT, ccy)}`).join(', ')}.`}
        height='h-72'
        footer={legend((e) => money(e.run.series.at(-1)!.value * START_AMOUNT, ccy))}
      >
        <ResponsiveContainer>
          <LineChart data={growth} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...dateAxisProps} ticks={ticks} />
            <YAxis {...valueAxisProps} ticks={gTicks} domain={[0, gTicks.at(-1)!]} tickFormatter={compactMoney} />
            <Tooltip content={<ChartTooltip format={(v) => money(v, ccy)} />} />
            {lines}
          </LineChart>
        </ResponsiveContainer>
      </Panel>
      <Panel
        title='Falls from the previous high'
        label={`Line chart of falls from the previous high, ${span}: ${results.map((e) => `${e.name} worst ${(e.run.metrics.maxDrawdown * 100).toFixed(0)}%`).join(', ')}.`}
        height='h-72'
        footer={legend((e) => `${(e.run.metrics.maxDrawdown * 100).toFixed(0)}%`)}
      >
        <ResponsiveContainer>
          <LineChart data={falls} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...dateAxisProps} ticks={ticks} />
            <YAxis {...valueAxisProps} ticks={ddTicks} domain={[ddTicks[0]!, 0]} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip content={<ChartTooltip format={(v) => `${v.toFixed(1)}%`} />} />
            {lines}
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  )
}
