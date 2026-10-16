// The ONE place the app picks its data. `@data` is a Vite alias (vite.config.ts): data/processed if it
// exists, else the synthetic data/sample.
import { parseMonthlyCsv } from 'engine'
import monthlyCsv from '@data/monthly.csv?raw'
import assetsJson from '@data/assets.json'

export interface AssetInfo {
  id: string
  name: string
  role: string
  firstDate: string | null
  ucits: { name: string; isin?: string; note?: string }[]
  notes?: string | null
  synthetic?: boolean
}

export const data = parseMonthlyCsv(monthlyCsv)
export const assets = assetsJson as AssetInfo[]
/** True when running on the committed synthetic sample (not real market data). */
export const IS_SYNTHETIC = assets.length > 0 && assets.every((a) => a.synthetic === true)
