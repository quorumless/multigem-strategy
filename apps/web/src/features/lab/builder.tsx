import { useRef, useState } from 'react'
import { Controller, useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form'
import { parseConfig, StrategySchema, type StrategyInput } from 'engine'
import { Check, Minus, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { presets } from '@/lib/presets'
import { SAVED_KEY, type Saved } from '@/lib/saved'
import { readJson, storageAvailable, writeJson } from '@/lib/storage'
import { fromStrategy, newSleeve, type FormValues, type SettingsValues } from '@/lib/strategy-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { assetExample, holdableAssets, riskyAssets } from './assets'
import { InfoTip, Labelled, selectClass } from './info-tip'

function AssetPicker({ value, onChange, advanced }: { value: string[]; onChange: (v: string[]) => void; advanced: boolean }) {
  return (
    <div className='grid gap-x-4 gap-y-2 @2xl/builder:grid-cols-2'>
      {riskyAssets.map((a) => (
        <label key={a.id} className='flex items-start gap-2 text-sm'>
          <Checkbox
            checked={value.includes(a.id)}
            onCheckedChange={(c) => onChange(c ? [...value, a.id] : value.filter((x) => x !== a.id))}
          />
          <span>
            {a.name}
            {advanced && <code className='ms-1 text-xs text-muted-foreground'>{a.id}</code>}
            {assetExample(a.id) && <span className='block text-xs text-muted-foreground'>e.g. {assetExample(a.id)}</span>}
          </span>
        </label>
      ))}
    </div>
  )
}

const MAX_LB = 12
const joinMonths = (v: number[]) => (v.length > 1 ? `${v.slice(0, -1).join(', ')} and ${v[v.length - 1]}` : String(v[0]))

export function LookbackField({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const set = (i: number, n: number) => {
    if (n < 1 || n > MAX_LB || (n !== value[i] && value.includes(n))) return
    onChange(value.map((x, j) => (j === i ? n : x)).sort((a, b) => a - b))
  }
  const unused = Array.from({ length: MAX_LB }, (_, k) => MAX_LB - k).find((n) => !value.includes(n))
  return (
    <div className='space-y-2'>
      {value.map((n, i) => (
        <div key={n} role='group' aria-label={`Window ${i + 1}`} className='flex items-center gap-1'>
          <Button type='button' variant='outline' size='icon' className='size-8' aria-label='Fewer months' disabled={n <= 1} onClick={() => set(i, n - 1)}>
            <Minus className='size-4' />
          </Button>
          <span
            tabIndex={0}
            role='spinbutton'
            aria-valuenow={n}
            aria-valuemin={1}
            aria-valuemax={MAX_LB}
            className='min-w-24 rounded-md px-2 text-center text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
            onKeyDown={(e) => {
              if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
              e.preventDefault()
              set(i, n + (e.key === 'ArrowUp' ? 1 : -1))
            }}
          >
            {n} {n === 1 ? 'month' : 'months'}
          </span>
          <Button type='button' variant='outline' size='icon' className='size-8' aria-label='More months' disabled={n >= MAX_LB} onClick={() => set(i, n + 1)}>
            <Plus className='size-4' />
          </Button>
          {value.length > 1 && (
            <Button type='button' variant='ghost' size='icon' className='size-8' aria-label='Remove window' onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <X className='size-4' />
            </Button>
          )}
        </div>
      ))}
      {unused !== undefined && (
        <Button type='button' variant='ghost' size='sm' onClick={() => onChange([...value, unused].sort((a, b) => a - b))}>
          <Plus className='size-4' /> Add window
        </Button>
      )}
      <p className='max-w-sm text-xs text-muted-foreground'>
        {value.length > 1
          ? `Momentum = average of the returns over ${joinMonths(value)} months. Mixing short and long windows reacts faster but trades more.`
          : `Compare returns over the last ${value[0]} months.`}
      </p>
    </div>
  )
}

export function Builder({
  form,
  setSettings,
  input,
}: {
  form: UseFormReturn<FormValues>
  setSettings: (s: SettingsValues) => void
  input: StrategyInput
}) {
  const [advanced, setAdvanced] = useState(false)
  const [saved, setSaved] = useState<Saved>(() => readJson<Saved>(SAVED_KEY, []))
  const fileRef = useRef<HTMLInputElement>(null)
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'sleeves' })
  const multi = fields.length > 1
  const name = useWatch({ control: form.control, name: 'name' })

  const load = (config: unknown, withSettings: boolean) => {
    const r = StrategySchema.safeParse(config)
    if (!r.success) return toast.error(`That file isn't a valid strategy: ${r.error.issues.map((i) => `${i.path.join('.') || 'strategy'}: ${i.message}`).join('; ')}`)
    const { form: f, settings: s } = fromStrategy(parseConfig(config))
    form.reset(f)
    if (withSettings) setSettings(s)
  }
  const save = () => {
    const next = [...saved.filter((s) => s.name !== input.name), { name: input.name, config: input }]
    if (writeJson(SAVED_KEY, next)) {
      setSaved(next)
      toast.success(`Saved "${input.name}" in this browser.`)
    } else toast.error("Couldn't save: browser storage is unavailable.")
  }
  const del = (name: string) => {
    const next = saved.filter((s) => s.name !== name)
    writeJson(SAVED_KEY, next)
    setSaved(next)
  }
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(input, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${input.name.replace(/\W+/g, '-')}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }
  const importJson = async (file: File) => {
    try {
      load(JSON.parse(await file.text()), true)
    } catch {
      toast.error("That file isn't valid JSON.")
    }
  }

  return (
    <div className='space-y-5'>
      <section className='space-y-3'>
        <div>
          <h2 className='font-semibold'>Start from</h2>
          <p className='text-sm text-muted-foreground'>Choose a ready-made idea, then tweak it below.</p>
        </div>
        <div className='grid grid-cols-1 gap-2 @[17rem]/builder:grid-cols-2'>
          {presets.map((p) => {
            const on = p.config.name === name
            return (
              <button
                key={p.config.name}
                type='button'
                aria-pressed={on}
                onClick={() => load(p.config, false)}
                className={`relative rounded-lg border p-3 text-start transition-colors hover:border-primary/60 hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${on ? 'border-primary bg-accent/60 ring-1 ring-primary' : ''}`}
              >
                <div className='pe-5 text-sm font-medium'>{p.config.name}</div>
                {on && <Check className='absolute end-2.5 top-3 size-4 text-primary' aria-hidden />}
                <p className='mt-1 text-xs leading-snug text-muted-foreground'>{p.story}</p>
              </button>
            )
          })}
        </div>
      </section>

      <section className='space-y-4 border-t pt-5'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <h2 className='font-semibold'>Adjust</h2>
          <label className='flex items-center gap-2 text-sm'>
            <Switch checked={advanced} onCheckedChange={setAdvanced} /> Advanced options
          </label>
        </div>

        <label className='block space-y-1'>
          <span className='text-sm font-medium'>Name</span>
          <Input {...form.register('name')} className='max-w-sm' />
        </label>

        {multi && !advanced && (
          <p className='rounded-md bg-muted p-2 text-sm'>This strategy has {fields.length} sleeves. Switch on “Advanced options” to edit them all; below is the first one.</p>
        )}

        {fields.map((f, i) => {
          if (!advanced && i > 0) return null
          return (
            <div key={f.id} className='space-y-4 rounded-lg border p-3'>
              {advanced && (
                <div className='flex flex-wrap items-end gap-3'>
                  <label className='space-y-1'>
                    <span className='text-sm font-medium'>Sleeve name</span>
                    <Input {...form.register(`sleeves.${i}.id`)} className='w-36' />
                  </label>
                  <label className='space-y-1'>
                    <Labelled k='sleeveWeight' />
                    <Input type='number' {...form.register(`sleeves.${i}.weight`, { valueAsNumber: true })} className='block w-24' />
                  </label>
                  {multi && (
                    <Button type='button' variant='ghost' size='icon' aria-label='Remove sleeve' onClick={() => remove(i)}>
                      <Trash2 className='size-4' />
                    </Button>
                  )}
                </div>
              )}
              <div className='space-y-2'>
                <Labelled k='universe' />
                <Controller control={form.control} name={`sleeves.${i}.universe`} render={({ field }) => <AssetPicker value={field.value} onChange={field.onChange} advanced={advanced} />} />
              </div>
              <div className='flex flex-wrap gap-6'>
                <div className='space-y-1'>
                  <Labelled k='lookback' />
                  <Controller control={form.control} name={`sleeves.${i}.lookbacks`} render={({ field }) => <LookbackField value={field.value} onChange={field.onChange} />} />
                </div>
                <label className='max-w-full space-y-1'>
                  <Labelled k='safeHaven' />
                  <select className={`${selectClass} block`} {...form.register(`sleeves.${i}.safeAsset`)}>
                    {form.getValues(`sleeves.${i}.safeAsset`) === '' && <option value=''>(best of several — kept from import)</option>}
                    {holdableAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {advanced ? ` (${a.id})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {advanced && (
                <div className='flex flex-wrap items-end gap-6'>
                  <label className='space-y-1'>
                    <Labelled k='topN' />
                    <Input type='number' min={1} {...form.register(`sleeves.${i}.topN`, { valueAsNumber: true })} className='block w-20' />
                  </label>
                  <label className='space-y-1'>
                    <Labelled k='buffer' />
                    <Input type='number' step={0.5} min={0} {...form.register(`sleeves.${i}.buffer`, { valueAsNumber: true })} className='block w-24' />
                  </label>
                  <label className='flex items-center gap-2 text-sm'>
                    <Controller control={form.control} name={`sleeves.${i}.invVol`} render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
                    {'Calmer assets get more'} <InfoTip k='invVol' />
                  </label>
                </div>
              )}
            </div>
          )
        })}

        {advanced && (
          <div className='flex flex-wrap items-end gap-6'>
            <Button type='button' variant='outline' size='sm' onClick={() => append(newSleeve(`sleeve${fields.length + 1}`, 0))}>
              <Plus className='size-4' /> Add sleeve
            </Button>
            <label className='space-y-1'>
              <Labelled k='rebalance' />
              <select className={`${selectClass} block`} {...form.register('rebalance')}>
                <option value='monthly'>Every month</option>
                <option value='quarterly'>Every quarter</option>
              </select>
            </label>
            <label className='flex items-center gap-2 text-sm'>
              <Controller control={form.control} name='executionLag' render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
              Trade one month late <InfoTip k='executionLag' />
            </label>
          </div>
        )}

        <div className='flex flex-wrap items-center gap-2 pt-1'>
          {!storageAvailable() && <p className='w-full text-xs text-muted-foreground'>Saving isn't available in this browser (private mode?). Use Export JSON to keep your strategy.</p>}
          <Button type='button' size='sm' onClick={save}>Save</Button>
          <Button type='button' size='sm' variant='outline' onClick={exportJson}>Export JSON</Button>
          <Button type='button' size='sm' variant='outline' onClick={() => fileRef.current?.click()}>Import JSON</Button>
          <input ref={fileRef} type='file' accept='application/json,.json' hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          {saved.length > 0 && (
            <select className={selectClass} aria-label='Saved strategies' value='' onChange={(e) => { const s = saved.find((x) => x.name === e.target.value); if (s) load(s.config, true) }}>
              <option value=''>Load saved…</option>
              {saved.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          )}
          {saved.length > 0 && (
            <select className={selectClass} aria-label='Delete saved strategy' value='' onChange={(e) => e.target.value && del(e.target.value)}>
              <option value=''>Delete saved…</option>
              {saved.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          )}
        </div>
      </section>
    </div>
  )
}
