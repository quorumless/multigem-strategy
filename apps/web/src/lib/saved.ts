// Strategies the user can pick on the Compare / Sensitivity pages: saved ones (localStorage) + presets.
import { parseConfig, type StrategyInput } from 'engine'
import { presets } from './presets'
import { readJson } from './storage'
import { defaultSettings, fromStrategy, toInput, type SettingsValues } from './strategy-form'

export const SAVED_KEY = 'multigem.saved'
export const SETTINGS_KEY = 'multigem.settings'
export type Saved = { name: string; config: StrategyInput }[]

export const readSettings = (): SettingsValues => ({ ...defaultSettings, ...readJson<Partial<SettingsValues>>(SETTINGS_KEY, {}) })

export interface Option {
  id: string
  name: string
  source: 'saved' | 'preset'
  config: StrategyInput
}

export function listStrategies(): Option[] {
  const s = readSettings()
  const saved = readJson<Saved>(SAVED_KEY, []).map((x) => ({ id: `saved:${x.name}`, name: x.name, source: 'saved' as const, config: x.config }))
  // presets carry no settings: give them the user's cost/tax/currency settings
  const pre = presets.map((p) => ({
    id: `preset:${p.config.name}`,
    name: p.config.name,
    source: 'preset' as const,
    config: toInput(fromStrategy(parseConfig(p.config)).form, s),
  }))
  return [...saved, ...pre]
}
