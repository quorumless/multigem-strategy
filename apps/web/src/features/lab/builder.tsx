import { useRef, useState } from 'react'
import { Controller, useFieldArray, type UseFormReturn } from 'react-hook-form'
import { parseConfig, StrategySchema, type StrategyInput } from 'engine'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { presets } from '@/lib/presets'
import { SAVED_KEY, type Saved } from '@/lib/saved'
import { readJson, storageAvailable, writeJson } from '@/lib/storage'
import { fromStrategy, newSleeve, type FormValues, type SettingsValues } from '@/lib/strategy-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { assetExample, holdableAssets, riskyAssets } from './assets'
import { InfoTip, Labelled, selectClass } from './info-tip'

function AssetPicker({ value, onChange, advanced }: { value: string[]; onChange: (v: string[]) => void; advanced: boolean }) {
  return (
    <div className='grid gap-1 sm:grid-cols-2'>
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
    <Card>
      <CardHeader>
        <CardTitle>1. Pick a starting point</CardTitle>
        <CardDescription>Choose a ready-made idea, then tweak it below.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          {presets.map((p) => (
            <button
              key={p.config.name}
              type='button'
              onClick={() => load(p.config, false)}
              className='rounded-lg border p-3 text-start transition hover:border-primary hover:bg-accent'
            >
              <div className='font-medium'>{p.config.name}</div>
              <p className='mt-1 text-xs text-muted-foreground'>{p.story}</p>
            </button>
          ))}
        </div>

        <div className='flex flex-wrap items-center justify-between gap-3 border-t pt-4'>
          <h3 className='font-semibold'>2. Adjust</h3>
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
                <label className='space-y-1'>
                  <Labelled k='lookback' />
                  <Input {...form.register(`sleeves.${i}.lookbacks`)} className='block w-32' placeholder='12 or 3, 6, 12' />
                </label>
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

        <div className='flex flex-wrap items-center gap-2 border-t pt-4'>
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
      </CardContent>
    </Card>
  )
}
