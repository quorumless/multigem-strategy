# PRD — MultiGEM Strategy Lab

Status: draft v1 · Owner: Maciej · Last updated: 2026-10-15

## 1. Problem
GEM (Global Equities Momentum, Gary Antonacci's dual momentum) is popular with European retail
investors, but its results depend heavily on choices that are rarely tested together: universe,
lookback, safe-haven asset, filters, costs, currency, taxes. Existing tools either cover classic
GEM only, ignore currency/tax for a non-US investor, or can't combine variants. We want a tool to
simulate GEM and its multi-asset/multi-lookback/multi-sleeve generalisations on real history and
see how each parameter changes outcomes.

## 2. Goals
1. Backtest GEM-family strategies on the **longest reliable free history**: ~30 years (from 1988-01) for
   US, bonds, T-bills and gold; ~29 years for ex-US equity strategies (DEVXUS and EM from 1997-01, ACWXUS
   from 1996-04). Classic GEM runs 1997-04 to 2026-09 (about 29.5 years). Reliability is preferred over length.
2. Universe covers US/developed ex-US/EM equities, bonds, T-bills, **and low-correlated
   diversifiers** (gold, broad commodities, long Treasuries) — each mapped to a product an EU
   investor can buy (UCITS ETF/ETC).
3. Let the user change parameters, save variants, **compare** them, and see **sensitivity** to a
   single parameter.
4. Results viewable in USD, PLN or EUR, with optional costs and taxes.
5. **AI-friendly:** every backtest runnable headlessly via CLI with JSON in/out, deterministic,
   covered by tests.

## 3. Users
- Primary: the owner — a Polish retail investor buying through EU brokers (XTB, mBank, IBKR-EU).
- Secondary: AI coding/research agents running experiments via the CLI.

## 4. Strategy model (summary — full math in STRATEGY_SPEC.md)
A **strategy** is a weighted set of **sleeves**. Each sleeve has: risky universe, lookback set,
lookback mode (blend/average), top-N, absolute-momentum filter, safe haven, weighting, buffer.
- Classic GEM = 1 sleeve, {US, ACWXUS}, lookback {12}, N=1, filter vs T-bills, safe = AGG.
- (A) extended universe = 1 sleeve with more assets.
- (B) multi-lookback = several lookbacks in a sleeve, capital split across them.
- (C) multi-sleeve = several sleeves with fixed weights.

## 5. Asset universe (v1)
| ID | Asset | Role |
|---|---|---|
| US | S&P 500 TR | equity |
| DEVXUS | MSCI World ex USA | equity |
| EM | MSCI Emerging Markets | equity |
| ACWXUS | MSCI ACWI ex USA | equity — Classic GEM preset only |
| AGG | US Aggregate Bonds | safe haven |
| LTT | US Treasuries 20+y | diversifier / safe haven |
| TBILL | 3-month T-bills | cash, absolute-momentum hurdle |
| GOLD | Gold (spot, physically-backed ETC) | diversifier |
| BCOM | Bloomberg Commodity TR (broad basket) | diversifier |

Excluded on purpose: silver, platinum, palladium (correlated with gold), oil/energy-only,
copper/industrial metals (pro-cyclical), agriculture-only (roll-cost drag), Bitcoin (<30y history).
Sources, proxies and UCITS mappings: DATA.md.

## 6. Features (v1) and acceptance criteria

### F1 Data pipeline
- Python script produces `data/processed/monthly.csv` + `assets.json` from free sources only.
- ✅ Every asset has a monthly USD total-return index; earliest dates and splice points recorded in
  `assets.json`; pipeline fails loudly if an asset starts after its target date in DATA.md.

### F2 Engine + CLI
- Pure TS engine implementing STRATEGY_SPEC.md; zod config schema; JSON Schema exported.
- CLI: run one config, compare many, sweep one parameter; JSON (default) or table output.
- ✅ Synthetic fixture tests pass for every spec section; snapshot tests for all presets;
  identical output across repeated runs; invalid config → non-zero exit + readable zod error.

### F3 Strategy builder (web)
- Edit sleeves/params via form; load presets; save to localStorage; import/export JSON.
- ✅ An exported JSON runs in the CLI and gives identical metrics to the web view.

### F4 Results view
- Metrics: CAGR, total return, volatility, max drawdown (date + recovery months), Sharpe, Sortino,
  Calmar, Ulcer index, best/worst year, % positive months, switches/year, time-in-asset.
- Charts: equity curve (log toggle), drawdown, annual returns, monthly heatmap, allocation over
  time (stacked area), trade log table.
- Benchmarks overlay: S&P 500 buy & hold, 60/40 (US/AGG), equal-weight universe.
- Date range picker within available data.
- ✅ Recompute after a parameter change feels instant (<300 ms for a 35-year run).

### F5 Compare
- Up to 5 saved strategies: overlaid equity/drawdown curves, side-by-side metrics, best value
  highlighted. Uses the overlapping date range of all compared strategies and says so.

### F6 Sensitivity
- Pick one parameter + range (e.g. lookback 1–12, N 1–3, buffer 0–5%, cost 0–1%); chart a chosen
  metric vs parameter value.
- Rolling-start analysis: metric for every start year with a fixed holding horizon (e.g. 10y).

### F7 Assets & data
- Per-asset chart, source/splice info, correlation matrix (full period + rolling 36m).

### F8 Settings
- Reporting currency USD/PLN/EUR; cost per trade %; FX cost %; tax on/off + rate (default 19%).

### F9 What to hold now (approved for v1)
- `/now` page and `currentSignal()` in the engine, plus CLI `--signal`. Shows the target weights for the
  next trade month, what is held now, and what changed. Spec: STRATEGY_SPEC §11.
- Educational only. Show a not-investment-advice disclaimer on the page and in CLI output.
- Show a stale-data warning when `asOf` is older than the latest data month.
- ✅ Output matches the engine's backtest signal for the same config at the same month.

## 6b. Usability for non-experts
Goal: someone with no finance background can use the app. Guiding question for every screen:
"Would this have worked for me, and what would it have felt like?" Answer that before showing any ratio.

- **U1 Headline.** Plain-language summary above the metrics:
  - Growth of an amount (default 10,000 in the reporting currency) after costs and tax.
  - The same for simply buying US stocks (BH_US).
  - Worst fall with its dates and the months to get back to the previous high.
  - "Did worse than simply holding US stocks in N of M full years."
  - Primary metrics: final value, CAGR, max drawdown + recovery, years behind.
  - Sharpe, Sortino, Calmar, Ulcer and volatility go under an "Advanced" section.
- **U2 Glossary.** Every metric and parameter has an ⓘ tooltip: one-sentence meaning, which direction is
  good, typical range. Plain text lives in one web glossary file, not in the engine.
- **U3 Asset labels.** Human names plus an investable example from DATA.md's UCITS mapping
  (e.g. "US stocks (S&P 500), e.g. iShares Core S&P 500 UCITS"). Asset IDs appear only under Advanced and in JSON.
- **U4 Builder.** Opens on preset cards, one-line story each. Simple mode (default) has 3 knobs: assets,
  lookback months, safe haven. Advanced mode adds sleeves, buffer, invVol, executionLag and rebalance
  frequency. Validation messages are human, e.g. "Sleeve weights must add up to 100% (now 90%)."
- **U5 Realistic web defaults.** PLN, tax on at 19%, costs on. Show a "before vs after costs & taxes" line.
  These are the web form's defaults only; engine defaults in STRATEGY_SPEC §3 are unchanged.
- **U6 Trade log in sentences**, e.g. "Mar 2008: switched US stocks → US bonds (both stock markets were
  below T-bills)." Built from `trades[].signals` (STRATEGY_SPEC §8).
