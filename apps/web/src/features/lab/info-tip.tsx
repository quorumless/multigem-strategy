import { Info } from 'lucide-react'
import { glossary } from '@/lib/glossary'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** ⓘ tooltip with the glossary text for a metric or parameter key. */
export function InfoTip({ k }: { k: string }) {
  const g = glossary[k]
  if (!g) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type='button' aria-label={`About ${g.label}`} className='inline-flex text-muted-foreground hover:text-foreground'>
          <Info className='size-3.5' />
        </button>
      </TooltipTrigger>
      <TooltipContent className='max-w-xs space-y-1 text-left'>
        <p>{g.meaning}</p>
        <p className='opacity-80'>Good: {g.good}</p>
        <p className='opacity-80'>Typical: {g.typical}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function Labelled({ k, children }: { k: string; children?: React.ReactNode }) {
  return (
    <span className='inline-flex items-center gap-1 text-sm font-medium'>
      {glossary[k]?.label ?? k}
      {children}
      <InfoTip k={k} />
    </span>
  )
}

export const selectClass =
  'h-9 max-w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none'
