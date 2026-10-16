# MultiGEM Strategy Lab

A backtester for GEM-style dual-momentum strategies (classic GEM, extended universes,
multi-lookback and multi-sleeve variants). It runs on about 30 years of monthly total-return data,
with a web dashboard to build, compare and stress-test parameters, and a CLI so scripts and AI agents
can run backtests headlessly. The engine is pure TypeScript and shared by the CLI and the web app.

> **Not investment advice.** This is an educational research tool. Past backtest results do not
> predict future returns. Monthly data understates intramonth falls. Nothing here is a recommendation
> to buy or sell any asset.

## Quickstart

Requirements: Node `^22.18.0 || >=23.6.0`, pnpm 11, and [uv](https://docs.astral.sh/uv/) with Python ≥ 3.12 (only for the data pipeline).

```bash
pnpm install
pnpm --filter web dev        # dashboard at the URL printed by Vite
```

Without real data the dashboard runs in **demo mode** on synthetic data and shows a banner saying so.
Demo numbers are not market results.

## Getting the data

Real market data is not in this repository. You build it locally from free sources:

```bash
cd data/pipeline && uv run python -m pipeline.build
```

It writes `data/processed/monthly.csv`, `data/processed/assets.json` and `data/processed/sanity.md`.
The first run is slow because msci.com requests are throttled; later runs use the cache in `data/raw/`.
Refresh monthly by rerunning the command. Full details, sources and checks: [docs/DATA.md](docs/DATA.md)
(see also [§Getting the data](docs/README.md#getting-the-data)).

`data/sample/` is committed synthetic data in the same format, for tests, CI and demo mode. It is not real market data.

## CLI

```bash
# one strategy → JSON result on stdout
pnpm backtest --config presets/classic-gem.json

# compare several strategies → metrics table
pnpm backtest --config presets/classic-gem.json --config presets/multigem.json --compare --format table

# sensitivity to one parameter
pnpm backtest --config presets/classic-gem.json --sweep "sleeves[0].lookbacks=[1]..[12]"

# rolling-start analysis: 10-year CAGR for every start year
pnpm backtest --config presets/classic-gem.json --rolling 10 --metric cagr

# what to hold now (educational; uses data up to the last month)
pnpm backtest --config presets/classic-gem.json --signal

# no real data yet? use the committed synthetic sample
pnpm backtest --config presets/classic-gem.json --data data/sample/monthly.csv --format table
```

Exit codes: `0` ok, `1` invalid config, `2` data error or insufficient data.

Presets live in [presets/](presets/): `classic-gem`, `gem-em`, `multigem`, `multisleeve`.

## Documentation

- [docs/README.md](docs/README.md): index for humans and agents, status, precedence rules
- [docs/PRD.md](docs/PRD.md): goals, scope, non-goals, assumed decisions
- [docs/STRATEGY_SPEC.md](docs/STRATEGY_SPEC.md): the strategy math (source of truth for the engine)
- [docs/DATA.md](docs/DATA.md): data sources, splices, licensing
- [docs/VALIDATION.md](docs/VALIDATION.md): classic GEM checked against published figures
- [docs/ROADMAP.md](docs/ROADMAP.md): milestones and task status
- [CLAUDE.md](CLAUDE.md): rules for contributors and AI agents

## Data licensing

Market data is not redistributed in this repository. You fetch it yourself and are responsible for complying
with each source's terms (for example, MSCI data is for personal, non-commercial use only). See [docs/DATA.md](docs/DATA.md#licensing-owner-decision).

## Credits

- Dashboard forked from [shadcn-admin](https://github.com/satnaing/shadcn-admin) (MIT).
- Data sources: Yahoo Finance, MSCI, FRED (St. Louis Fed), OECD, National Bank of Poland, World Gold Council, Vanguard (VGTSX).
- Strategy: GEM (Global Equities Momentum) by Gary Antonacci.

## License

MIT (see LICENSE); apps/web is based on satnaing/shadcn-admin (MIT).
