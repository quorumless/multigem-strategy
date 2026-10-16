import { backtest, type BacktestResult, type Trade } from 'engine'
import { data } from '@/data/source'
import { findRiskOff } from '@/lib/explainer'
import { monthName } from '@/lib/format'
import { presets } from '@/lib/presets'
import { tradeSentence } from '@/lib/trade-sentence'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell } from '@/components/page-shell'
import { assetLabel } from '@/features/lab/assets'
import { MomentumBars } from '@/features/now/momentum-bars'
import { Info } from 'lucide-react'

const STEPS = [
  ['Compare', 'Once a month, look at how much each candidate (say US stocks and foreign stocks) gained over the last 12 months.'],
  ['Pick the strongest', 'Hold the one that did best. Recent winners tend to keep winning for a while.'],
  ['Check it beats cash', 'Is the winner ahead of simply holding T-bills (very safe short-term loans)? If not, stocks are not worth the risk right now.'],
  ['Otherwise hide in bonds', 'If the winner fails that check, move to a calmer safe haven, such as bonds, until stocks look better again.'],
] as const

function Diagram() {
  return (
    <ol className='grid gap-6 md:grid-cols-4 md:gap-4'>
      {STEPS.map(([title, text], i) => (
        <li key={title} className='relative ps-11 md:ps-0 md:pt-11'>
          {/* connector to the next step: vertical on mobile, horizontal from md */}
          {i < STEPS.length - 1 && (
            <span aria-hidden className='absolute start-[15px] top-9 -bottom-6 w-px bg-border md:start-10 md:-end-4 md:top-4 md:bottom-auto md:h-px md:w-auto' />
          )}
          <span className='absolute start-0 top-0 flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums'>{i + 1}</span>
          <div className='font-semibold'>{title}</div>
          <p className='mt-1 text-sm text-muted-foreground'>{text}</p>
        </li>
      ))}
    </ol>
  )
}

function Signal({ title, trade, result }: { title: string; trade: Trade; result: BacktestResult }) {
  const s = trade.signals[0]!
  const sleeve = result.config.sleeves[s.sleeve]!
  const scores = Object.fromEntries(sleeve.universe.map((a) => [a, s.scores[a]!]))
  return (
    <div className='space-y-3 rounded-xl border bg-card p-5'>
      <div>
        <div className='font-display text-lg font-semibold'>{title}: {monthName(trade.date)}</div>
        <div className='text-xs text-muted-foreground'>Momentum over the last {s.lookback ?? 12} months</div>
      </div>
      <MomentumBars scores={scores} hurdle={s.hurdle} picked={s.picked} />
      <p className='text-sm text-muted-foreground'>{tradeSentence(trade, result.config, assetLabel)}</p>
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
    <PageShell title='How GEM works' lede='GEM (Global Equities Momentum) is a simple rulebook for deciding what to hold each month.'>
      <Card>
        <CardHeader>
          <CardTitle>GEM in four steps</CardTitle>
        </CardHeader>
        <CardContent>
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
      <aside className='flex gap-3 rounded-xl bg-muted p-5 text-sm'>
        <Info className='mt-0.5 size-4 shrink-0 text-muted-foreground' aria-hidden />
        <div>
          <h2 className='font-semibold'>Keep in mind</h2>
          <ul className='mt-1 list-disc space-y-1 ps-4 text-muted-foreground'>
            <li>Past results don't guarantee future ones.</li>
            <li>Monthly data hides falls within a month, so real dips were probably deeper than shown.</li>
            <li>Data for foreign stocks starts in 1996–97 (the earliest reliable free MSCI history), so strategies using them can't be tested before that.</li>
          </ul>
        </div>
      </aside>
    </PageShell>
  )
}
