import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from '@tanstack/react-router'
import { parseConfig } from 'engine'
import { data } from '@/data/source'
import { runBoth, type Run } from '@/lib/run'
import { presets } from '@/lib/presets'
import { readSettings, SETTINGS_KEY } from '@/lib/saved'
import { writeJson } from '@/lib/storage'
import { fromStrategy, validate, type FormValues, type SettingsValues } from '@/lib/strategy-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { Builder } from './builder'
import { MetricCards, Headline, Warnings } from './results'
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
    <>
      <Header>
        <h1 className='font-semibold'>MultiGEM Strategy Lab</h1>
        <Link to='/how-it-works' className='me-auto text-sm text-muted-foreground underline-offset-4 hover:underline'>
          New to this? How GEM works
        </Link>
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>
      <Main className='space-y-4'>
        <Builder form={form} setSettings={setSettingsState} input={input} />
        <SettingsPanel value={settings} onChange={setSettingsState} />

        {errors.length > 0 && (
          <Alert variant='destructive' role='alert'>
            <AlertDescription>
              <ul className='list-disc ps-4'>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
              {result && <p className='mt-1'>Showing the last valid result below.</p>}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>4. How it would have gone</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-wrap items-end gap-4 text-sm'>
            <label className='space-y-1'>
              <span className='block font-medium'>From</span>
              <Input type='month' min={range.first} max={range.last} {...form.register('startDate')} className='w-40' />
            </label>
            <label className='space-y-1'>
              <span className='block font-medium'>To</span>
              <Input type='month' min={range.first} max={range.last} {...form.register('endDate')} className='w-40' />
            </label>
            <span className='text-muted-foreground'>Data available {range.first} to {range.last}. Leave empty for everything.</span>
            {run && <span className='ms-auto text-xs text-muted-foreground'>Recomputed in {run.ms.toFixed(0)} ms</span>}
          </CardContent>
        </Card>

        {run?.error && (
          <Alert variant='destructive'>
            <AlertDescription>{run.error}</AlertDescription>
          </Alert>
        )}
        {result && (
          <>
            <Warnings items={result.warnings} />
            <Headline result={result} gross={run?.gross ?? null} />
            <MetricCards result={result} />
            <Suspense fallback={<p className='text-sm text-muted-foreground'>Loading charts…</p>}>
              <Charts result={result} />
            </Suspense>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Every switch, in words</CardTitle>
              </CardHeader>
              <CardContent>
                <TradeLog result={result} start={startAmount} />
              </CardContent>
            </Card>
          </>
        )}
      </Main>
    </>
  )
}
