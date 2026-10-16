import { useState } from 'react'
import { parseConfig, type StrategyInput } from 'engine'
import { Link } from '@tanstack/react-router'
import { data, IS_SYNTHETIC } from '@/data/source'
import { addMonths, currentSignal, heldAssets, longMonth, monthsOld, type CurrentSignal } from '@/lib/now'
import { errorMessage } from '@/lib/run'
import { listStrategies } from '@/lib/saved'
import { pct } from '@/lib/format'
import { tradeSentence } from '@/lib/trade-sentence'
import { Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageShell } from '@/components/page-shell'
import { assetExample, assetLabel } from '@/features/lab/assets'
import { selectClass } from '@/features/lab/info-tip'
import { MomentumBars } from './momentum-bars'

const label = (a: string) => (assetExample(a) ? `${assetLabel(a)} (e.g. ${assetExample(a)})` : assetLabel(a))
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] ?? ''))

export function StaleWarning({ asOf, today }: { asOf: string; today?: Date }) {
  const n = monthsOld(asOf, today)
  if (n === 0) return null
  return (
    <Alert variant='destructive'>
      <AlertDescription>
        Data is {n} month{n > 1 ? 's' : ''} old; refresh the data before acting (see README).
      </AlertDescription>
    </Alert>
  )
}

export function NowView({ name, input, signal, today }: { name: string; input: StrategyInput; signal: CurrentSignal; today?: Date }) {
  const cfg = parseConfig(input)
  const held = heldAssets(signal.weights)
  const ids = new Set([...Object.keys(signal.weights), ...Object.keys(signal.previous)])
  const diff = (sign: 1 | -1) => [...ids].filter((a) => sign * ((signal.weights[a] ?? 0) - (signal.previous[a] ?? 0)) > 0.005).map(label)
  const sells = diff(-1)
  const buys = diff(1)
  const trade = { date: signal.asOf, from: signal.previous, to: signal.weights, turnover: 0, cost: 0, tax: 0, signals: signal.signals }
  return (
    <>
      <StaleWarning asOf={signal.asOf} today={today} />
      <section aria-label='This month' className='grid gap-6 rounded-xl border bg-card p-6 text-card-foreground @4xl/content:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'>
        <div className='space-y-4'>
          <div className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>Hold this month</div>
          <ul className='space-y-3'>
            {held.map(([a, w]) => (
              <li key={a}>
                <div className='font-display text-3xl leading-tight font-bold'>
                  {w < 0.995 && <span className='tabular-nums'>{pct(w, 0)} </span>}
                  {assetLabel(a)}
                </div>
                {assetExample(a) && <div className='mt-1 text-sm text-muted-foreground'>e.g. {assetExample(a)}</div>}
              </li>
            ))}
          </ul>
          <div className='rounded-lg bg-muted px-3 py-2 text-sm'>
            {!signal.isRebalanceMonth ? (
              <p>This is not a rebalance month; keep your current holdings.</p>
            ) : signal.changed ? (
              <p>
                <strong>Change:</strong> sell {list(sells) || 'nothing'}, buy {list(buys) || 'nothing'}.
              </p>
            ) : (
              <p>No change from last month.</p>
            )}
          </div>
          <p className='text-sm text-muted-foreground'>
            Based on data up to end of {longMonth(signal.asOf)}, <strong className='text-foreground'>{name}</strong> says: hold{' '}
            {list(held.map(([a, w]) => `${pct(w, 0)} ${assetLabel(a)}`))}.
          </p>
          {cfg.settings.executionLag === 1 && signal.changed && (
            <p className='text-sm text-muted-foreground'>Your settings trade one month late: make this trade at the end of {longMonth(addMonths(signal.tradeMonth, -1))}.</p>
          )}
        </div>

        <div className='space-y-6 @4xl/content:border-s @4xl/content:ps-6'>
          {signal.signals.map((s, i) => (
            <div key={i} className='space-y-3'>
              <h2 className='font-semibold'>
                Momentum scores{cfg.sleeves.length > 1 ? ` — ${cfg.sleeves[s.sleeve]?.id}` : ''}
                {s.lookback ? `, last ${s.lookback} months` : ''}
              </h2>
              <MomentumBars scores={s.scores} hurdle={s.hurdle} picked={s.picked} />
            </div>
          ))}
          {signal.signals.length > 0 && <p className='text-xs text-muted-foreground'>{tradeSentence(trade, cfg, assetLabel).replace(': rebalanced', ': no switch needed')}</p>}
        </div>
      </section>
    </>
  )
}

export function Now() {
  const [options] = useState(listStrategies)
  const [id, setId] = useState(options.find((o) => o.source === 'preset')?.id ?? options[0]!.id)
  const opt = options.find((o) => o.id === id)!
  let view: { signal: CurrentSignal } | { error: string }
  try {
    view = { signal: currentSignal(opt.config, data) }
  } catch (e) {
    view = { error: errorMessage(e) }
  }
  const body = IS_SYNTHETIC ? (
    <p className='text-lg font-medium'>Not meaningful on sample data.</p>
  ) : 'error' in view ? (
      <Alert variant='destructive'>
        <AlertDescription>{view.error}</AlertDescription>
      </Alert>
    ) : (
      <NowView name={opt.name} input={opt.config} signal={view.signal} />
    )
  return (
    <PageShell title='What to hold now' lede='What the strategy would hold after the last complete month of data.'>
      <label className='flex flex-wrap items-center gap-2 text-sm font-medium'>
        Strategy
        <select className={selectClass} value={id} onChange={(e) => setId(e.target.value)}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <Link to='/' className='ms-auto text-xs font-normal text-muted-foreground underline-offset-4 hover:underline'>Edit on the Backtest page</Link>
      </label>
      {body}
      <p className='flex gap-2 border-t pt-4 text-xs text-muted-foreground'>
        <Info className='mt-px size-3.5 shrink-0' aria-hidden />
        <span>
          <strong className='font-medium text-foreground'>Educational tool, not investment advice.</strong> Past results don't guarantee future
          ones. Check current prices, fees and taxes with your broker before trading.
        </span>
      </p>
    </PageShell>
  )
}
