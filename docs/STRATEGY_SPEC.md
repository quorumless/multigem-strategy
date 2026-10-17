# Strategy Spec — source of truth for the engine

Every rule here must have a synthetic fixture test in `packages/engine`. Notation: months indexed
`t`; `P[a][t]` = USD total-return index level of asset `a` at month-end `t`;
`r[a][t] = P[a][t] / P[a][t-1] - 1`.

## 1. Inputs
- `monthly.csv`: `date` (`YYYY-MM`), one column per asset ID (USD TR index level), plus FX columns
  `FX_PLN`, `FX_EUR` = units of that currency per 1 USD at month-end. Empty cell = no data.
- Strategy config (zod schema, see §8).
- TBILL index is built by the pipeline: `r[TBILL][t] = TB3MS[t-1] / 1200` (TB3MS is an annualised
  %, monthly average — using the prior month's value avoids same-month leakage into the hurdle).

## 2. Strategy structure
```
Strategy { name, sleeves: Sleeve[], startDate?, endDate?, settings: Settings }
Sleeve   { id, weight, universe: AssetId[], lookbacks: int[], lookbackMode: 'blend'|'average',
           momentum: 'total'|'skip1', topN: int, absFilter: 'tbill'|'zero'|'off',
           safeHaven: { mode: 'fixed', asset } | { mode: 'bestOf', assets: AssetId[] },
           weighting: 'equal'|'invVol', buffer: number }
Settings { rebalance: 'monthly'|'quarterly', executionLag: 0|1, currency: 'USD'|'PLN'|'EUR',
           costPct, fxCostPct, tax: { enabled, rate } }
```
Sleeve weights must sum to 1 (±1e-9), else validation error.

## 3. Parameters and defaults
| Param | Default | Notes |
|---|---|---|
| rebalance | monthly | quarterly = only Mar/Jun/Sep/Dec month-ends |
| executionLag | 0 | 0: trade at signal close; 1: trade one month later (pessimistic) |
| momentum | total | `skip1` = 12-1 style, skips most recent month |
| lookbacks | [12] | months, each 1–12 |
| lookbackMode | blend | only matters with >1 lookback |
| topN | 1 | ≤ universe size |
| absFilter | tbill | |
| safeHaven | fixed AGG | |
| weighting | equal | invVol uses 12-month stdev of monthly returns |
| buffer | 0 | decimal, e.g. 0.01 = 1 pp |
| costPct | 0.001 | per unit of turnover |
| fxCostPct | 0 | applied only when currency ≠ USD |
| tax | disabled, rate 0.19 | |

## 4. Signal at rebalance month `t` (per sleeve)
**Momentum score** for asset `a`, lookback `L`:
- total: `S = P[a][t] / P[a][t-L] - 1`
- skip1: `S = P[a][t-1] / P[a][t-L-1] - 1` (for L=1 equals total of month t-1)

**Hurdle** for lookback `L`: `tbill` → score of TBILL with same L and momentum mode; `zero` → 0;
`off` → -∞.

**Selection for one lookback `L`** (yields target weights summing to 1):
1. Rank universe by `S` descending; ties broken by order in `universe` array.
2. Buffer (v1: only allowed with `topN = 1`; validation error otherwise): the incumbent is the
   risky asset this sleeve selected at the previous rebalance for this L (none if the slot was in
   the safe haven). If the new leader ≠ incumbent and `S[leader] - S[incumbent] ≤ buffer`, keep
   the incumbent as the selection. The hurdle check (step 3) still applies to whichever is kept.
3. Each of the N selected slots: if `S[asset] > hurdle`, slot → asset; else slot → safe haven.
4. Slot weights: equal → `1/N` each. invVol → safe-haven slots get a fixed `1/N`; the remaining
   weight is split across risky slots proportional to `1/σ` (σ = stdev of the asset's last 12
   monthly returns). Prevents near-zero-vol cash from absorbing everything. Slots resolving to the
   same asset merge.
5. Safe haven `bestOf`: pick asset in `assets` with highest score (same L, momentum mode); no
   hurdle applied.

**Multiple lookbacks:**
- `blend`: run selection independently per L; sleeve weights = mean of per-L weight vectors.
- `average`: `S_avg[a] = mean over L of S_L[a]`, hurdle likewise averaged; run selection once.

**Strategy target weights:** `w[a] = Σ_sleeves sleeve.weight × sleeveWeights[a]`.

M2 decisions (owner: best practice):
- Buffer = 0 means the buffer is off. Exact score ties follow the tie rule in step 1.
- invVol σ = sample stdev of the last 12 monthly returns (n−1 denominator). If a risky asset's σ
  is ≤ 0 or not finite, that is a DataError (exit 2) naming the asset and month. No silent fallback.

## 5. Timing and portfolio accounting (USD)
- Warm-up: first usable decision month `t0` = earliest month where every asset referenced by the
  strategy (universe, safe havens, TBILL if used as hurdle) has ≥ `maxLookback + 1` (+1 for skip1,
  and ≥ 13 if invVol) observations. Portfolio value `V[t0] = 1`. Respect `startDate` if later.
- Decision at `t` uses data ≤ `t` only. With `executionLag = 0`, new weights are held during
  month `t+1`; with `executionLag = 1`, during month `t+2` (previous weights continue for `t+1`).
- Between rebalances weights **drift** with returns: `w'[a] = w[a](1+r[a]) / Σ w(1+r)`.
- At each rebalance, reset to target (also when the asset set is unchanged — re-weighting counts
  as turnover).
- Turnover `T = Σ_a |w_target[a] - w_drifted[a]|` (counts both sells and buys).
  Cost deducted: `V ← V × (1 - T × (costPct + (currency ≠ USD ? fxCostPct : 0)))`
  — every sell and every buy is charged, so a full switch A→B (T = 2) costs 2 × costPct.
- Initial purchase at `t0` counts as turnover 1 (cash → assets).
- Month return: `R[t+1] = Σ_a w[a] × r[a][t+1]`.
- V[t0] = 1 is recorded before the initial-buy cost, so that cost appears in the first month's return.
- With quarterly (or slower) rebalancing, t0 is still a decision month even if it is not a quarter-end.
- With executionLag = 1, the portfolio is in cash (0% return) during month t0+1. Benchmarks start
  invested in the same month as the strategy.
- Trading costs are deducted before the trade, so they reduce proceeds and the new cost basis.
- No trade in the final month; final weights are the drifted ones.
- The trade log lists only rebalances with turnover > 1e-12.
- startDate/endDate wider than the data: the range is clipped and a warning is added. Exit 2 only
  if no usable range remains.

## 6. Currency and tax
- Signals and weights never depend on currency (golden rule 3).
- Reporting value: `V_ccy[t] = V[t] × FX[t] / FX[t0]` (normalised to 1 at start). Metrics in §7
  computed on `V_ccy`. Run start is clipped to the first month with FX data for that currency.
- Tax (if enabled), in reporting currency:
  - Track per-asset average cost basis in reporting currency.
  - On each sell (reduction of an asset's holding) realised gain = proceeds − basis of units sold.
  - At the last month of each calendar year (and at run end): `tax = rate × max(0, Σ realised
    gains of that year)`; deducted from portfolio value proportionally across holdings. Losses
    don't carry to next year (simplification; real Belka allows 5-year carry-forward).
  - Unrealised gains at run end are not taxed; results show "pre-liquidation" value.
  - Tax is paid by shrinking all holdings proportionally, with cost basis scaled by the same
    factor. This is not a sale, so it realises no extra gain.
  - Trading costs likewise shrink holdings proportionally and are not a sale. Realised gains come
    only from actual weight reductions, measured on post-cost proceeds: sold amount = value after
    cost × weight change.

## 7. Metrics (on monthly reporting-currency series, n months)
Conventions (decided by owner, M2):
- Max drawdown recovery = months from trough to the first month whose value ≥ the prior peak.
  Not recovered → null. No drawdown → peak and trough dates null, recovery 0, Calmar null.
- Ulcer index = √(mean(DD_t²)) over t = 1..n (V_0 excluded).
- Switch = the set of assets with weight > 0 changes between consecutive months. The initial
  purchase is not a switch. Switches/year = switches / (n/12).
- Time-in-asset = mean of the weights held each month (drifted weights), over the n months.
- Best/worst year: full calendar years only (all 12 months inside the run). Null if none.
- Volatility, Sharpe and Sortino are null when n = 1 or when there is zero dispersion.
  Sortino downside deviation = √(mean(min(0, R − rf)²)) over all n months.
- Any ratio that would divide by zero is null, never Infinity, so results stay JSON-safe.
- A move from an empty holding (cash during the execution lag) to the first asset is not a switch.
- Relative (`relative`, vs BH_US; null with a warning if BH_US is missing):
  - `fullYears`: full calendar years used.
  - `yearsBehind`: full calendar years in which the strategy's return < BH_US's return. Ties within 1e-9
    don't count (float noise).
  - `longestBehindMonths`, with `start` and `end`: the longest stretch of the ratio
    V_strategy / V_BH_US below its running peak. The stretch starts at the ratio's peak date;
    months = recovery index − peak index; `end` is null if not recovered.
  - A strategy that is never behind gives 0 / null / null.
- Total return `V_end/V_0 - 1`; CAGR `(V_end/V_0)^(12/n) - 1`.
- Volatility: sample stdev of monthly returns × √12.
- Risk-free: TBILL monthly return (in USD; documented approximation for PLN/EUR).
- Sharpe: `mean(R - rf) × 12 / (stdev(R - rf) × √12)`.
- Sortino: `mean(R - rf) × 12 / (√(mean(min(0, R - rf)²)) × √12)`.
- Drawdown `DD[t] = V[t]/max(V[..t]) - 1`; MaxDD = min DD; report trough date, peak date, months
  to recover (null if not recovered).
- Calmar: `CAGR / |MaxDD|`. Ulcer index: `√(mean(DD²))`.
- Best/worst calendar year (partial first/last years flagged); % positive months.
- Switches/year: rebalances where the set of assets with weight > 0 changed, ÷ years.
- Time-in-asset: mean weight per asset across months.

## 8. Config & CLI contract
- zod schema in `packages/engine/src/config.ts` is canonical; `config.schema.json` generated
  from it (`z.toJSONSchema`). Presets in `presets/*.json` validate against it in CI.
- Result JSON: `{ config, range: {start, end}, metrics, series: [{date, value, drawdown,
  weights}], trades: [{date, from, to, turnover, cost, tax}], benchmarks: {BH_US, 6040, EW:
  {metrics, series}}, warnings: string[] }`.
- Key order: `config, range, metrics, series, annual, monthly, relative, trades, benchmarks, warnings`.
  `annual` = `[{year, return, full}]` and `monthly` = `[{date, return}]`; both also appear on each
  benchmark. `annual` includes partial years, with `full = false` for them.
- Sweep syntax: `--sweep <dot.path>=<values>` on the config, e.g.
  `sleeves[0].lookbacks=[1]..[12]`, `sleeves[*].topN=1..3`, `settings.costPct=0..0.01:0.002`.
  `[*]` applies the value to every sleeve. Web sensitivity page uses the same path syntax.
- CLI exit codes: 0 ok, 1 invalid config, 2 data insufficient for requested range.
- Config objects are strict: unknown keys are an error (exit 1).
- Cross-field rules (sleeve weights sum to 1; buffer requires topN = 1; topN ≤ universe size;
  startDate ≤ endDate) are enforced in zod only. They are not expressed in `config.schema.json`.
- Exit codes: 1 = invalid config; 2 = data error or insufficient data.
- Data loader: months must be consecutive and index values > 0. Null means before the asset's start.
- `trades[].signals`: flat array with one entry per (sleeve, lookback run):
  `{ sleeve, lookback: number | null, scores: Record<asset, number>, hurdle: number | null,
  picked: asset[], toSafe: boolean }`.
  - `lookback` = L for blend-mode runs; null for average mode, where `scores` are the averaged scores
    the single selection used.
  - `hurdle` = null when the absolute filter is off.
  - `picked` = risky assets that won a slot. `toSafe` = true if any slot went to the safe haven.
  - With executionLag, a trade carries the signals from its decision month.
  - Tax-only rows have `signals = []`.

## 9. Benchmarks
- `BH_US`: 100% US, no rebalancing. `6040`: 60% US / 40% AGG, monthly rebalanced.
  `EW`: equal weight of the union of all sleeves' risky universes, monthly rebalanced. Same costs/tax/currency
  settings as the strategy; same date range.
- Benchmarks ignore `executionLag` and the `rebalance` setting. BH_US never rebalances; 6040 and EW
  rebalance monthly. EW = union of the risky universes only.
- BH_US is never taxed; 6040 and EW are taxed like the strategy.
- A benchmark with missing data is skipped with a warning.
- Missing TBILL → rf = 0, with a warning.

## 10. Presets (`presets/`)
| File | Definition |
|---|---|
| classic-gem.json | 1 sleeve: [US, ACWXUS], L=[12], N=1, tbill filter, safe AGG |
| gem-em.json | 1 sleeve: [US, DEVXUS, EM], L=[12], N=1, tbill filter, safe AGG |
| multigem.json | 1 sleeve: [US, DEVXUS, EM, GOLD, BCOM, LTT], L=[3,6,9,12] blend, N=2, tbill filter, safe bestOf [AGG, TBILL] |
| multisleeve.json | Equity 60%: [US, DEVXUS, EM] safe AGG · Real 25%: [GOLD, BCOM] safe TBILL · Duration 15%: [LTT, AGG] safe TBILL; all L=[3,6,9,12] blend, N=1, tbill filter |

## 11. Current signal (`currentSignal`, PRD F9)
`currentSignal(input, data) → { asOf, tradeMonth, weights, previous, changed, signals, isRebalanceMonth }`
- `asOf` = last month in the data. Every decision uses data ≤ `asOf` only (golden rule 1).
- `tradeMonth` = `asOf` + 1 (the month the weights are held, per §5). With `executionLag = 1` it is `asOf` + 2.
- `weights` = target weights from the §4 signal at `asOf`. `previous` = weights currently held, from the
  backtest run on the same config up to `asOf`.
- `changed` = true if `weights` differ from `previous` beyond 1e-12.
- `signals` = same shape as `trades[].signals` (§8), computed at `asOf`.
- `isRebalanceMonth` = whether `tradeMonth` is a rebalance month under the config's `rebalance` setting.

