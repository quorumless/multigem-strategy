import { lazy, Suspense, useMemo, useState } from 'react'
import { correlationMatrix, rollingCorrelation } from 'engine'
import { assets as rawAssets, data, type AssetInfo as BaseInfo } from '@/data/source'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { diverging } from '@/lib/chart-colors'
import { num } from '@/lib/format'

const GrowthChart = lazy(() => import('./charts').then((m) => ({ default: m.GrowthChart })))
const RollingChart = lazy(() => import('./charts').then((m) => ({ default: m.RollingChart })))

/** Plain-language "what this is" per asset ID. */
const WHAT: Record<string, string> = {
  US: 'The 500 biggest US companies, dividends reinvested. The classic "stocks" holding.',
  DEVXUS: 'Large and mid-size companies in rich countries outside the US (Europe, Japan, Canada, Australia…).',
  EM: 'Companies in developing countries such as China, India and Brazil. Higher growth potential, bigger swings.',
  ACWXUS: 'Everything outside the US: developed plus emerging markets in one fund.',
  AGG: 'A broad basket of US government and corporate bonds. A calmer holding than stocks.',
  LTT: 'US government bonds maturing in 20+ years. Rise when interest rates fall, fall hard when they rise.',
  TBILL: 'Very short US government loans. About as close to "cash" as it gets; the hurdle stocks must beat.',
  GOLD: 'Physical gold. Pays no income but often holds up when stocks fall.',
  BCOM: 'A broad basket of commodity futures (energy, metals, farm goods). Data starts later than the others.',
}

const ROLE: Record<string, string> = {
  equity: 'Stocks',
  'safe haven': 'Safe haven',
  'diversifier / safe haven': 'Diversifier / safe haven',
  diversifier: 'Diversifier',
}
const roleLabel = (r: string) => (r.startsWith('cash') ? 'Cash' : r.startsWith('equity') ? 'Stocks' : (ROLE[r] ?? r))

// assets.json also carries segments; AssetInfo (shared) only types what the lab needs.
type AssetInfo = BaseInfo & { segments: { source: string; from: string; to: string }[] }
const assets = rawAssets as AssetInfo[]
const assetsOnly = assets.filter((a) => a.role !== 'fx')
const fx = assets.filter((a) => a.role === 'fx')

/** Index of an asset's own series, 10,000 at its first month (display scaling only). */
function growthRows(id: string) {
  const col = data.series[id]
  if (!col) return []
  const first = col.findIndex((v) => v != null)
  if (first < 0) return []
  const base = col[first]!
  return data.dates.flatMap((date, i) => (col[i] != null ? [{ date, value: (col[i]! / base) * 10_000 }] : []))
}

/** Background for a correlation cell: teal = together, orange-red = opposite. */
const cellColor = (v: number | null) => (v == null ? undefined : diverging(v * 0.8))

