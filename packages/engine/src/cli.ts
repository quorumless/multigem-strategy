// Backtest CLI (STRATEGY_SPEC §8). The only engine file that does I/O.
// Paths are resolved against INIT_CWD (set by pnpm to where it was invoked) so `pnpm backtest` works from the repo root.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { ZodError } from 'zod'
import { backtest, currentSignal, type BacktestResult, type RunResult } from './backtest.ts'
import { StrategySchema, type StrategyInput } from './config.ts'
import { DataError, parseMonthlyCsv } from './data.ts'
import type { Metrics } from './metrics.ts'
import { parseSweep, sweep, SweepError } from './sweep.ts'
import { rollingStart, type NumericMetric } from './analysis.ts'

const USAGE = `Usage: pnpm backtest --config <file> [--config <file> --compare] [--sweep <path>=<values>]
       [--rolling <years> [--metric cagr|maxDrawdown|sharpe|...]] [--signal]
       [--format json|table] [--from YYYY-MM] [--to YYYY-MM] [--data <monthly.csv>]
Exit codes: 0 ok, 1 invalid config/arguments, 2 data error or insufficient data.`

class UsageError extends Error {}

const cwd = process.env.INIT_CWD ?? process.cwd()
// MULTIGEM_DEFAULT_DATA overrides the default location (used by tests to simulate a checkout without data).
const DEFAULT_DATA = process.env.MULTIGEM_DEFAULT_DATA ?? fileURLToPath(new URL('../../../data/processed/monthly.csv', import.meta.url))
const NO_DATA =
  'No data found at data/processed/monthly.csv. Build it with: cd data/pipeline && uv run python -m pipeline.build ' +
  '(see README). For a quick try use --data data/sample/monthly.csv (synthetic).'

