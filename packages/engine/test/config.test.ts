import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { z } from 'zod'
import { parseConfig, StrategySchema } from '../src/config.ts'
import { DataError, parseMonthlyCsv } from '../src/data.ts'

const sleeve = { id: 's', weight: 1, universe: ['US', 'DEVXUS'] }

// §2: sleeve weights must sum to 1 (±1e-9)
test('§2 sleeve weights must sum to 1', () => {
  expect(() => parseConfig({ name: 'x', sleeves: [{ ...sleeve, weight: 0.6 }] })).toThrow(/sum/)
  expect(() => parseConfig({ name: 'x', sleeves: [{ ...sleeve, weight: 0.6 }, { ...sleeve, id: 't', weight: 0.4 }] })).not.toThrow()
  expect(() => parseConfig({ name: 'x', sleeves: [{ ...sleeve, weight: 0.6 }, { ...sleeve, id: 't', weight: 0.4 + 1e-8 }] })).toThrow(/sum/)
})

test('§2/§4 validation: buffer needs topN=1, topN ≤ universe', () => {
  expect(() => parseConfig({ name: 'x', sleeves: [{ ...sleeve, topN: 2, buffer: 0.01 }] })).toThrow(/buffer/)
  expect(() => parseConfig({ name: 'x', sleeves: [{ ...sleeve, topN: 3 }] })).toThrow(/topN/)
  expect(() => parseConfig({ name: 'x', sleeves: [{ ...sleeve, lookbacks: [13] }] })).toThrow()
})

test('unknown keys (typos) are rejected', () => {
  expect(() => parseConfig({ name: 'x', sleeves: [{ ...sleeve, lookback: [6] }] })).toThrow(/lookback/)
  expect(() => parseConfig({ name: 'x', sleeves: [sleeve], settings: { costPtc: 0 } })).toThrow(/costPtc/)
  expect(() => parseConfig({ name: 'x', sleeves: [sleeve], extra: 1 })).toThrow(/extra/)
})

test('§3 defaults', () => {
  const c = parseConfig({ name: 'x', sleeves: [sleeve] })
  expect(c.sleeves[0]).toEqual({
    ...sleeve,
    lookbacks: [12],
    lookbackMode: 'blend',
    momentum: 'total',
    topN: 1,
    absFilter: 'tbill',
    safeHaven: { mode: 'fixed', asset: 'AGG' },
    weighting: 'equal',
    buffer: 0,
  })
  expect(c.settings).toEqual({
    rebalance: 'monthly',
    executionLag: 0,
    currency: 'USD',
    costPct: 0.001,
    fxCostPct: 0,
    tax: { enabled: false, rate: 0.19 },
  })
  expect(parseConfig({ name: 'x', sleeves: [sleeve], settings: { tax: { enabled: true } } }).settings.tax).toEqual({ enabled: true, rate: 0.19 })
})

test('§8 committed config.schema.json is up to date (run `pnpm --filter engine gen:schema`)', () => {
  const committed = JSON.parse(readFileSync(new URL('../config.schema.json', import.meta.url), 'utf8'))
  expect(committed).toEqual(z.toJSONSchema(StrategySchema, { io: 'input' }))
})

test('data loader parses CSV with empty cells', () => {
  const d = parseMonthlyCsv('date,US,FX_PLN\n1999-12,100,\n2000-01,101.5,4.1\n')
  expect(d).toEqual({ dates: ['1999-12', '2000-01'], series: { US: [100, 101.5], FX_PLN: [null, 4.1] } })
})

test('data loader rejects bad input', () => {
  expect(() => parseMonthlyCsv('day,US\n2000-01,1')).toThrow(DataError)
  expect(() => parseMonthlyCsv('date,US\n2000-1,1')).toThrow(/bad date/)
  expect(() => parseMonthlyCsv('date,US\n2000-01,1\n2000-03,1')).toThrow(/consecutive/)
  expect(() => parseMonthlyCsv('date,US\n2000-01,abc')).toThrow(/bad value/)
  expect(() => parseMonthlyCsv('date,US\n2000-01,1,2')).toThrow(/cells/)
})
