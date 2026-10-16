import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { parseConfig, type StrategyInput } from '../src/config.ts'
import { parseMonthlyCsv } from '../src/data.ts'
import { parseSweep, setPath, sweep } from '../src/sweep.ts'

test('parseSweep: numeric range with step, bracketed range, list', () => {
  expect(parseSweep('sleeves[*].topN=1..3')).toEqual({ path: 'sleeves[*].topN', values: [1, 2, 3] })
  // 0, .002, …, .01 — fp noise rounded away
  expect(parseSweep('settings.costPct=0..0.01:0.002').values).toEqual([0, 0.002, 0.004, 0.006, 0.008, 0.01])
  expect(parseSweep('sleeves[0].lookbacks=[1]..[12]:4').values).toEqual([[1], [5], [9]])
  expect(parseSweep('sleeves[0].momentum=total,skip1').values).toEqual(['total', 'skip1'])
  expect(parseSweep('settings.executionLag=0,1').values).toEqual([0, 1])
  expect(() => parseSweep('topN')).toThrow(/path/)
  expect(() => parseSweep('x=3..1')).toThrow(/empty/)
  expect(() => parseSweep('x=1..3:0')).toThrow(/step/)
})

const two: StrategyInput = {
  name: 't',
  sleeves: [
    { id: 'a', weight: 0.5, universe: ['US', 'DEVXUS'] },
    { id: 'b', weight: 0.5, universe: ['US'] },
  ],
}

test('setPath: index, [*], nested; input untouched; missing parent is an error', () => {
  expect(setPath(two, 'sleeves[1].topN', 2).sleeves[1]!.topN).toBe(2)
  expect(setPath(two, 'sleeves[*].lookbacks', [3]).sleeves.map((s) => s.lookbacks)).toEqual([[3], [3]])
  expect(two.sleeves[0]!.lookbacks).toBeUndefined()
  expect(() => setPath(two, 'settings.costPct', 0)).toThrow(/does not exist/)
  expect(setPath(parseConfig(two), 'settings.costPct', 0).settings!.costPct).toBe(0)
})

test('sweep runs one backtest per value on defaulted keys', () => {
  const data = parseMonthlyCsv(readFileSync(new URL('fixtures/monthly.csv', import.meta.url), 'utf8'))
  const cfg: StrategyInput = { name: 't', sleeves: [{ id: 'g', weight: 1, universe: ['US', 'DEVXUS'], lookbacks: [6] }] }
  const runs = sweep(cfg, parseSweep('settings.costPct=0..0.01:0.01'), data)
  expect(runs.map((r) => r.value)).toEqual([0, 0.01])
  expect(runs[1]!.result.config.settings.costPct).toBe(0.01)
  expect(runs[1]!.result.metrics.cagr).toBeLessThan(runs[0]!.result.metrics.cagr)
})

test('every preset validates', () => {
  const dir = new URL('../../../presets/', import.meta.url)
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  expect(files.sort()).toEqual(['classic-gem.json', 'gem-em.json', 'multigem.json', 'multisleeve.json'])
  for (const f of files) expect(() => parseConfig(JSON.parse(readFileSync(new URL(f, dir), 'utf8'))), f).not.toThrow()
})
