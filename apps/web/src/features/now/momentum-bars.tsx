import { STRATEGY } from '@/lib/chart-colors'
import { pct } from '@/lib/format'
import { assetLabel } from '@/features/lab/assets'

/**
 * Momentum scores as horizontal bars with the hurdle as a dashed line (PRD U7 visual).
 * Plain HTML so each row stays readable text for screen readers; no math beyond scaling.
 */
export function MomentumBars({ scores, hurdle, picked }: { scores: Record<string, number>; hurdle: number | null; picked: string[] }) {
  const rows = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const vals = [...rows.map(([, v]) => v), hurdle ?? 0, 0]
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100
  const zero = x(0)
  return (
    <div className='space-y-2'>
      <ul className='space-y-2.5'>
        {rows.map(([a, v]) => {
          const on = picked.includes(a)
          return (
            <li key={a} className='grid grid-cols-[minmax(0,9rem)_1fr_3.5rem] items-center gap-3 text-sm'>
              <span className={on ? 'truncate font-semibold' : 'truncate text-muted-foreground'} title={assetLabel(a)}>
                {assetLabel(a)}
              </span>
              <span className='relative h-5'>
                <span
                  className='absolute inset-y-0 rounded-sm'
                  style={{
                    left: `${Math.min(zero, x(v))}%`,
                    width: `${Math.abs(x(v) - zero)}%`,
                    background: on ? STRATEGY : 'var(--muted-foreground)',
                    opacity: on ? 1 : 0.35,
                  }}
                />
                <span className='absolute inset-y-[-4px] w-px bg-border' style={{ left: `${zero}%` }} />
                {hurdle != null && <span className='absolute inset-y-[-6px] border-l-2 border-dashed border-foreground/70' style={{ left: `${x(hurdle)}%` }} />}
              </span>
              <span className={`text-end tabular-nums ${on ? 'font-semibold' : ''}`}>{pct(v)}</span>
            </li>
          )
        })}
      </ul>
      {hurdle != null && (
        <p className='flex items-center gap-2 text-xs text-muted-foreground'>
          <span className='inline-block h-3 border-l-2 border-dashed border-foreground/70' aria-hidden />
          The bar to beat (T-bills): <span className='font-medium text-foreground tabular-nums'>{pct(hurdle)}</span>
        </p>
      )}
    </div>
  )
}