- **U7 Explainer "How GEM works".** Four steps and a diagram, walked through on the real 2008 switch.
- **U8 Overfitting guards.**
  - "Fragile" badge when the chosen metric moves a lot for lookback ±1: CAGR changes > 2 pp or max drawdown
    changes > 5 pp (web constant, reuses the sweep).
  - Rolling-start sentence: "Depending on start year, 10-year CAGR ranged X%–Y%."
  - Standing caveats: past results don't guarantee future ones; monthly data understates intramonth falls.

## 7. Non-goals (v1)
Accounts/auth, backend/DB, alerts, optimiser/auto-search,
Monte Carlo, leverage, shorting, stop-losses, intramonth/daily signals, currency hedging, i18n
(UI is English), paid data sources.

## 8. Assumed decisions — confirm
These were defaulted during discovery without an explicit "yes". Edit here if wrong; agents treat
them as decided until changed.
1. Universe in §5 is final for v1.
2. Parameter set and defaults in STRATEGY_SPEC §3 (rebalance monthly, trade at signal close,
   total-return momentum, T-bill filter, AGG safe haven, equal weight, 0% buffer).
3. Hosting: local `pnpm dev` only. **Owner decision:** there is no public deploy with real data. The public
   repo is code only; real data is built locally (DATA.md §Licensing). Any demo deploy uses synthetic data only.
4. "Current signal" view approved for v1 (F9, owner, 2026-10-16).
5. Classic GEM preset uses MSCI ACWI ex USA (as Antonacci); other presets use DEVXUS + EM.
6. Signals always computed in USD regardless of reporting currency.
7. Taxes: flat rate on net realised gains per calendar year, losses offset gains within the year
   only, no carry-forward (simplification of Polish "Belka", which allows 5-year carry-forward).
8. Currency hedging dropped from v1.
9. If free BCOM TR history can't reach 1990, BCOM starts later (strategies using it get a later
   start); no substitution with energy-heavy GSCI.
10. EUR reporting available from 1999-01; PLN from the earliest reliable free USD/PLN series
    (expected mid-1990s). Earlier dates → USD only.
11. **Decided (owner, 2026-10-16):** "What to hold now" is approved for v1 (F9).
12. **Resolved (owner, data v2):** the Ken French back-fill is rejected as unreliable and removed. The
    msci.com API refuses dates before 1997-01, so pre-1997 history was evaluated against an acceptance
    gate (correlation ≥ 0.98 and every full calendar year within ±2 pp of the MSCI series). Only
    VGTSX for ACWXUS (1996-04 to 1997-01) passed. Documented later-start fallbacks: DEVXUS and EM from
    1997-01; ACWXUS from 1996-04. Pre-2001 EM and ACWXUS use gross TR, which overstates net return by
    about 0.3–0.5 pp/yr. Reliable data is preferred over longer history. See DATA.md.

## 9. Risks
- **Free data quality** (gaps, price-only series, proxy mismatch) → proxy chains documented,
  spliced series sanity-checked against published figures.
- **Overfitting** → no optimiser; sensitivity + rolling-start views make fragility visible.
- **Monthly data understates intramonth drawdowns** → stated in the UI near drawdown metrics.
- **Correlations are regime-dependent** (e.g. stock–bond turned positive in 2022) → rolling
  correlation view.

## 10. v2 ideas
Monthly data refresh via GitHub Action, currency-hedged variants, Monte Carlo
/ block bootstrap, more assets (TIPS, managed futures once history allows), Polish UI.