const zodIssues = (e: ZodError) => e.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(2)}%`)
const fix = (x: number | null) => (x === null ? '—' : x.toFixed(2))

type Row = [string, (r: BacktestResult | RunResult) => string]
const m = (f: (x: Metrics) => string) => (r: BacktestResult | RunResult) => f(r.metrics)
const ROWS: Row[] = [
  ['Range', (r) => `${r.series[0]!.date}..${r.series.at(-1)!.date}`],
  ['CAGR', m((x) => pct(x.cagr))],
  ['Total return', m((x) => pct(x.totalReturn))],
  ['Volatility', m((x) => pct(x.volatility))],
  ['Sharpe', m((x) => fix(x.sharpe))],
  ['Sortino', m((x) => fix(x.sortino))],
  ['Max drawdown', m((x) => pct(x.maxDrawdown))],
  ['Max DD trough', m((x) => x.maxDrawdownTrough ?? '—')],
  ['Recovery (months)', m((x) => (x.maxDrawdownRecoveryMonths === null ? 'not recovered' : String(x.maxDrawdownRecoveryMonths)))],
  ['Calmar', m((x) => fix(x.calmar))],
  ['Ulcer index', m((x) => pct(x.ulcer))],
  ['Best year', m((x) => (x.bestYear ? `${x.bestYear.year} ${pct(x.bestYear.return)}` : '—'))],
  ['Worst year', m((x) => (x.worstYear ? `${x.worstYear.year} ${pct(x.worstYear.return)}` : '—'))],
  ['% positive months', m((x) => pct(x.pctPositiveMonths))],
  ['Switches / year', m((x) => fix(x.switchesPerYear))],
  ['Years behind BH_US', (r) => ('relative' in r && r.relative ? `${r.relative.yearsBehind}/${r.relative.fullYears}` : '—')],
  ['Longest behind BH_US', (r) => ('relative' in r && r.relative ? `${r.relative.longestBehindMonths} mo` : '—')],
]

function table(rows: string[][]) {
  const w = rows[0]!.map((_, j) => Math.max(...rows.map((r) => r[j]!.length)))
  return rows.map((r) => r.map((c, j) => (j === 0 ? c.padEnd(w[j]!) : c.padStart(w[j]!))).join('  ')).join('\n') + '\n'
}

function readJson(file: string): StrategyInput {
  let text: string
  try {
    text = readFileSync(resolve(cwd, file), 'utf8')
  } catch {
    throw new UsageError(`cannot read config ${file}`)
  }
  try {
    return JSON.parse(text) as StrategyInput
  } catch (e) {
    throw new UsageError(`config ${file} is not valid JSON: ${(e as Error).message}`)
  }
}

function main(argv: string[]): number {
  const { values: o } = parseArgs({
    args: argv,
    options: {
      config: { type: 'string', multiple: true },
      compare: { type: 'boolean' },
      sweep: { type: 'string' },
      rolling: { type: 'string' },
      signal: { type: 'boolean' },
      metric: { type: 'string' },
      format: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      data: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  })
  if (o.help) {
    process.stdout.write(USAGE + '\n')
    return 0
  }
  const files = o.config ?? []
  if (files.length === 0) throw new UsageError('missing --config')
  if (files.length > 1 && !o.compare) throw new UsageError('several --config need --compare')
  if ([o.compare, o.sweep, o.rolling, o.signal].filter(Boolean).length > 1)
    throw new UsageError('--compare, --sweep, --rolling and --signal cannot be combined')
  const format = o.format ?? (o.compare || o.sweep || o.rolling ? 'table' : 'json')
  if (format !== 'json' && format !== 'table') throw new UsageError(`--format must be json or table`)

  const configs = files.map((f) => {
    const c = { ...readJson(f), ...(o.from && { startDate: o.from }), ...(o.to && { endDate: o.to }) }
    const p = StrategySchema.safeParse(c)
    if (!p.success) throw new UsageError(`invalid config ${f}:\n${zodIssues(p.error)}`)
    return c
  })
  const dataFile = o.data ? resolve(cwd, o.data) : DEFAULT_DATA
  let csv: string
  try {
    csv = readFileSync(dataFile, 'utf8')
  } catch {
    throw new DataError(o.data ? `cannot read data file ${dataFile}` : NO_DATA)
  }
  const data = parseMonthlyCsv(csv)
  const out = (s: string) => process.stdout.write(s)
  const warn = (r: BacktestResult, label: string) => r.warnings.forEach((w) => process.stderr.write(`warning (${label}): ${w}\n`))

  if (o.signal) {
    const sig = currentSignal(configs[0]!, data)
    if (format === 'json') out(JSON.stringify(sig) + '\n')
    else {
      const w = (x: Record<string, number>) => Object.entries(x).map(([a, v]) => `${a} ${pct(v)}`).join(', ') || '—'
      out(table([
        ['As of', sig.asOf],
        ['Trade for month', sig.tradeMonth],
        ['Rebalance month', sig.isRebalanceMonth ? 'yes' : 'no'],
        ['Hold', w(sig.weights)],
        ['Previous', w(sig.previous)],
        ['Changed', sig.changed ? 'yes' : 'no'],
      ]))
    }
    return 0
  }

  if (o.rolling) {
    const horizonYears = Number(o.rolling)
    if (!(Number.isInteger(horizonYears) && horizonYears >= 1)) throw new UsageError('--rolling needs a whole number of years ≥ 1')
    const metric = (o.metric ?? 'cagr') as NumericMetric
    const sample = backtest(configs[0]!, data).metrics
    if (!(metric in sample) || (sample[metric] !== null && typeof sample[metric] !== 'number')) throw new UsageError(`--metric ${metric} is not a numeric metric`)
    const rows = rollingStart(configs[0]!, data, { horizonYears, metric })
    if (format === 'json') out(JSON.stringify(rows) + '\n')
    else {
      const f = (x: number | null) => (/drawdown|cagr|return|volatility|ulcer|pct/i.test(metric) ? pct(x) : fix(x))
      const vals = rows.map((r) => r.value).filter((x): x is number => x !== null).sort((a, b) => a - b)
      const summary = vals.length ? [['min', '', f(vals[0]!)], ['median', '', f((vals[Math.floor((vals.length - 1) / 2)]! + vals[Math.ceil((vals.length - 1) / 2)]!) / 2)], ['max', '', f(vals.at(-1)!)]] : []
      out(table([['start', 'range', metric], ...rows.map((r) => [String(r.startYear), `${r.range.start}..${r.range.end}`, f(r.value)]), ...summary]))
    }
    return 0
  }

  if (o.sweep) {
    const runs = sweep(configs[0]!, parseSweep(o.sweep), data)
    if (format === 'json') out(JSON.stringify(runs.map((r) => ({ value: r.value, range: r.result.range, metrics: r.result.metrics, relative: r.result.relative }))) + '\n')
    else {
      const cols = ['Range', 'CAGR', 'Max drawdown', 'Volatility', 'Sharpe', 'Switches / year', 'Years behind BH_US']
      const rows = ROWS.filter(([k]) => cols.includes(k))
      out(table([[o.sweep.split('=')[0]!, ...rows.map(([k]) => k)], ...runs.map((r) => [JSON.stringify(r.value), ...rows.map(([, f]) => f(r.result))])]))
      runs.forEach((r) => warn(r.result, JSON.stringify(r.value)))
    }
    return 0
  }

  const results = configs.map((c) => backtest(c, data))
  if (!o.compare) {
    const r = results[0]!
    if (format === 'json') out(JSON.stringify(r) + '\n')
    else out(table([['', r.config.name], ...ROWS.map(([k, f]) => [k, f(r)])]))
    if (format === 'table') warn(r, r.config.name)
    return 0
  }
  if (format === 'json') {
    out(JSON.stringify(results.map((r) => ({ name: r.config.name, range: r.range, metrics: r.metrics, relative: r.relative }))) + '\n')
    return 0
  }
  // Benchmarks come from the first config; they share its range.
  const b = results[0]!.benchmarks
  const cols: [string, BacktestResult | RunResult][] = [
    ...results.map((r): [string, BacktestResult] => [r.config.name, r]),
    ...(['BH_US', '6040', 'EW'] as const).flatMap((id): [string, RunResult][] => (b[id] ? [[id, b[id]]] : [])),
  ]
  out(table([['', ...cols.map(([n]) => n)], ...ROWS.map(([k, f]) => [k, ...cols.map(([, r]) => f(r))])]))
  if (new Set(results.map((r) => `${r.range.start}..${r.range.end}`)).size > 1)
    process.stderr.write('warning: configs cover different ranges; use --from/--to for a like-for-like comparison\n')
  results.forEach((r) => warn(r, r.config.name))
  return 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (e) {
  if (e instanceof ZodError) {
    process.stderr.write(`invalid config:\n${zodIssues(e)}\n`)
    process.exitCode = 1
  } else if (e instanceof DataError) {
    process.stderr.write(`data error: ${e.message}\n`)
    process.exitCode = 2
  } else if (e instanceof UsageError || e instanceof SweepError || (e as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
    process.stderr.write(`${(e as Error).message}\n${e instanceof UsageError && e.message.startsWith('invalid config') ? '' : USAGE + '\n'}`)
    process.exitCode = 1
  } else throw e
}
