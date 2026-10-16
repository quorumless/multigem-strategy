# CLAUDE.md

MultiGEM Strategy Lab — backtests GEM-style dual-momentum strategies (classic GEM, extended
universes, multi-lookback, multi-sleeve) on 35+ years of monthly total-return data, with a
dashboard to build, compare and stress-test parameter choices, and a CLI so AI agents can run
backtests headlessly.

## Read first
| Working on… | Read |
|---|---|
| Anything | `docs/README.md` (index, status, precedence), then `docs/PRD.md` (goals, scope, non-goals, assumed decisions) |
| Engine / metrics / CLI | `docs/STRATEGY_SPEC.md` — the math source of truth |
| Data pipeline / assets | `docs/DATA.md` |
| Picking the next task | `docs/ROADMAP.md` |

If code and `STRATEGY_SPEC.md` disagree, the spec wins — fix the code or propose a spec change
explicitly; never silently diverge.

## How to work: coordinate subagents
Act as a coordinator, not a solo implementer. For every task:
- Split work into independent units and run them **in parallel** (multiple Agent calls in one
  message). Serialize only real dependencies.
- Pick the model per unit: `haiku` for search/lookups/mechanical edits, `sonnet` for routine
  implementation and tests, `opus` for engine math, timing/look-ahead logic, architecture and
  reviews.
- Give each subagent a self-contained prompt (files, spec sections, done-when check). Use
  `isolation: "worktree"` when parallel agents edit overlapping files.
- You own integration: verify results (tests, build), resolve conflicts, update ROADMAP.

## Repo layout (target — see ROADMAP M0)
```
data/
  pipeline/          # Python (uv): fetch + clean + splice → processed files
  processed/         # committed: monthly.csv, assets.json (engine input)
packages/engine/     # pure TypeScript: config schema (zod), backtest, metrics, CLI (src/cli.ts)
apps/web/            # dashboard, forked from satnaing/shadcn-admin (Vite, React 19,
                     # TanStack Router, Recharts, zustand, Tailwind 4); runs engine in-browser
presets/             # strategy configs as JSON (same format as CLI + web export)
docs/
```

## Stack
- pnpm workspaces, TypeScript strict, Vite, Vitest.
- zod 4 for the strategy config; JSON Schema generated from it (`packages/engine/config.schema.json`).
- Python ≥3.12 via `uv` for `data/pipeline` only. No Python at runtime.
- Node ≥22.18 (or 23.6+): the `backtest` script runs `node src/cli.ts` via native type stripping.
  CI uses Node 24. `engines` in `package.json` should say the same.
- No backend, no database, no auth. Static site. Saved strategies = localStorage + JSON import/export.

## Commands
Status: M0 scripts exist for `test`, `typecheck`, `lint` and `web build`; `backtest` and the
pipeline build are stubs. Commands below are the planned interface; each becomes real in the
ROADMAP milestone shown. Update this block when a script lands.
- `pnpm install`, `pnpm test`, `pnpm --filter web dev` → M0
- `pnpm backtest …` → M3
- `uv run python -m pipeline.build` → M1
```bash
pnpm install
pnpm test                         # all Vitest suites
pnpm --filter web dev             # dashboard
pnpm backtest --config presets/classic-gem.json            # → JSON result on stdout
pnpm backtest --config a.json --config b.json --compare    # → metrics table
pnpm backtest --config x.json --sweep lookback=1..12       # sensitivity
cd data/pipeline && uv run python -m pipeline.build        # refresh data/processed
```

## Golden rules
1. **No look-ahead.** A decision at month-end `t` may only use data ≤ `t`, and earns returns
   from `t+1` on (see spec §Timing). Every engine change touching timing needs a test proving it.
2. **Total return everywhere.** Never use price-only series for assets that pay dividends/coupons.
3. **Signals are computed in USD.** Reporting currency only affects displayed values, costs and taxes.
4. **Engine is pure.** `packages/engine` does no I/O except in `cli.ts`; same input → identical output.
5. **Web and CLI share the engine.** Never reimplement strategy math in `apps/web`.
6. **Tests gate merges.** Synthetic hand-computed fixtures for math; snapshot tests on real data
   for regressions. Changing a snapshot requires stating why in the commit message.
7. **Data files are generated.** Never hand-edit `data/processed/*`; change the pipeline and rerun.
8. **Keep it small.** No speculative abstractions, no new deps for what a few lines do.
   Out-of-scope features are listed in PRD §Non-goals — don't build them.

## Conventions
- Dates: month-end as `YYYY-MM` strings in data and configs.
- Returns as decimals (0.05 = 5%), never percent, until the UI formats them.
- Asset IDs: uppercase short codes defined in `assets.json` (e.g. `US`, `DEVXUS`, `EM`, `GOLD`).
- Docs and code in English.
