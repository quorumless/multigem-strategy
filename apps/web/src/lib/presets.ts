// Starter strategies (PRD U4): the repo's presets/*.json plus a one-line story each.
import type { StrategyInput } from 'engine'

export interface Preset {
  story: string
  config: StrategyInput
}

const stories: Record<string, string> = {
  'Classic GEM': 'Own US or foreign stocks, whichever did better over the last year; hide in bonds when stocks lag T-bills.',
  'GEM with EM': 'Same idea with emerging markets added to the choices.',
  MultiGEM: 'Chooses among stocks, gold, commodities and long bonds, averaging several look-back windows.',
  'Multi-sleeve': 'Splits money into three independent parts: stocks, real assets (gold, commodities) and bonds.',
}

const files = import.meta.glob<StrategyInput>('../../../../presets/*.json', { eager: true, import: 'default' })
export const presets: Preset[] = Object.values(files).map((config) => ({
  config,
  story: stories[config.name] ?? 'A ready-made strategy.',
}))
