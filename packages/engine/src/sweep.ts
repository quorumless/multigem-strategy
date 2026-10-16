// One-parameter sensitivity (STRATEGY_SPEC §8 sweep syntax). Pure; shared by the CLI and the web sensitivity page.
import { backtest, type BacktestResult } from './backtest.ts'
import { parseConfig, type StrategyInput } from './config.ts'
import type { MonthlyData } from './data.ts'

export interface SweepSpec {
  /** Dot path on the config, e.g. `sleeves[0].lookbacks`, `sleeves[*].topN`, `settings.costPct`. */
  path: string
  values: unknown[]
}

export class SweepError extends Error {}

const num = (s: string) => {
  const n = Number(s)
  if (s.trim() === '' || !Number.isFinite(n)) throw new SweepError(`not a number: "${s}"`)
  return n
}

/** Numeric range a..b[:step] (default step 1); fp noise is rounded away. */
function range(a: number, b: number, step: number) {
  if (!(step > 0)) throw new SweepError('step must be > 0')
  if (b < a) throw new SweepError(`empty range ${a}..${b}`)
  const n = Math.floor((b - a) / step + 1e-9)
  return Array.from({ length: n + 1 }, (_, i) => Number((a + i * step).toFixed(12)))
}

/**
 * `<path>=<values>` where values is `a..b[:step]` (numbers), `[a]..[b][:step]` (one-element arrays, e.g.
 * lookbacks), or a comma list of JSON values / bare strings (`total,skip1`).
 */
export function parseSweep(spec: string): SweepSpec {
  const eq = spec.indexOf('=')
  if (eq <= 0) throw new SweepError(`expected <path>=<values>, got "${spec}"`)
  const path = spec.slice(0, eq).trim()
  const v = spec.slice(eq + 1).trim()
  const m = /^(\[)?([^\]]*?)\]?\.\.(\[)?([^\]:]*?)\]?(?::(.+))?$/.exec(v)
  if (m) {
    const xs = range(num(m[2]!), num(m[4]!), m[5] === undefined ? 1 : num(m[5]))
    return { path, values: m[1] && m[3] ? xs.map((x) => [x]) : xs }
  }
  const values = v.split(',').map((s) => {
    try {
      return JSON.parse(s) as unknown
    } catch {
      return s.trim()
    }
  })
  return { path, values }
}

/** Returns a copy of `config` with `path` set to `value`; `[*]` sets every element. Unknown parents are errors. */
export function setPath(config: StrategyInput, path: string, value: unknown): StrategyInput {
  const keys = path.match(/[^.[\]]+|\[\*\]/g)
  if (!keys) throw new SweepError(`bad path "${path}"`)
  const out = structuredClone(config) as unknown
  const set = (node: unknown, i: number): void => {
    if (node === null || typeof node !== 'object') throw new SweepError(`path "${path}" does not exist in config`)
    const k = keys[i]!
    const targets = k === '[*]' ? (Array.isArray(node) ? node.map((_, j) => j) : []) : [k]
    if (k === '[*]' && !Array.isArray(node)) throw new SweepError(`"[*]" in "${path}" is not on an array`)
    for (const t of targets) {
      const obj = node as Record<string | number, unknown>
      if (i === keys.length - 1) obj[t] = structuredClone(value)
      else set(obj[t], i + 1)
    }
  }
  set(out, 0)
  return out as StrategyInput
}

export interface SweepRun {
  value: unknown
  result: BacktestResult
}

/**
 * Run the config once per sweep value. The path is applied to the parsed config, so defaulted keys
 * (e.g. `settings.costPct` when `settings` was omitted) can be swept. Throws like `backtest`
 * (ZodError / DataError) on the first failure.
 */
export function sweep(config: StrategyInput, spec: SweepSpec, data: MonthlyData): SweepRun[] {
  const full = parseConfig(config)
  return spec.values.map((value) => ({ value, result: backtest(setPath(full, spec.path, value), data) }))
}
