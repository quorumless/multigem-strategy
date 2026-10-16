import type { BacktestResult } from 'engine'
import { money, monthName, num, pct } from '@/lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card>
      <CardContent className='space-y-2 pt-6 text-base'>
        <p>
          {money(START_AMOUNT, ccy)} invested in {monthName(result.range.start)} would have become{' '}
          <strong className='text-xl'>{money(final, ccy)}</strong> by {monthName(result.range.end)}, after fees
          {result.config.settings.tax.enabled ? ' and tax' : ''}.
          {bh && (
            <>
              {' '}
              Simply buying US stocks would have given <strong>{money(last(bh), ccy)}</strong>.
            </>
          )}
        </p>
        {gross && (
          <p className='text-sm text-muted-foreground'>
            Before costs and taxes: {money(last(gross), ccy)}. Fees and tax took {money(last(gross) - final, ccy)}.
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
        <p className='text-sm'>
          <a href='/now' className='underline-offset-4 hover:underline'>What does it say today? →</a>
        </p>
        <p className='text-xs text-muted-foreground'>
          Unrealised gains are not taxed until you sell. Past results don't guarantee future ones.
        </p>
      </CardContent>
    </Card>
  )
}

function Stat({ k, label, value, sub }: { k: string; label: string; value: string; sub?: string }) {
  return (
    <Card className='gap-1 py-4'>
      <CardHeader className='px-4'>
        <CardTitle className='flex items-center gap-1 text-sm font-medium text-muted-foreground'>
          {label} <InfoTip k={k} />
        </CardTitle>
      </CardHeader>
      <CardContent className='px-4'>
        <div className='text-2xl font-bold'>{value}</div>
        {sub && <div className='text-xs text-muted-foreground'>{sub}</div>}
      </CardContent>
    </Card>
  )
}

export function MetricCards({ result }: { result: BacktestResult }) {
  const m = result.metrics
  const ccy = result.config.settings.currency
  const rel = result.relative
  return (
    <>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <Stat k='totalReturn' label='Final value' value={money(last(result), ccy)} sub={`from ${money(START_AMOUNT, ccy)}; ${pct(m.totalReturn, 0)} total`} />
        <Stat k='cagr' label='Yearly growth' value={pct(m.cagr)} />
        <Stat
          k='maxDrawdown'
          label='Worst fall'
          value={pct(m.maxDrawdown, 0)}
          sub={m.maxDrawdown === 0 ? undefined : m.maxDrawdownRecoveryMonths == null ? 'not recovered' : `${m.maxDrawdownRecoveryMonths} months to recover`}
        />
        <Stat k='maxDrawdownRecoveryMonths' label='Years behind US stocks' value={rel ? `${rel.yearsBehind} of ${rel.fullYears}` : '–'} />
      </div>
      <Collapsible>
        <CollapsibleTrigger className='text-sm font-medium underline-offset-4 hover:underline'>Advanced metrics ▾</CollapsibleTrigger>
        <CollapsibleContent className='mt-3 space-y-3'>
          <div className='grid gap-3 sm:grid-cols-3 xl:grid-cols-6'>
            <Stat k='sharpe' label='Sharpe' value={num(m.sharpe)} />
            <Stat k='sortino' label='Sortino' value={num(m.sortino)} />
            <Stat k='calmar' label='Calmar' value={num(m.calmar)} />
            <Stat k='ulcer' label='Ulcer index' value={num(m.ulcer * 100, 1)} />
            <Stat k='volatility' label='Volatility' value={pct(m.volatility)} />
            <Stat k='pctPositiveMonths' label='Winning months' value={pct(m.pctPositiveMonths, 0)} />
            <Stat k='bestYear' label='Best year' value={pct(m.bestYear?.return, 0)} sub={m.bestYear ? String(m.bestYear.year) : undefined} />
            <Stat k='worstYear' label='Worst year' value={pct(m.worstYear?.return, 0)} sub={m.worstYear ? String(m.worstYear.year) : undefined} />
            <Stat k='switchesPerYear' label='Switches / year' value={num(m.switchesPerYear, 1)} />
            <Stat k='months' label='Months tested' value={String(m.months)} />
          </div>
          <div className='text-sm'>
            <span className='font-medium'>Time in each asset</span> <InfoTip k='timeInAsset' />
            <ul className='mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground'>
              {Object.entries(m.timeInAsset)
                .sort((a, b) => b[1] - a[1])
                .map(([id, t]) => (
                  <li key={id}>
                    {assetLabel(id)} <code className='text-xs'>{id}</code> {pct(t, 0)}
                  </li>
                ))}
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
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
