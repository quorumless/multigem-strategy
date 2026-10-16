import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from '@tanstack/react-router'
import { ArrowDown } from 'lucide-react'
import { parseConfig } from 'engine'
import { data } from '@/data/source'
import { monthName } from '@/lib/format'
import { runBoth, type Run } from '@/lib/run'
import { presets } from '@/lib/presets'
import { readSettings, SETTINGS_KEY } from '@/lib/saved'
import { writeJson } from '@/lib/storage'
import { fromStrategy, validate, type FormValues, type SettingsValues } from '@/lib/strategy-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageShell } from '@/components/page-shell'
import { Builder } from './builder'
import { AdvancedMetrics, Footnote, Headline, MetricCards, Warnings } from './results'
import { SettingsPanel } from './settings-panel'
import { TradeLog } from './trade-log'

// Recharts is heavy: load it only when results are shown
const Charts = lazy(() => import('./charts'))

export function Lab() {
  const form = useForm({ defaultValues: fromStrategy(parseConfig(presets[0]!.config)).form })
  const [settings, setSettingsState] = useState<SettingsValues>(readSettings)
  useEffect(() => {
    writeJson(SETTINGS_KEY, settings)
  }, [settings])

  const values = useWatch({ control: form.control }) as FormValues
  const { input, errors } = validate(values, settings)
  // Only valid configs are run; while the form is invalid the last good result stays on screen.
  const [shown, setShown] = useState<{ key: string; run: Run }>()
  const key = errors.length ? null : JSON.stringify(input)
  if (key && key !== shown?.key) setShown({ key, run: runBoth(JSON.parse(key)) })
  const run = shown?.run
  const result = run?.result
  const startAmount = 10_000

  const range = useMemo(() => ({ first: data.dates[0]!, last: data.dates.at(-1)! }), [])

  return (
    <PageShell
      title='Backtest'
      lede={
        <>
          See how a GEM-style strategy would have done on 35+ years of real data.{' '}
          <Link to='/how-it-works' className='font-medium whitespace-nowrap text-primary underline underline-offset-4'>
            New to this? How GEM works
          </Link>
        </>
      }
    >
      <a
        href='#results'
        className='inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium @4xl/content:hidden'
      >
        See results <ArrowDown className='size-4' aria-hidden />
      </a>
      <div className='grid items-start gap-6 @4xl/content:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] @6xl/content:grid-cols-[400px_minmax(0,1fr)]'>
        <aside
          aria-label='Strategy settings'
          className='@container/builder space-y-5 rounded-xl border bg-card p-5 text-card-foreground @4xl/content:sticky @4xl/content:top-4 @4xl/content:max-h-[calc(100svh-2rem)] @4xl/content:overflow-y-auto'
        >
          <Builder form={form} setSettings={setSettingsState} input={input} />
          <SettingsPanel value={settings} onChange={setSettingsState} />
          <section className='space-y-3 border-t pt-5'>
            <div>
              <h2 className='font-semibold'>Period</h2>
              <p className='text-sm text-muted-foreground'>
                Data available {monthName(range.first)} to {monthName(range.last)}. Leave empty for everything.
              </p>
            </div>
            <div className='flex flex-wrap gap-3 text-sm'>
              <label className='space-y-1'>
                <span className='block font-medium'>From</span>
                <Input type='month' min={range.first} max={range.last} {...form.register('startDate')} className='w-40' />
              </label>
              <label className='space-y-1'>
                <span className='block font-medium'>To</span>
                <Input type='month' min={range.first} max={range.last} {...form.register('endDate')} className='w-40' />
              </label>
            </div>
          </section>
        </aside>

        <div id='results' className='@container/results min-w-0 scroll-mt-4 space-y-6'>
          {errors.length > 0 && (
            <Alert variant='destructive' role='alert'>
              <AlertDescription>
                <ul className='list-disc ps-4'>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
                {result && <p className='mt-1'>Showing the last valid result below.</p>}
              </AlertDescription>
            </Alert>
          )}
          {run?.error && (
            <Alert variant='destructive'>
              <AlertDescription>{run.error}</AlertDescription>
            </Alert>
          )}
          {result && (
            <>
              <Warnings items={result.warnings} />
              <Headline result={result} gross={run?.gross ?? null} />
              <div className='space-y-2'>
                <MetricCards result={result} />
                <Footnote />
              </div>
              <Suspense fallback={<p className='text-sm text-muted-foreground'>Loading charts…</p>}>
                <Charts result={result} />
              </Suspense>
              <Card className='gap-4'>
                <CardHeader>
                  <CardTitle className='text-base'>Every switch, in words</CardTitle>
                </CardHeader>
                <CardContent>
                  <TradeLog result={result} start={startAmount} />
                </CardContent>
              </Card>
              <AdvancedMetrics result={result} />
            </>
          )}
        </div>
      </div>
    </PageShell>
  )
}
