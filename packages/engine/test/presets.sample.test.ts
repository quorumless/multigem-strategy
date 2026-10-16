// Smoke test: every preset runs on the synthetic data/sample/monthly.csv (committed, public). Values are
// arbitrary, so only "runs without throwing, finite metrics" is asserted.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { backtest } from '../src/backtest.ts'
import { parseMonthlyCsv } from '../src/data.ts'

const root = new URL('../../../', import.meta.url)
const csv = new URL('data/sample/monthly.csv', root)
const missing = !existsSync(csv)
if (missing) console.warn('preset sample smoke test skipped: data/sample/monthly.csv not found')
const presets = readdirSync(new URL('presets/', root)).filter((f) => f.endsWith('.json'))

for (const f of presets) {
  test.skipIf(missing)(`preset runs on sample data: ${f}`, () => {
    const data = parseMonthlyCsv(readFileSync(csv, 'utf8'))
    const r = backtest(JSON.parse(readFileSync(new URL(`presets/${f}`, root), 'utf8')), data)
    for (const [k, v] of Object.entries(r.metrics)) if (typeof v === 'number') expect(Number.isFinite(v), k).toBe(true)
    expect(r.series.every((p) => Number.isFinite(p.value) && p.value > 0)).toBe(true)
  })
}
