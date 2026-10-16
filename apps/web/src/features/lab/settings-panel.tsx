import type { SettingsValues } from '@/lib/strategy-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card>
      <CardHeader>
        <CardTitle>3. Real-life costs</CardTitle>
        <CardDescription>Defaults are for a Polish investor. Results are always shown after these.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-wrap items-end gap-6'>
        <label className='space-y-1'>
          <Labelled k='currency' />
          <select className={`${selectClass} block`} value={value.currency} onChange={(e) => set('currency', e.target.value as SettingsValues['currency'])}>
            <option>PLN</option>
            <option>EUR</option>
            <option>USD</option>
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
      </CardContent>
    </Card>
  )
}
