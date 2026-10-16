import { lazy, Suspense, useMemo, useState } from 'react'
import { type BacktestResult } from 'engine'
import { data } from '@/data/source'
import { errorMessage } from '@/lib/run'
import { bestIndexes, compareRuns, summarySentence } from '@/lib/compare'
import { money, monthName, num, pct } from '@/lib/format'
import { betterWhen, glossary } from '@/lib/glossary'
import { listStrategies } from '@/lib/saved'
import { storageAvailable } from '@/lib/storage'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { PageShell } from '@/components/page-shell'
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
  get: (r: BacktestResult) => number | null
  fmt: (v: number, r: BacktestResult) => string
}

const metric = (k: keyof typeof betterWhen, fmt: Row['fmt']): Row => ({
  k,
  label: glossary[k]!.label,
  better: betterWhen[k],
  get: (r) => r.metrics[k] as number | null,
  fmt,
})

const rows: Row[] = [
  { k: 'totalReturn', label: 'Final value', better: 'higher', get: (r) => r.series.at(-1)!.value * START_AMOUNT, fmt: (v, r) => money(v, r.config.settings.currency) },
  metric('cagr', (v) => pct(v)),
  metric('maxDrawdown', (v) => pct(v, 0)),
  metric('maxDrawdownRecoveryMonths', (v) => `${v} months`),
  metric('volatility', (v) => pct(v)),
  metric('sharpe', (v) => num(v)),
  metric('sortino', (v) => num(v)),
  metric('calmar', (v) => num(v)),
  metric('ulcer', (v) => num(v * 100, 1)),
  metric('switchesPerYear', (v) => num(v, 1)),
  { k: 'cagr', label: 'Years behind US stocks', better: 'lower', get: (r) => r.relative?.yearsBehind ?? null, fmt: (v, r) => `${v} of ${r.relative?.fullYears}` },
]

export function MetricsTable({ results }: { results: BacktestResult[] }) {
  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            {results.map((r) => <TableHead key={r.config.name}>{r.config.name}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const vals = results.map(row.get)
            const best = bestIndexes(vals, row.better)
            return (
              <TableRow key={row.label}>
                <TableCell className='whitespace-nowrap font-medium'>
                  {row.label} <InfoTip k={row.k} />
                </TableCell>
                {results.map((r, i) => (
                  <TableCell key={r.config.name} data-best={best.has(i)} className={best.has(i) ? 'bg-green-500/15 font-semibold' : undefined}>
                    {vals[i] == null ? '–' : row.fmt(vals[i], r)}
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
  const out = useMemo(() => {
    if (picked.length < 2) return null
    try {
      return compareRuns(options.filter((o) => picked.includes(o.id)).map((o) => o.config), data)
    } catch (e) {
      return { error: errorMessage(e) }
    }
  }, [picked, options])

  return (
    <PageShell title='Compare strategies'>
      <Card>
        <CardHeader>
          <CardTitle>Pick 2 to {MAX} strategies</CardTitle>
          <CardDescription>Your saved strategies and the ready-made ones. Costs, tax and currency come from the Settings you chose on the main page.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3'>
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
          {storageAvailable() ? "You haven't saved any strategies yet. Build one on the Dashboard and press Save to compare it here." : "Saving isn't available in this browser (private mode?), so only the ready-made strategies are listed."}
        </p>
      )}
      {!out && <p className='text-sm text-muted-foreground'>Pick at least two strategies to compare.</p>}
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
          <p className='text-lg font-medium'>{summarySentence(out.results)}</p>
          <Card>
            <CardContent className='pt-6'>
              <MetricsTable results={out.results} />
              <p className='mt-2 text-xs text-muted-foreground'>Green marks the best value in each row.</p>
            </CardContent>
          </Card>
          <Suspense fallback={<p className='text-sm text-muted-foreground'>Loading charts…</p>}>
            <CompareCharts results={out.results} />
          </Suspense>
        </>
      )}
    </PageShell>
  )
}
