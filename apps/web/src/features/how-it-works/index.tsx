import { backtest, type BacktestResult, type Trade } from 'engine'
import { data } from '@/data/source'
import { findRiskOff } from '@/lib/explainer'
import { monthName, pct } from '@/lib/format'
import { presets } from '@/lib/presets'
import { tradeSentence } from '@/lib/trade-sentence'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell } from '@/components/page-shell'
import { assetLabel } from '@/features/lab/assets'

const STEPS = [
  ['Compare', 'Once a month, look at how much each candidate (say US stocks and foreign stocks) gained over the last 12 months.'],
  ['Pick the strongest', 'Hold the one that did best. Recent winners tend to keep winning for a while.'],
  ['Check it beats cash', 'Is the winner ahead of simply holding T-bills (very safe short-term loans)? If not, stocks are not worth the risk right now.'],
  ['Otherwise hide in bonds', 'If the winner fails that check, move to a calmer safe haven, such as bonds, until stocks look better again.'],
] as const

function Diagram() {
  return (
    <ol className='grid gap-3 md:grid-cols-4'>
      {STEPS.map(([title, text], i) => (
        <li key={title} className='relative rounded-lg border p-3'>
          <div className='mb-2 flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground'>{i + 1}</div>
          <div className='font-medium'>{title}</div>
          <p className='mt-1 text-sm text-muted-foreground'>{text}</p>
          {i < STEPS.length - 1 && <span aria-hidden className='absolute -bottom-3.5 left-1/2 text-muted-foreground md:-right-3.5 md:bottom-auto md:left-auto md:top-1/2'><span className='md:hidden'>↓</span><span className='hidden md:inline'>→</span></span>}
        </li>
      ))}
    </ol>
  )
}

function Signal({ title, trade, result }: { title: string; trade: Trade; result: BacktestResult }) {
  const s = trade.signals[0]!
  const sleeve = result.config.sleeves[s.sleeve]!
  return (
    <div className='rounded-lg border p-3'>
      <div className='font-medium'>{title}: {monthName(trade.date)}</div>
      <table className='mt-2 w-full text-sm'>
        <tbody>
          {sleeve.universe.map((a) => (
            <tr key={a}>
              <td>{assetLabel(a)}</td>
              <td className='text-end'>{pct(s.scores[a])} over {s.lookback ?? 12} months</td>
            </tr>
          ))}
          {s.hurdle != null && (
            <tr className='font-medium'>
              <td>T-bills (the bar to beat)</td>
              <td className='text-end'>{pct(s.hurdle)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className='mt-2 text-sm text-muted-foreground'>{tradeSentence(trade, result.config, assetLabel)}</p>
    </div>
  )
}

export function Walkthrough() {
  const result = backtest(presets.find((p) => p.config.name === 'Classic GEM')?.config ?? presets[0]!.config, data)
  const { out, back } = findRiskOff(result.trades, '2007-06', '2009-12')
  if (!out) return <p className='text-sm text-muted-foreground'>This strategy did not move to bonds around 2008 in the available data.</p>
  return (
    <div className='grid gap-3 md:grid-cols-2'>
      <Signal title='Moving out' trade={out} result={result} />
      {back && <Signal title='Moving back in' trade={back} result={result} />}
    </div>
  )
}

export function HowItWorks() {
  return (
    <PageShell title='How GEM works'>
      <Card>
        <CardHeader>
          <CardTitle>GEM in four steps</CardTitle>
        </CardHeader>
        <CardContent className='space-y-2'>
          <p className='text-sm text-muted-foreground'>GEM (Global Equities Momentum) is a simple rulebook for deciding what to hold each month.</p>
          <Diagram />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>A real example: the 2008 crash</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <p className='text-sm text-muted-foreground'>These numbers come straight from the Classic GEM backtest on the app's data.</p>
          <Walkthrough />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Keep in mind</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className='list-disc space-y-1 ps-5 text-sm'>
            <li>Past results don't guarantee future ones.</li>
            <li>Monthly data hides falls within a month, so real dips were probably deeper than shown.</li>
            <li>Data for foreign stocks starts in 1996–97 (the earliest reliable free MSCI history), so strategies using them can't be tested before that.</li>
          </ul>
        </CardContent>
      </Card>
    </PageShell>
  )
}
