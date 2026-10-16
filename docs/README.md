# docs/ — index for humans and agents

Start here. This file says what each document owns, in what order to read them, and how to
change them. Repo-wide rules live in `../CLAUDE.md`.

## Status (as of 2026-10-15)
- M0–M9 are committed on `main`, except the optional static deploy (M9), which is not done and will not ship real data.
- M10 (What to hold now) is approved and not started.
- Last code commits: `d37dcd0` (rolling start, correlation), `e01d832` (M6–M8 pages), `33be47c` (M9 explainer, empty/error states).
- Verified: web export == CLI for a rolling 10y classic GEM run (4.15–17.36% CLI, 4.2–17.4% web); recompute ≈27 ms.
- Published: https://github.com/quorumless/multigem-strategy (public, MIT, one squashed commit of tree `8e021f7`, no market data).
- CI: first run 38923324430 passed (js 1m21s, pipeline 11s). Non-blocking warnings: actions pinned at v4/v6 run on deprecated Node 20; `ubuntu-latest` moves to Ubuntu 26 on 2026-10-19.
- The local repo is the private working copy with full history; it has no remote.

Owner decisions (2026-10-16):
- Accepted: `VALIDATION.md` (M4) and the M1 sanity report. Both are regenerated after the data change.
- Resolved (data v2, `97a139a`): the Ken French back-fill is rejected. DEVXUS and EM start 1997-01 (MSCI),
  ACWXUS starts 1996-04 (VGTSX bridge, passed the gate). Classic GEM runs 1997-04 to 2026-09 (about 29.5 years).
  VALIDATION.md and the sanity report must be regenerated on this data.
- Approved for v1: "What to hold now" (PRD F9, M10, STRATEGY_SPEC §11).
- Licensing (owner): the public repo ships without data. `data/processed/` is local only and gitignored;
  `data/sample/` is committed synthetic data for tests, CI and demo mode. No public deploy with real data (PRD §8.3).

## Getting the data
Real market data is not in the repo. Build it locally:

1. Prerequisites: [uv](https://docs.astral.sh/uv/) and Python ≥ 3.12.
2. Run: `cd data/pipeline && uv run python -m pipeline.build`
3. Output: `data/processed/monthly.csv`, `data/processed/assets.json`, `data/processed/sanity.md`.
4. Time: TBC by the pipeline owner. The first run is slow because msci.com requests are throttled to 3 s each.
   Later runs use the cache in `data/raw/`.
5. Refresh monthly: rerun the same command, then review the diff of `data/processed/` and `sanity.md`.

Without the data, the app runs in **demo mode on synthetic data** and shows a banner saying so. The CLI
hint for missing data is `--data data/sample/monthly.csv`. Real-data results (VALIDATION.md) need step 2.
Sources and their terms: DATA.md §Licensing.


## Documents

| File | Owns | Read when |
|---|---|---|
| [PRD.md](PRD.md) | Goals, users, scope, non-goals, feature acceptance criteria, assumed decisions (§8) | Deciding whether something belongs in v1 |
| [STRATEGY_SPEC.md](STRATEGY_SPEC.md) | Strategy math, timing, accounting, tax, metrics, config/CLI contract, presets | Touching `packages/engine`, CLI, or presets |
| [DATA.md](DATA.md) | Data sources, splicing rules, asset-to-proxy mapping, output file contract, licensing | Touching `data/pipeline` or `data/processed` |
| [ROADMAP.md](ROADMAP.md) | Ordered milestones, task checklist, "done when" checks | Picking the next task |

## Precedence when documents disagree
1. `STRATEGY_SPEC.md` wins on any strategy math or engine behaviour.
2. `DATA.md` wins on sources and asset definitions.
3. `PRD.md` wins on scope and product behaviour.
4. `ROADMAP.md` wins on task order only.

If two documents disagree, fix the lower-precedence one in the same change. Never silently code
against a contradiction; raise it in the change or in a spec proposal.

## Conventions every doc follows
- Stable section numbers (`§n`). Other documents and tests cite them, so do not renumber without
  updating references.
- Unverified facts are marked ⚠️ until confirmed. Remove the marker in the same change that verifies it.
- Decisions are stated once, in the document that owns them. Other documents link instead of
  restating.
- Units: returns as decimals, dates as `YYYY-MM`, asset IDs uppercase (see `../CLAUDE.md`).

## How to change these docs
- Update the owning document, then any document that cites it.
- Record a deviation from the spec inline in the affected section and note it in the ROADMAP task.
- Keep the status block above current when a milestone starts or finishes.
