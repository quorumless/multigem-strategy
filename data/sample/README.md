# Sample data — SYNTHETIC SAMPLE — not real market data

Fake, seeded random-walk data for tests and CI. It has the same files, columns and first dates as
`data/processed/` but **no real prices**; the numbers mean nothing. It includes a 2008-style
episode (equities fall below T-bills through 2008, recover in 2009–2010) so strategy tests can
exercise a switch to bonds. Every asset in `assets.json` has `"synthetic": true`.

Regenerate: `cd data/pipeline && uv run python -m pipeline.sample` (deterministic).

## Real data
Real data is not committed. Build it locally (needs network; free sources only):
`cd data/pipeline && uv sync && uv run python -m pipeline.build` — writes `data/processed/`.
See `docs/DATA.md` for sources and licensing.
