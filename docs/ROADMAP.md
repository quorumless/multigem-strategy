# Roadmap

Each task is sized for one agent session. Work top to bottom; a milestone is done when all its
"done when" checks pass. Tick boxes as you go and note deviations inline.

## M0 — Scaffold
- [x] pnpm workspace: `packages/engine`, `apps/web`, root `package.json` scripts (`test`, `backtest`).
- [x] Fork satnaing/shadcn-admin (MIT, keep license notice) into `apps/web`; remove Clerk, auth
      pages, faker demo data and unused demo routes; keep layout, sidebar, theme switch, tables.
      Rename its package to `web` (so `pnpm --filter web` works).
- [x] Fork's tests use Vitest browser mode (Playwright): CI runs `playwright install chromium
      --with-deps` before `pnpm test`. Engine tests stay plain Node Vitest.
- [x] `data/pipeline` uv project skeleton.
- [x] GitHub Actions: install, typecheck, lint, `pnpm test`.
- Note: all checks pass locally; first CI run passed (run 38923324430, js 1m21s, pipeline 11s). Route group `_authenticated`
  renamed to `_app`; react-query/axios/date libs dropped from the fork (unused).
- Done when: `pnpm install && pnpm test && pnpm --filter web build` pass in CI (met, run 38923324430); app shows an
  empty dashboard shell.

## M1 — Data pipeline (Python)
- [x] Fetchers per source (Yahoo via yfinance, FRED, MSCI download, gold, Stooq FX), cached raw
      downloads in a gitignored `data/raw/`.
- [x] Monthly resampling, TR handling, splicing per DATA.md; write `monthly.csv` + `assets.json`.
- [x] Sanity report: first date per asset, splice stats, outlier months, sample annual returns.
- [x] Update DATA.md with what was actually used (remove ⚠️ where verified).
- Owner accepted the sanity report (2026-10-16), but it must be regenerated after the pre-2000 data change. Done when: every asset meets its target start (or PRD §8 fallback applied and documented);
  sanity report reviewed by the owner.

## M2 — Engine core
- [x] `config.ts` zod schema + defaults (STRATEGY_SPEC §2–3); generate `config.schema.json`.
- [x] Data loader (CSV → typed matrix) shared by CLI and web.
- [x] Signal (§4), accounting/timing (§5), currency/tax (§6), metrics (§7), benchmarks (§9).
- [x] Synthetic fixtures: 2–4 fake assets, 6–24 months, expected values computed by hand in the
      test file comments. At least one test per spec subsection, incl. a look-ahead test (changing
      data after `t` must not change the decision at `t`).
- [x] Relative metrics + trade signals (beginner UX support): `relative` vs BH_US and
      `trades[].signals` per STRATEGY_SPEC §7–8. Confirm and tick when committed.
- Done when: all fixture tests pass; engine has no I/O imports.

## M3 — CLI
- [x] `pnpm backtest --config <file>` → result JSON (§8); `--compare` (multiple configs → metrics
      table); `--sweep param=a..b[:step]`; `--format json|table`; `--from/--to`.
- [x] Presets in `presets/` (§10), validated in CI.
- Done when: every preset runs; invalid config exits 1 with readable error; output byte-identical
  across two runs.

## M4 — Real-data validation
- [x] Run classic GEM and compare with published GEM figures (Antonacci / public replications)
      over overlapping periods; differences explained in `docs/VALIDATION.md` (tolerance loose,
      e.g. CAGR within ~1 pp — data sources differ).
- [x] Snapshot tests: metrics of every preset on real data stored and asserted.
- Owner accepted VALIDATION.md (2026-10-16); regenerate after the data change. Done when: snapshots committed.

## M5 — Dashboard: builder + results
- [x] Strategy builder form (react-hook-form + zod schema reuse), presets, localStorage save,
      JSON import/export.
- [x] Results page: metrics cards, equity (log toggle) + benchmarks, drawdown, annual bars,
      monthly heatmap, allocation stacked area, trade log (TanStack Table), date range picker.
- [x] Settings: currency, costs, tax.
- [x] PRD §6b U1–U6: plain-language headline, glossary tooltips, human asset labels, preset-card
      builder with simple/advanced modes, realistic web defaults, before/after costs line, trade log sentences.
- Done when: exported JSON from web == CLI metrics for same config (verified: rolling 10y classic GEM, 4.15–17.36% CLI vs 4.2–17.4% web); recompute < 300 ms (≈27 ms).

## M6 — Compare
- [x] Select up to 5 saved strategies; overlay charts; metrics table with best highlighted;
      overlapping-range notice.

## M7 — Sensitivity + rolling start
- [x] One-parameter sweep UI (reuses engine sweep) → metric-vs-value chart.
- [x] Rolling-start: metric per start year for a fixed horizon.
- [x] PRD §6b U8: "fragile" badge (lookback ±1 sensitivity), rolling-start sentence.

## M8 — Assets & data page
- [x] Per-asset chart + source/splice info from `assets.json`.
- [x] Correlation matrix (full period + rolling 36m, pick pair → line chart).

## M9 — Polish & deploy
- [x] Monthly-data drawdown caveat, empty/error states, mobile layout check.
- [x] PRD §6b U7: "How GEM works" explainer (4 steps, diagram, real 2008 switch).
- [x] PRD §6b U8 standing caveats text (past results, monthly data).
- [ ] Optional static deploy (check DATA.md §Licensing first).

## M10 — What to hold now (approved for v1)
- [ ] Engine `currentSignal(input, data)` → `{ asOf, tradeMonth, weights, previous, changed, signals, isRebalanceMonth }`
      (STRATEGY_SPEC §11). `asOf` = last data month; the decision uses data ≤ `asOf`. Test: appending data after `asOf` does not change the output.
- [ ] CLI `--signal` flag.
- [ ] `/now` page with disclaimer and stale-data warning (PRD F9).
- Done when: web and CLI show the same weights; output matches the backtest's signal at the same month.
