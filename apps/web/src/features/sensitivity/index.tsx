import { lazy, Suspense, useMemo, useState } from 'react'
import { parseSweep, rollingStart, sweep, type Metrics } from 'engine'
import { data } from '@/data/source'
import { pct } from '@/lib/format'
import { glossary } from '@/lib/glossary'
import { errorMessage } from '@/lib/run'
import { listStrategies } from '@/lib/saved'
import { fragileCheck } from '@/lib/sensitivity'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell } from '@/components/page-shell'
import { Labelled, selectClass } from '@/features/lab/info-tip'
import type { Point } from './sens-chart'

const pp = (x: number) => `${(x * 100).toFixed(1)} percentage points`
const SensChart = lazy(() => import('./sens-chart'))

const PARAMS = {
  lookback: { label: 'Lookback (months)', k: 'lookback', spec: () => 'sleeves[*].lookbacks=[1]..[12]', x: (v: unknown) => String((v as number[])[0]) },
  topN: { label: 'How many to hold', k: 'topN', spec: (max: number) => `sleeves[*].topN=1..${max}`, x: String },
  buffer: { label: 'Switch buffer', k: 'buffer', spec: () => 'sleeves[*].buffer=0..0.05:0.01', x: (v: unknown) => `${(v as number) * 100}%` },
  costPct: { label: 'Trading cost', k: 'costPct', spec: () => 'settings.costPct=0..0.01:0.002', x: (v: unknown) => `${((v as number) * 100).toFixed(1)}%` },
} as const
type ParamKey = keyof typeof PARAMS

const METRICS = [
  { k: 'cagr', scale: 100, unit: '%' },
  { k: 'maxDrawdown', scale: 100, unit: '%' },
  { k: 'sharpe', scale: 1, unit: '' },
  { k: 'calmar', scale: 1, unit: '' },
  { k: 'volatility', scale: 100, unit: '%' },
  { k: 'ulcer', scale: 100, unit: '' },
] as const satisfies readonly { k: keyof Metrics; scale: number; unit: string }[]

