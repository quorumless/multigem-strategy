import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const F = 'packages/engine/test/fixtures'
// Paths are given relative to the repo root via INIT_CWD, as `pnpm backtest` from the root does.
const run = (...args: string[]) =>
  spawnSync(process.execPath, [cli, '--data', `${F}/monthly.csv`, ...args], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, INIT_CWD: root },
    encoding: 'utf8',
  })

test('single config → result JSON, byte-identical across runs', () => {
  const a = run('--config', `${F}/gem.json`)
  expect(a.status).toBe(0)
  const r = JSON.parse(a.stdout)
  expect(r.range).toEqual({ start: '2000-07', end: '2002-12' })
  expect(Object.keys(r)).toEqual(['config', 'range', 'metrics', 'series', 'annual', 'monthly', 'relative', 'trades', 'benchmarks', 'warnings'])
  expect(run('--config', `${F}/gem.json`).stdout).toBe(a.stdout)
})

test('--from/--to override the config range', () => {
  const r = JSON.parse(run('--config', `${F}/gem.json`, '--from', '2001-01', '--to', '2001-12').stdout)
  expect(r.range).toEqual({ start: '2001-01', end: '2001-12' })
})

test('--compare prints a metrics table with benchmarks', () => {
  const r = run('--config', `${F}/gem.json`, '--config', `${F}/gem.json`, '--compare')
  expect(r.status).toBe(0)
  expect(r.stdout).toMatch(/^\s+Fixture GEM\s+Fixture GEM\s+BH_US\s+6040\s+EW\n/)
  expect(r.stdout).toMatch(/\nCAGR\s+18\.37%/)
})

test('--sweep table and json', () => {
  const t = run('--config', `${F}/gem.json`, '--sweep', 'sleeves[0].lookbacks=[3]..[6]:3')
  expect(t.status).toBe(0)
  expect(t.stdout.split('\n').filter((l) => /^\[\d+\]/.test(l))).toHaveLength(2)
  const j = JSON.parse(run('--config', `${F}/gem.json`, '--sweep', 'settings.costPct=0,0.01', '--format', 'json').stdout)
  expect(j.map((x: { value: number }) => x.value)).toEqual([0, 0.01])
})

test('exit 1: invalid config with readable zod issues, no stack', () => {
  const r = run('--config', `${F}/invalid.json`)
  expect(r.status).toBe(1)
  expect(r.stderr).toContain('sleeves.0: Unrecognized key: "lookback"')
  expect(r.stderr).toContain('sleeve weights sum to 0.5')
  expect(r.stderr).not.toMatch(/\n\s+at /)
})

test('exit 1: bad arguments / missing config file', () => {
  expect(run('--bogus').status).toBe(1)
  expect(run('--config', 'nope.json').status).toBe(1)
  expect(run('--config', `${F}/gem.json`, '--config', `${F}/gem.json`).status).toBe(1) // needs --compare
})

test('exit 2: insufficient data / missing data file', () => {
  const r = run('--config', `${F}/gem.json`, '--from', '2010-01')
  expect(r.status).toBe(2)
  expect(r.stderr).toMatch(/^data error: /)
  expect(spawnSync(process.execPath, [cli, '--config', `${F}/gem.json`, '--data', 'missing.csv'], { env: { ...process.env, INIT_CWD: root } }).status).toBe(2)
})

test('--rolling prints one row per start year plus min/median/max; bad years → exit 1', () => {
  const r = run('--config', `${F}/gem.json`, '--rolling', '1', '--metric', 'maxDrawdown')
  expect(r.status).toBe(0)
  // gem.json L=6 → first feasible 2000-07 → only 2001-01..2002-01 fits the fixture
  expect(r.stdout).toMatch(/^start\s+range\s+maxDrawdown\n2001\s+2001-01\.\.2002-01\s+-?\d+\.\d\d%\nmin/)
  expect(r.stdout).toMatch(/\nmedian\s+/)
  expect(run('--config', `${F}/gem.json`, '--rolling', 'x').status).toBe(1)
  expect(run('--config', `${F}/gem.json`, '--rolling', '1', '--metric', 'bestYear').status).toBe(1)
})

test('--signal prints current signal as JSON or table', () => {
  const j = run('--config', `${F}/gem.json`, '--signal')
  expect(j.status).toBe(0)
  const s = JSON.parse(j.stdout)
  expect(Object.keys(s)).toEqual(['asOf', 'tradeMonth', 'weights', 'previous', 'changed', 'signals', 'isRebalanceMonth'])
  expect(s.asOf).toBe('2002-12')
  expect(s.tradeMonth).toBe('2003-01')
  const t = run('--config', `${F}/gem.json`, '--signal', '--format', 'table')
  expect(t.stdout).toMatch(/^As of\s+2002-12\n/)
  expect(t.stdout).toMatch(/\nHold\s+/)
})

test('missing default data → exit 2 with build instructions', () => {
  const r = spawnSync(process.execPath, [cli, '--config', `${F}/gem.json`], {
    env: { ...process.env, INIT_CWD: root, MULTIGEM_DEFAULT_DATA: '/nonexistent/monthly.csv' },
    encoding: 'utf8',
  })
  expect(r.status).toBe(2)
  expect(r.stderr).toBe(
    'data error: No data found at data/processed/monthly.csv. Build it with: cd data/pipeline && uv run python -m pipeline.build ' +
      '(see README). For a quick try use --data data/sample/monthly.csv (synthetic).\n',
  )
})
