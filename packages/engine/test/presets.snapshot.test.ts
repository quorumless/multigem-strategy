// Regression snapshot: every preset on the local (gitignored) data/processed/monthly.csv (~70 ms in-process).
// Skipped when the real data is absent (public checkout / CI).
// Changing these numbers requires stating why in the commit message (CLAUDE.md golden rule 6).
import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { backtest } from '../src/backtest.ts'
import { parseMonthlyCsv } from '../src/data.ts'

const root = new URL('../../../', import.meta.url)
const csv = new URL('data/processed/monthly.csv', root)
const missing = !existsSync(csv)
if (missing) console.warn('preset snapshots skipped: real data missing — build it with `cd data/pipeline && uv run python -m pipeline.build`')
const data = missing ? null : parseMonthlyCsv(readFileSync(csv, 'utf8'))
const r6 = (x: number | null) => (x === null ? null : Math.round(x * 1e6) / 1e6)

const expected = {
  'classic-gem': { range: { start: '1997-04', end: '2026-09' }, cagr: 0.106216, maxDrawdown: -0.225992, sharpe: 0.682191, switchesPerYear: 1.25779, yearsBehind: 16, fullYears: 28 },
  'gem-em': { range: { start: '1998-01', end: '2026-09' }, cagr: 0.103941, maxDrawdown: -0.301719, sharpe: 0.583777, switchesPerYear: 1.988372, yearsBehind: 14, fullYears: 27 },
  multigem: { range: { start: '2003-07', end: '2026-09' }, cagr: 0.114153, maxDrawdown: -0.193539, sharpe: 0.856805, switchesPerYear: 9.107914, yearsBehind: 12, fullYears: 22 },
  multisleeve: { range: { start: '2003-07', end: '2026-09' }, cagr: 0.103645, maxDrawdown: -0.165905, sharpe: 0.878184, switchesPerYear: 9.582734, yearsBehind: 14, fullYears: 22 },
}

for (const [name, exp] of Object.entries(expected)) {
  test.skipIf(missing)(`preset snapshot: ${name}`, () => {
    const r = backtest(JSON.parse(readFileSync(new URL(`presets/${name}.json`, root), 'utf8')), data!)
    const m = r.metrics
    expect({
      range: r.range,
      cagr: r6(m.cagr),
      maxDrawdown: r6(m.maxDrawdown),
      sharpe: r6(m.sharpe),
      switchesPerYear: r6(m.switchesPerYear),
      yearsBehind: r.relative?.yearsBehind,
      fullYears: r.relative?.fullYears,
    }).toEqual(exp)
    expect(r.warnings).toEqual([])
  })
}