export function Sensitivity() {
  const [options] = useState(listStrategies)
  const [id, setId] = useState(options.find((o) => o.source === 'preset')?.id ?? options[0]!.id)
  const [param, setParam] = useState<ParamKey>('lookback')
  const [mk, setMk] = useState<(typeof METRICS)[number]['k']>('cagr')
  const opt = options.find((o) => o.id === id)!
  const m = METRICS.find((x) => x.k === mk)!
  const p = PARAMS[param]

  const out = useMemo(() => {
    try {
      const maxTop = Math.min(3, ...(opt.config.sleeves.map((s) => s.universe.length)))
      const runs = sweep(opt.config, parseSweep(p.spec(maxTop)), data)
      return { runs }
    } catch (e) {
      return { error: errorMessage(e) }
    }
  }, [opt, p])
  const fragile = useMemo(() => {
    try {
      return fragileCheck(opt.config, data)
    } catch {
      return null
    }
  }, [opt])

  const points: Point[] = (out.runs ?? []).map((r) => ({ x: p.x(r.value), y: r.result.metrics[mk] == null ? null : (r.result.metrics[mk] as number) * m.scale }))
  const s0 = opt.config.sleeves[0]!
  const s = out.runs?.[0]?.result.config.sleeves[0]
  const current =
    param === 'lookback' ? (s0.lookbacks?.length === 1 ? String(s0.lookbacks[0]) : undefined)
    : param === 'topN' ? String(s?.topN ?? 1) // sweep clones the parsed config; fall back to the default
    : param === 'buffer' ? `${(s0.buffer ?? 0) * 100}%`
    : undefined

  const [horizon, setHorizon] = useState(10)
  const rolling = useMemo(() => {
    try {
      return rollingStart(opt.config, data, { horizonYears: horizon, metric: 'cagr' }).filter((w) => w.value != null)
    } catch {
      return []
    }
  }, [opt, horizon])
  const rollVals = rolling.map((w) => w.value!)
  const median = [...rollVals].sort((a, b) => a - b)[Math.floor(rollVals.length / 2)] ?? 0

  const dCagr = fragile ? Math.max(...fragile.near.map((n) => Math.abs(n.cagr - fragile.base.cagr))) : 0
  const dDd = fragile ? Math.max(...fragile.near.map((n) => Math.abs(n.maxDrawdown - fragile.base.maxDrawdown))) : 0

  return (
    <PageShell title='Robustness' lede='Would small changes to the settings, or a different start date, have changed the result a lot?'>
      <Card>
        <CardHeader>
          <CardTitle>Change one setting, see what happens</CardTitle>
          <CardDescription>If a tiny change swings the result a lot, the strategy may be tuned to the past rather than robust.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-wrap items-end gap-6'>
          <label className='space-y-1'>
            <span className='block text-sm font-medium'>Strategy</span>
            <select className={selectClass} value={id} onChange={(e) => setId(e.target.value)}>
              {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className='space-y-1'>
            <span className='block'><Labelled k={p.k} /></span>
            <select className={selectClass} value={param} onChange={(e) => setParam(e.target.value as ParamKey)} aria-label='Setting to vary'>
              {Object.entries(PARAMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className='space-y-1'>
            <span className='block'><Labelled k={mk} /></span>
            <select className={selectClass} value={mk} onChange={(e) => setMk(e.target.value as typeof mk)} aria-label='Result to look at'>
              {METRICS.map((x) => <option key={x.k} value={x.k}>{glossary[x.k]!.label}</option>)}
            </select>
          </label>
        </CardContent>
      </Card>

      {fragile && (
        <section aria-label='Verdict' className='flex gap-4 rounded-xl border bg-card p-5'>
          <span
            className='flex size-10 shrink-0 items-center justify-center rounded-full'
            style={{ background: `color-mix(in oklab, var(${fragile.fragile ? '--div-neg' : '--div-pos'}) 16%, transparent)` }}
          >
            {fragile.fragile ? <TriangleAlert className='size-5 text-[var(--div-neg)]' aria-hidden /> : <ShieldCheck className='size-5 text-[var(--div-pos)]' aria-hidden />}
          </span>
          <div>
            <div className='font-display text-lg font-semibold'>{fragile.fragile ? 'Fragile' : 'Stable'}</div>
            <p className='text-sm text-muted-foreground'>
            {fragile.fragile
              ? `Moving the lookback by one month changes yearly growth by up to ${pp(dCagr)} and the worst fall by up to ${pp(dDd)}. The result may depend on luck in the chosen window.`
              : `Moving the lookback by one month changes yearly growth by at most ${pp(dCagr)} and the worst fall by at most ${pp(dDd)}.`}
            </p>
          </div>
        </section>
      )}

      {out.error ? (
        <Alert variant='destructive'>
          <AlertDescription>{out.error}</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>{glossary[mk]!.label} for each {p.label.toLowerCase()}</CardTitle>
          </CardHeader>
          <CardContent className='h-72'>
            <Suspense fallback={<p className='text-sm text-muted-foreground'>Loading chart…</p>}>
              <SensChart points={points} current={current} unit={m.unit} name={glossary[mk]!.label} />
            </Suspense>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Does the start date matter?</CardTitle>
          <CardDescription>
            {rolling.length > 0
              ? `Depending on start year, ${horizon}-year yearly growth ranged ${pct(Math.min(...rollVals))}–${pct(Math.max(...rollVals))} (typical: ${pct(median)}).`
              : 'Not enough history for this horizon.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <label className='flex items-center gap-2 text-sm'>
            Holding period
            <select className={selectClass} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              {[5, 10, 15].map((h) => <option key={h} value={h}>{h} years</option>)}
            </select>
          </label>
          <div className='h-64'>
            <Suspense fallback={null}>
              <SensChart points={rolling.map((w) => ({ x: String(w.startYear), y: w.value! * 100 }))} unit='%' name={`${horizon}-year yearly growth`} typical={median * 100} />
            </Suspense>
          </div>
          <p className='text-xs text-muted-foreground'>Each point starts in January of that year; the dashed line is the typical value ({pct(median)}). Past results don't guarantee future ones.</p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
