import type { BacktestResult } from 'engine'
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown } from 'lucide-react'
import { money, monthName, num, pct } from '@/lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { assetLabel } from './assets'
import { InfoTip } from './info-tip'

export const START_AMOUNT = 10_000
const last = (r: { series: { value: number }[] }) => r.series.at(-1)!.value * START_AMOUNT

/** Plain-language summary (PRD U1). `gross` = same run without costs and tax. */
export function Headline({ result, gross }: { result: BacktestResult; gross: BacktestResult | null }) {
  const ccy = result.config.settings.currency
  const m = result.metrics
  const final = last(result)
  const bh = result.benchmarks.BH_US
  const rel = result.relative
  return (
    <section aria-label='Summary' className='space-y-4'>
      <p className='font-display text-2xl leading-snug font-medium text-balance sm:text-3xl'>
        {money(START_AMOUNT, ccy)} invested in {monthName(result.range.start)} would have become{' '}
        <strong className='font-bold whitespace-nowrap tabular-nums'>{money(final, ccy)}</strong> by {monthName(result.range.end)}, after fees
        {result.config.settings.tax.enabled ? ' and tax' : ''}.
      </p>
      <div className='space-y-1.5 text-base text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground'>
        {bh && (
          <p>
            Simply buying US stocks would have given <strong className='tabular-nums'>{money(last(bh), ccy)}</strong>.
          </p>
        )}
        {gross && (
          <p>
            Before costs and taxes: <span className='tabular-nums'>{money(last(gross), ccy)}</span>. Fees and tax took{' '}
            <span className='tabular-nums'>{money(last(gross) - final, ccy)}</span>.
          </p>
        )}
        <p>
          {m.maxDrawdown === 0 ? (
            'There was never a fall from a high point.'
          ) : (
            <>
              Worst fall: <strong>{pct(m.maxDrawdown, 0)}</strong>, from {monthName(m.maxDrawdownPeak!)} to {monthName(m.maxDrawdownTrough!)};{' '}
              {m.maxDrawdownRecoveryMonths == null
                ? 'it had not got back to the previous high by the end.'
                : `it took ${m.maxDrawdownRecoveryMonths} months after the bottom to get back to the previous high.`}
            </>
          )}
        </p>
        {rel && (
          <p>
            Did worse than simply holding US stocks in{' '}
            <strong>
              {rel.yearsBehind} of {rel.fullYears}
            </strong>{' '}
            full years.
          </p>
        )}
      </div>
      <a href='/now' className='inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline'>
        What does it say today? <ArrowRight className='size-4' />
      </a>
    </section>
  )
}

/** Standing caveats under the tiles (PRD U8). */
export function Footnote() {
  return <p className='text-xs text-muted-foreground'>Unrealised gains are not taxed until you sell. Past results don't guarantee future ones.</p>
}

/** Difference vs US stocks: arrow + sign + words, never color alone. `better` says which direction is good. */
function Delta({ d, unit, better, words }: { d: number | null; unit: string; better: 'up' | 'down'; words?: [up: string, down: string] }) {
  if (d == null || !Number.isFinite(d)) return null
  const rounded = Math.round(d * 10) / 10
  if (rounded === 0) return <span>Same as US stocks</span>
  const good = better === 'up' ? rounded > 0 : rounded < 0
  const Icon = rounded > 0 ? ArrowUp : ArrowDown
  return (
    <span>
      <Icon className={`inline size-3.5 align-[-2px] ${good ? 'text-[var(--div-pos)]' : 'text-[var(--div-neg)]'}`} aria-hidden /> {words ? '' : rounded > 0 ? '+' : '−'}
      {Math.abs(rounded)}
      {unit} <span className='text-muted-foreground'>{words ? words[rounded > 0 ? 0 : 1] : 'vs US stocks'}</span>
    </span>
  )
}

function Stat({ k, label, value, sub, delta }: { k: string; label: string; value: string; sub?: React.ReactNode; delta?: React.ReactNode }) {
  return (
    <div className='rounded-xl border bg-card p-4 text-card-foreground'>
      <div className='flex items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase'>
        {label} <InfoTip k={k} />
      </div>
      <div className='mt-1.5 font-display text-2xl font-bold tabular-nums sm:text-[1.75rem]'>{value}</div>
      {sub && <div className='mt-0.5 text-xs text-muted-foreground'>{sub}</div>}
      {delta && <div className='mt-1 text-xs font-medium tabular-nums'>{delta}</div>}
    </div>
  )
}

