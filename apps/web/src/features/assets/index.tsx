import { lazy, Suspense, useMemo, useState } from 'react'
import { correlationMatrix, rollingCorrelation } from 'engine'
import { assets as rawAssets, data, type AssetInfo as BaseInfo } from '@/data/source'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageShell } from '@/components/page-shell'
import { ScaleToggle } from '@/lib/chart-parts'
import { selectClass } from '@/features/lab/info-tip'
import { TriangleAlert } from 'lucide-react'
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
              <th className='sticky start-0 bg-card' />
              {ids.map((id) => <th key={id} scope='col' className='px-1 pb-1 text-[11px] font-medium text-muted-foreground sm:text-xs'>{id}</th>)}
            </tr>
          </thead>
          <tbody>
            {ids.map((id, i) => (
              <tr key={id}>
                <th scope='row' className='sticky start-0 bg-card pe-2 text-start text-[11px] font-medium text-muted-foreground sm:text-xs'>{id}</th>
                {matrix[i]!.map((v, j) => (
                  <td key={ids[j]} data-testid='corr-cell' className='h-9 min-w-10 border border-card text-center text-[11px] tabular-nums sm:h-11 sm:min-w-12 sm:text-xs' style={{ background: cellColor(v) }}>{num(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground'>
        <span className='flex items-center gap-2' aria-hidden>
          <span>−1 opposite</span>
          <span className='h-2 w-28 rounded-full' style={{ background: `linear-gradient(90deg, ${cellColor(-1)}, ${cellColor(0)}, ${cellColor(1)})` }} />
          <span>+1 together</span>
        </span>
        <span>Based on {months} months where all of these have data.</span>
      </div>
    </>
  )
}

function AssetCard({ a, selected, onSelect }: { a: AssetInfo; selected: boolean; onSelect: () => void }) {
  const ex = a.ucits[0]
  return (
    <div className={`relative flex min-w-0 flex-col rounded-xl border bg-card p-4 text-sm break-words transition-colors hover:border-primary/60 ${selected ? 'border-primary ring-1 ring-primary' : ''}`}>
      <div className='flex items-start justify-between gap-2'>
        {/* Stretched button: the whole card selects the asset for the chart below. */}
        <button type='button' onClick={onSelect} aria-pressed={selected} className='text-start font-semibold after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50'>
          {a.name}
        </button>
        <Badge variant='secondary' className='shrink-0'>{roleLabel(a.role)}</Badge>
      </div>
      <p className='mt-1.5 text-muted-foreground'>{WHAT[a.id]}</p>
      <p className='mt-3 text-xs'>
        <span className='text-muted-foreground'>e.g. </span>
        {ex?.name ?? '–'}
      </p>
      {ex?.note && (
        <p className='mt-2 flex gap-1.5 rounded-md bg-muted px-2 py-1.5 text-xs'>
          <TriangleAlert className='mt-px size-3.5 shrink-0 text-muted-foreground' aria-hidden />
          <span>Note: {ex.note}</span>
        </p>
      )}
      <details className='relative z-10 mt-auto pt-3 text-xs text-muted-foreground'>
        <summary className='cursor-pointer select-none hover:text-foreground'>Data source</summary>
        <dl className='mt-1 space-y-0.5'>
          <div>ID: <code>{a.id}</code></div>
          <div>Data starts: {a.firstDate ?? '–'}</div>
          <div>Sources: {a.segments.map((s) => `${s.source} ${s.from}→${s.to}`).join(' · ')}</div>
        </dl>
      </details>
    </div>
  )
}

export function AssetsPage() {
  return (
    <PageShell title='Assets & data' lede='What each building block is, how it has grown, and how closely the assets move together.'>
      <AssetsContent />
    </PageShell>
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
    <select aria-label={i ? 'Second asset' : 'First asset'} className={`${selectClass} w-full font-normal sm:w-auto`} value={pair[i]} onChange={(e) => setPair((p) => (i ? [p[0], e.target.value] : [e.target.value, p[1]]))}>
      {assetsOnly.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  )
  return (
    <div className='space-y-4'>
        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {assetsOnly.map((a) => <AssetCard key={a.id} a={a} selected={a.id === sel} onSelect={() => setSel(a.id)} />)}
        </div>
        <Card className='min-w-0'>
          <CardHeader className='flex flex-row items-start justify-between gap-3'>
            <CardTitle className='text-base'>Growth of 10,000: {selName}</CardTitle>
            <ScaleToggle log={log} setLog={setLog} />
          </CardHeader>
          <CardContent>
            <div className='h-64' role='img' aria-label={`Line chart: growth of 10,000 invested in ${selName}`}><Suspense fallback={null}><GrowthChart rows={rows} log={log} /></Suspense></div>
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
            <div className='h-64' role='img' aria-label='Line chart: 36-month correlation between the two assets over time'><Suspense fallback={null}><RollingChart rows={rolling} /></Suspense></div>
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
    </div>
  )
}