export function CorrelationGrid({ ids, from }: { ids: string[]; from?: string }) {
  const { matrix, months } = useMemo(() => correlationMatrix(data, ids, { from }), [ids, from])
  return (
    <>
      <div className='overflow-x-auto'>
        <table className='border-collapse' aria-label='Correlation matrix'>
          <thead>
            <tr>
              <th />
              {ids.map((id) => <th key={id} scope='col' className='px-0 pb-1 text-[8px] font-medium sm:px-1 sm:text-xs'>{id}</th>)}
            </tr>
          </thead>
          <tbody>
            {ids.map((id, i) => (
              <tr key={id}>
                <th scope='row' className='pe-1 text-start text-[9px] font-medium sm:text-xs'>{id}</th>
                {matrix[i]!.map((v, j) => (
                  <td key={ids[j]} data-testid='corr-cell' className='size-6 text-center text-[9px] tabular-nums sm:size-11 sm:text-xs' style={{ background: cellColor(v) }}>{num(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className='mt-2 text-xs text-muted-foreground'>Based on {months} months where all of these have data.</p>
    </>
  )
}

function AssetCard({ a, selected, onSelect }: { a: AssetInfo; selected: boolean; onSelect: () => void }) {
  return (
    <button type='button' onClick={onSelect} aria-pressed={selected} className={`flex min-w-0 flex-col justify-start break-words rounded-xl border p-4 text-start text-sm transition-colors hover:bg-accent ${selected ? 'border-primary bg-accent' : ''}`}>
      <div className='flex flex-wrap items-baseline justify-between gap-x-2'>
        <span className='font-semibold'>{a.name}</span>
        <span className='text-xs text-muted-foreground'>{a.id} · {roleLabel(a.role)}</span>
      </div>
      <p className='mt-1'>{WHAT[a.id]}</p>
      <dl className='mt-2 space-y-0.5 text-xs text-muted-foreground'>
        <div>Investable example: {a.ucits[0]?.name ?? '–'}</div>
        {a.ucits[0]?.note && <div className='text-amber-700 dark:text-amber-300'>Note: {a.ucits[0].note}</div>}
        <div>Data starts: {a.firstDate ?? '–'}</div>
        <div className='break-words'>Sources: {a.segments.map((s) => `${s.source} ${s.from}→${s.to}`).join(' · ')}</div>
      </dl>
    </button>
  )
}

export function AssetsPage() {
  return (
    <>
      <Header>
        <h1 className='me-auto font-semibold'>Assets & data</h1>
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>
      <AssetsContent />
    </>
  )
}

export function AssetsContent() {
  const [sel, setSel] = useState(assetsOnly[0]!.id)
  const [log, setLog] = useState(true)
  // BCOM starts in 2002 and would cut every other pair's history, so the grid leaves it out.
  const gridIds = useMemo(() => assetsOnly.filter((a) => a.id !== 'BCOM').map((a) => a.id), [])
  const [pair, setPair] = useState<[string, string]>(['US', 'AGG'])
  const rows = useMemo(() => growthRows(sel), [sel])
  const rolling = useMemo(() => rollingCorrelation(data, pair[0], pair[1], 36), [pair])
  const selName = assetsOnly.find((a) => a.id === sel)?.name
  const picker = (i: 0 | 1) => (
    <select aria-label={i ? 'Second asset' : 'First asset'} className='w-full rounded-md border bg-background px-2 py-1 text-sm sm:w-auto' value={pair[i]} onChange={(e) => setPair((p) => (i ? [p[0], e.target.value] : [e.target.value, p[1]]))}>
      {assetsOnly.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  )
  return (
    <>
      <Main className='space-y-4'>
        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {assetsOnly.map((a) => <AssetCard key={a.id} a={a} selected={a.id === sel} onSelect={() => setSel(a.id)} />)}
        </div>
        <Card className='min-w-0'>
          <CardHeader className='flex-row items-center justify-between'>
            <CardTitle className='text-base'>Growth of 10,000: {selName}</CardTitle>
            <label className='flex items-center gap-2 text-xs'><Switch checked={log} onCheckedChange={setLog} /> Log scale</label>
          </CardHeader>
          <CardContent>
            <div className='h-64'><Suspense fallback={null}><GrowthChart rows={rows} log={log} /></Suspense></div>
            <p className='mt-2 text-xs text-muted-foreground'>Total return in US dollars, starting at 10,000 in the first month of data.</p>
          </CardContent>
        </Card>
        <Card className='min-w-0'>
          <CardHeader><CardTitle className='text-base'>How assets move together</CardTitle></CardHeader>
          <CardContent>
            <p className='mb-3 text-sm'>1 = move together, 0 = unrelated, negative = tend to move opposite. Low-correlated assets help diversify. Commodities are left out here (their data starts in 2002); pick them below.</p>
            <CorrelationGrid ids={gridIds} />
          </CardContent>
        </Card>
        <Card className='min-w-0'>
          <CardHeader><CardTitle className='flex min-w-0 flex-wrap items-center gap-2 text-base'>Correlation over time: {picker(0)} vs {picker(1)}</CardTitle></CardHeader>
          <CardContent>
            <div className='h-64'><Suspense fallback={null}><RollingChart rows={rolling} /></Suspense></div>
            <p className='mt-2 text-xs text-muted-foreground'>Each point looks at the previous 36 months. It is not constant: assets that diversify in calm times can fall together in crises.</p>
          </CardContent>
        </Card>
        {fx.length > 0 && (
          <Card>
            <CardHeader><CardTitle className='text-base'>Currencies</CardTitle></CardHeader>
            <CardContent className='text-sm text-muted-foreground'>
              Exchange rates are used only to show results in another currency; signals always use USD. {fx.map((f) => `${f.name}: from ${f.firstDate}`).join('; ')}.
            </CardContent>
          </Card>
        )}
      </Main>
    </>
  )
}