export function MetricCards({ result }: { result: BacktestResult }) {
  const m = result.metrics
  const ccy = result.config.settings.currency
  const rel = result.relative
  const bh = result.benchmarks.BH_US?.metrics
  // Display-only differences of two engine metrics, in percentage points.
  const pp = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : (a - b) * 100)
  return (
    <div className='grid grid-cols-2 gap-3 @4xl/results:grid-cols-4'>
      <Stat k='totalReturn' label='Final value' value={money(last(result), ccy)} sub={`from ${money(START_AMOUNT, ccy)}; ${pct(m.totalReturn, 0)} total`} />
      <Stat k='cagr' label='Yearly growth' value={pct(m.cagr)} delta={<Delta d={pp(m.cagr, bh?.cagr)} unit=' pp' better='up' />} />
      <Stat
        k='maxDrawdown'
        label='Worst fall'
        value={pct(m.maxDrawdown, 0)}
        sub={m.maxDrawdown === 0 ? undefined : m.maxDrawdownRecoveryMonths == null ? 'not recovered' : `${m.maxDrawdownRecoveryMonths} months to recover`}
        delta={<Delta d={pp(m.maxDrawdown, bh?.maxDrawdown)} unit=' pp' better='up' words={['milder than US stocks', 'deeper than US stocks']} />}
      />
      <Stat k='maxDrawdownRecoveryMonths' label='Years behind US stocks' value={rel ? `${rel.yearsBehind} of ${rel.fullYears}` : '–'} sub='full calendar years' />
    </div>
  )
}

export function AdvancedMetrics({ result }: { result: BacktestResult }) {
  const m = result.metrics
  const rows: [string, string, string][] = [
    ['sharpe', 'Sharpe', num(m.sharpe)],
    ['sortino', 'Sortino', num(m.sortino)],
    ['calmar', 'Calmar', num(m.calmar)],
    ['ulcer', 'Ulcer index', num(m.ulcer * 100, 1)],
    ['volatility', 'Volatility', pct(m.volatility)],
    ['pctPositiveMonths', 'Winning months', pct(m.pctPositiveMonths, 0)],
    ['bestYear', 'Best year', m.bestYear ? `${pct(m.bestYear.return, 0)} (${m.bestYear.year})` : '–'],
    ['worstYear', 'Worst year', m.worstYear ? `${pct(m.worstYear.return, 0)} (${m.worstYear.year})` : '–'],
    ['switchesPerYear', 'Switches / year', num(m.switchesPerYear, 1)],
    ['months', 'Months tested', String(m.months)],
  ]
  return (
    <Collapsible className='rounded-xl border bg-card'>
      <CollapsibleTrigger className='group flex w-full items-center justify-between px-6 py-4 text-start font-semibold'>
        Advanced metrics
        <ChevronDown className='size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180' aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className='CollapsibleContent'>
        <div className='space-y-4 px-6 pb-6'>
          <dl className='grid gap-x-8 sm:grid-cols-2'>
            {rows.map(([k, label, value]) => (
              <div key={k} className='flex items-center justify-between border-b py-2 text-sm'>
                <dt className='flex items-center gap-1 text-muted-foreground'>
                  {label} <InfoTip k={k} />
                </dt>
                <dd className='font-medium tabular-nums'>{value}</dd>
              </div>
            ))}
          </dl>
          <div className='text-sm'>
            <span className='font-medium'>Time in each asset</span> <InfoTip k='timeInAsset' />
            <ul className='mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground'>
              {Object.entries(m.timeInAsset)
                .sort((a, b) => b[1] - a[1])
                .map(([id, t]) => (
                  <li key={id}>
                    {assetLabel(id)} <code className='text-xs'>{id}</code> <span className='tabular-nums'>{pct(t, 0)}</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <Alert>
      <AlertDescription>
        <ul className='list-disc ps-4'>{items.map((w) => <li key={w}>{w}</li>)}</ul>
      </AlertDescription>
    </Alert>
  )
}
