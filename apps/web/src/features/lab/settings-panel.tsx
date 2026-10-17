import type { SettingsValues } from '@/lib/strategy-form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Labelled, selectClass } from './info-tip'

export function SettingsPanel({ value, onChange }: { value: SettingsValues; onChange: (s: SettingsValues) => void }) {
  const set = <K extends keyof SettingsValues>(k: K, v: SettingsValues[K]) => onChange({ ...value, [k]: v })
  const numField = (k: 'costPct' | 'fxCostPct' | 'taxRate', disabled = false) => (
    <Input
      type='number'
      step={0.05}
      min={0}
      max={100}
      disabled={disabled}
      value={Number.isNaN(value[k]) ? '' : value[k]}
      onChange={(e) => set(k, e.target.valueAsNumber)}
      className='block w-24'
    />
  )
  return (
    <section className='space-y-3 border-t pt-5'>
      <div>
        <h2 className='font-semibold'>Costs &amp; tax</h2>
        <p className='text-sm text-muted-foreground'>Defaults: US dollars, 0.1% trading cost, 19% tax on gains (Polish rate). Results are always shown after these.</p>
      </div>
      <div className='flex flex-wrap items-end gap-x-6 gap-y-4'>
        <label className='space-y-1'>
          <Labelled k='currency' />
          <select className={`${selectClass} block`} value={value.currency} onChange={(e) => set('currency', e.target.value as SettingsValues['currency'])}>
            <option>USD</option>
            <option>PLN</option>
            <option>EUR</option>
          </select>
        </label>
        <label className='space-y-1'>
          <Labelled k='costPct' />
          {numField('costPct')}
        </label>
        <label className='space-y-1'>
          <Labelled k='fxCostPct' />
          {numField('fxCostPct', value.currency === 'USD')}
        </label>
        <div className='flex items-end gap-3'>
          <label className='flex items-center gap-2 pb-2 text-sm'>
            <Switch checked={value.taxOn} onCheckedChange={(c) => set('taxOn', c)} /> <Labelled k='tax' />
          </label>
          <label className='space-y-1'>
            <span className='text-sm'>Rate (%)</span>
            {numField('taxRate', !value.taxOn)}
          </label>
        </div>
      </div>
    </section>
  )
}
