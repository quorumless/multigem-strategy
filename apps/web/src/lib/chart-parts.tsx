// Tooltip and legend shared by all charts (look defined in chart-theme.ts).
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { monthName } from './format'
import { cn } from './utils'

interface TipItem {
  name?: string | number
  value?: number | string | (number | string)[]
  color?: string
  stroke?: string
  fill?: string
}

/** Tooltip body for any chart: date header, rows sorted by value, values in tabular figures. */
export function ChartTooltip({
  active,
  payload,
  label,
  format,
  labelFormat = (l) => (/^\d{4}-\d{2}$/.test(String(l)) ? monthName(String(l)) : String(l)),
}: {
  active?: boolean
  payload?: readonly TipItem[]
  label?: string | number
  format: (v: number) => string
  labelFormat?: (l: string | number) => string
}) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => typeof p.value === 'number' && Number.isFinite(p.value)).sort((a, b) => Number(b.value) - Number(a.value))
  return (
    <div className='rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md'>
      {label != null && <div className='mb-1 font-medium'>{labelFormat(label)}</div>}
      {rows.map((p) => (
        <div key={String(p.name)} className='flex items-center gap-2'>
          <span className='size-2 shrink-0 rounded-full' style={{ background: p.stroke ?? p.color ?? p.fill }} />
          <span className='text-muted-foreground'>{p.name}</span>
          <span className='ms-auto ps-3 font-medium tabular-nums'>{format(Number(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

/** Compact legend: colored mark + label in text ink (+ optional value), one wrapping row. */
export function ChartLegend({ items }: { items: { label: string; color: string; dashed?: boolean; value?: string }[] }) {
  return (
    <ul className='mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
      {items.map((i) => (
        <li key={i.label} className='flex items-center gap-1.5'>
          <span className='inline-block h-0.5 w-3.5 rounded-full' style={i.dashed ? { borderTop: `2px dashed ${i.color}` } : { background: i.color, height: 3 }} />
          {i.label}
          {i.value && <span className='font-medium text-foreground tabular-nums'>{i.value}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Card around one chart: title, optional note and action, the plot (with a screen-reader summary), optional footer. */
export function Panel({
  title,
  note,
  action,
  label,
  className,
  height = 'h-64',
  children,
  footer,
}: {
  title: string
  note?: string
  action?: React.ReactNode
  /** Plain-text summary for screen readers. */
  label: string
  className?: string
  height?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <Card className={cn('min-w-0 gap-4', className)}>
      <CardHeader className='flex flex-row items-start justify-between gap-3'>
        <div className='space-y-1'>
          <CardTitle className='text-base'>{title}</CardTitle>
          {note && <CardDescription className='text-xs'>{note}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>
        <div role='img' aria-label={label} className={height}>
          {children}
        </div>
        {footer}
      </CardContent>
    </Card>
  )
}
