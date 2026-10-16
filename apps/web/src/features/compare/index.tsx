import { lazy, Suspense, useMemo, useState } from 'react'
import { Check, Info } from 'lucide-react'
import { data } from '@/data/source'
import { errorMessage } from '@/lib/run'
import { bestIndexes, compareRuns, summarySentence, toEntries, type Entry } from '@/lib/compare'
import { money, monthName, num, pct } from '@/lib/format'
import { betterWhen, glossary } from '@/lib/glossary'
import { listStrategies } from '@/lib/saved'
import { storageAvailable } from '@/lib/storage'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { PageShell } from '@/components/page-shell'
import { BENCH_COLOR, CAT } from '@/lib/chart-colors'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { InfoTip } from '@/features/lab/info-tip'
import { START_AMOUNT } from '@/features/lab/results'

const CompareCharts = lazy(() => import('./compare-charts'))
const MAX = 5

interface Row {
  label: string
  /** Glossary key for the ⓘ tooltip. */
  k: string
  better: 'higher' | 'lower'
  get: (r: Entry) => number | null
  fmt: (v: number, r: Entry) => string
}

const metric = (k: keyof typeof betterWhen, fmt: Row['fmt']): Row => ({
  k,
  label: glossary[k]!.label,
  better: betterWhen[k],
  get: (r) => r.run.metrics[k] as number | null,
  fmt,
})

const rows: Row[] = [
  { k: 'totalReturn', label: 'Final value', better: 'higher', get: (r) => r.run.series.at(-1)!.value * START_AMOUNT, fmt: (v, r) => money(v, r.currency) },
  metric('cagr', (v) => pct(v)),
  metric('maxDrawdown', (v) => pct(v, 0)),
  metric('maxDrawdownRecoveryMonths', (v) => `${v} months`),
  metric('volatility', (v) => pct(v)),
  metric('sharpe', (v) => num(v)),
  metric('sortino', (v) => num(v)),
  metric('calmar', (v) => num(v)),
  metric('ulcer', (v) => num(v * 100, 1)),
  metric('switchesPerYear', (v) => num(v, 1)),
  { k: 'cagr', label: 'Years behind US stocks', better: 'lower', get: (r) => r.behind?.yearsBehind ?? null, fmt: (v, r) => `${v} of ${r.behind?.fullYears}` },
]

export function MetricsTable({ results }: { results: Entry[] }) {
  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            {results.map((r) => (
              <TableHead key={r.name}>
                {r.name}
                {r.isBenchmark && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type='button' aria-label='About the S&P 500 benchmark' className='ms-1 inline-flex align-middle text-muted-foreground hover:text-foreground'>
                        <Info className='size-3.5' />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className='max-w-xs'>
                      Simply buying US stocks and never selling: same currency and fees as your strategies. It pays no tax here because nothing is sold, but the tax is only postponed: you would owe it when you eventually sell, so its after-tax result is flattered compared with a strategy that trades.
                    </TooltipContent>
                  </Tooltip>
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const vals = results.map(row.get)
            const best = bestIndexes(vals, row.better)
            return (
              <TableRow key={row.label}>
                <TableCell className='sticky start-0 z-10 bg-card font-medium whitespace-nowrap'>
                  {row.label} <InfoTip k={row.k} />
                </TableCell>
                {results.map((r, i) => (
                  <TableCell
                    key={r.name}
                    data-best={best.has(i)}
                    className={best.has(i) ? 'bg-[color-mix(in_oklab,var(--div-pos)_14%,transparent)] font-semibold tabular-nums' : 'tabular-nums'}
                  >
                    {vals[i] == null ? '–' : row.fmt(vals[i], r)}
                    {best.has(i) && (
                      <>
                        <Check className='ms-1 inline size-3.5 align-[-2px] text-[var(--div-pos)]' aria-hidden />
                        <span className='sr-only'> (best)</span>
                      </>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export function Compare() {
  const [options] = useState(listStrategies)
  const [picked, setPicked] = useState<string[]>(() => options.filter((o) => o.source === 'preset').slice(0, 2).map((o) => o.id))
  const [withSp, setWithSp] = useState(true)
  const out = useMemo(() => {
    if (picked.length < (withSp ? 1 : 2)) return null
    try {
      const r = compareRuns(options.filter((o) => picked.includes(o.id)).map((o) => o.config), data)
      return { ...r, entries: toEntries(r.results, withSp) }
    } catch (e) {
      return { error: errorMessage(e) }
    }
  }, [picked, options, withSp])

  return (
    <PageShell title='Compare strategies' lede='Put strategies side by side over the same period, with the same costs and tax.'>
      <Card>
        <CardHeader>
          <CardTitle>Pick up to {MAX} strategies</CardTitle>
          <CardDescription>Your saved strategies and the ready-made ones. Costs, tax and currency come from the Settings you chose on the main page.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3'>
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox checked={withSp} onCheckedChange={(c) => setWithSp(c === true)} />
            S&P 500 (buy & hold) <span className='text-xs text-muted-foreground'>(for comparison)</span>
          </label>
          {options.map((o) => (
            <label key={o.id} className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={picked.includes(o.id)}
                disabled={!picked.includes(o.id) && picked.length >= MAX}
                onCheckedChange={(c) => setPicked(c ? [...picked, o.id] : picked.filter((x) => x !== o.id))}
              />
              {o.name} <span className='text-xs text-muted-foreground'>{o.source === 'saved' ? '(saved)' : '(ready-made)'}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      {!options.some((o) => o.source === 'saved') && (
        <p className='text-sm text-muted-foreground'>
          {storageAvailable() ? "You haven't saved any strategies yet. Build one on the Backtest page and press Save to compare it here." : "Saving isn't available in this browser (private mode?), so only the ready-made strategies are listed."}
        </p>
      )}
      {!out && <p className='text-sm text-muted-foreground'>Pick a strategy and the S&P 500, or at least two strategies, to compare.</p>}
      {out && 'error' in out && (
        <Alert variant='destructive'>
          <AlertDescription>{out.error}</AlertDescription>
        </Alert>
      )}
      {out && 'results' in out && (
        <>
          <Alert>
            <AlertDescription>
              {out.trimmed ? 'The strategies have different amounts of history, so all of them are shown over the period they share: ' : 'All strategies cover '}
              {monthName(out.range.start)} to {monthName(out.range.end)}.
            </AlertDescription>
          </Alert>
          <p className='font-display text-xl font-semibold text-balance sm:text-2xl'>{summarySentence(out.entries)}</p>
          <Card>
            <CardContent>
              <MetricsTable results={out.entries} />
              <p className='mt-2 text-xs text-muted-foreground'>A tick and shading mark the best value in each row.</p>
            </CardContent>
          </Card>
          <Suspense fallback={<p className='text-sm text-muted-foreground'>Loading charts…</p>}>
            <CompareCharts results={out.entries} colorOf={(e) => (e.isBenchmark ? BENCH_COLOR.BH_US! : CAT[Math.max(0, options.findIndex((o) => o.name === e.name)) % CAT.length]!)} />
          </Suspense>
        </>
      )}
    </PageShell>
  )
}
