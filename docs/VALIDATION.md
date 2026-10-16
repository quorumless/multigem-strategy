# M4 — Classic GEM validation against published figures

Engine: HEAD 97a139a. Data: `data/processed/monthly.csv` (through 2026-09). Classic GEM range: 1997-04..2026-09.

**Data change 2026-10-16 (97a139a).** The Ken French back-fill is gone. DEVXUS and EM now start in 1997-01 and ACWXUS
in 1996-04, all on real MSCI data, so classic GEM's first decision moved from 1991-06 to 1997-04. All windows were
rerun on the new data. Windows from 2007 on came out identical, because the post-2001 series did not change.
Config: `presets/classic-gem.json` — [US, ACWXUS], L=12 total-return momentum, T-bill hurdle, safe haven AGG,
monthly, lag 0 (trade at signal close). Unless stated, run with **no costs, no tax** (`settings.costPct = 0`).

**Window convention.** `startDate` is the first decision month and V = 1 at its close, so returns start the
following month. To match a published "YYYY–YYYY" (calendar-year) window we set `--from` to the December
before the first year. Example: `pnpm backtest --config gem-nocost.json --from 2007-12 --to 2026-06`.

## Result

Five published windows still overlap our data. Four are within the ~1 pp CAGR tolerance, and the max-drawdown
episode matches. One (StrategyIndex) is out by 2.5 pp, and that source's settings are too underspecified to explain
the gap. The BestFolio 10/1990–03/2026 figure is no longer comparable, because our data starts in 1997-04 and the
source gives no number for a later window. Drawdown size and timing and the switch count still match independent
replications closely.

| # | Source (period) | Published CAGR / MaxDD | Ours, same window | ΔCAGR | Verdict |
|---|---|---|---|---|---|
| 1 | Quant4Free, 2008–2026 | 9.1% / −20% (SPY 11.6%) | 8.38–8.47% / −21.8% (S&P 11.30%) | −0.6 to −0.7 pp | ✅ |
| 2 | Quant4Free out-of-sample, 2014–2026 | 8.4% / −20% (SPY 13.6%) | 8.56% / −21.8% (S&P 13.76%) | +0.2 pp | ✅ |
| 3 | BacktestedStrategies, 2021–2025 | 10.6% / −21.1% | 10.07% / −21.8% | −0.5 pp | ✅ |
| 4 | BestFolio blog, 10/1990–03/2026 (10 bp costs) | ~11.3% (snippet only) | not comparable: our data starts 1997-04 (1997-04..2026-03 gives 10.28% with 10 bp costs and 10.57% gross, but that is a different window) | — | ⚪ not comparable |
| 5 | PortfolioDB, 1970–2026 (MaxDD episode only) | MaxDD −21.65%, 12/2021 → 10/2023 | −21.82%, peak 2021-12 → trough 2023-10 | — | ✅ same episode and dates |
| 6 | StrategyIndex, 2016–06/2026 | 12.3% / −17.8% | 9.80% / −21.8% | −2.5 pp | ❌ unexplained (see below) |

More agreement:
- **Switch count.** Quant4Free reports 30 switches over 2008–2026. We count 30 over 2007-12..2026-06.
- **S&P 500 benchmark (BH_US).** Matches SPY within 0.2–0.3 pp (rows 1–2). Its −50.95% max drawdown over the
  full run matches the −50.9% S&P drawdown quoted in an SSRN study (snippet only), which covers the 2007–09 crash.
- **Max drawdown.** Ours is −21.82% over the full 1997-04..2026-09 run. The book's −22.7% (1974–2013), SVRN's
  −19.07% replication and ReSolve's −19.1% sit in the same range. The worst episode differs by period: ours is
  2022, which also matches the SSRN snippet ("deepest drawdown in 55 years in 2021–22").

Full run (1997-04..2026-09, no costs): GEM CAGR **10.90%**, MaxDD −21.82% (peak 2021-12, trough 2023-10), vol
12.83%, Sharpe 0.70, 1.26 switches/yr. S&P 500 over the same run: 9.93% / −50.95%. With the preset's default 10 bp
costs: 10.62% / −22.60%.

### Not directly comparable (no window overlap)
The book reports 17.43% CAGR, −22.7% MaxDD and Sharpe 0.87 for 1974–2013. Replications: SVRN 16.70% / −19.07%,
ReSolve 15.2% (1950–2018). Our data starts in 1997-04, and no published source breaks those runs down for
1997–2013. The higher pre-1990 numbers come from the 1970s–80s, when GEM captured long equity and bond trends;
CXO notes the falling-rate bond tailwind. That is consistent with our lower 1997+ CAGR, not a contradiction.

## Why our numbers differ from the published ones

1. **Ex-US index variant.** `ACWXUS` is MSCI ACWI ex USA **net** total return. Antonacci and others often use
   gross, which is ~0.3–0.4%/yr higher on the ex-US leg.
2. **ETFs vs indexes.** Rows 1–4 and 6 trade ETFs (SPY, VEU or ACWX, AGG, BIL) or proxies, and their returns
   carry expense ratios and tracking error. Our US series is the S&P 500 TR index (`^SP500TR`) with no fees. Our
   AGG is the VBMFX fund (Vanguard Total Bond Market Index, Investor shares), which has a fee. Our ex-US series
   is an index. VEU (FTSE All-World ex US) also tracks a different index from ACWX/MSCI.
3. **Costs.** We report gross numbers here. BestFolio charges 10 bp one-way, which is roughly our default
   `costPct = 0.001` per unit of turnover. At about 1 switch/yr the cost drag is ~0.25 pp/yr (11.79% → 11.55%).
4. **Timing.** We use month-end index levels, decide at the close of t and earn from t+1 (lag 0). BestFolio
   fills at the signal-day close, which is the same convention. Some ETF backtests use the last trading day's
   close of the ETF rather than the month-end index value, and a few fill at the next open. Our `executionLag = 1`
   option is a pessimistic bound on this.
5. **Hurdle.** Our T-bill index is built from FRED TB3MS with the prior month's yield
   (`r[t] = TB3MS[t-1]/1200`). BIL- or IRX-based hurdles differ slightly, which matters only when the leader's
   12-month return is close to the hurdle. ReSolve uses "S&P 500 12m return > 0", not a T-bill hurdle.
6. **Row 6 (StrategyIndex).** It trades VOO/VXUS/BND and says the signals use indices, but doesn't name which
   ones. It reports zero slippage and data through 2026-06-30. VXUS (FTSE Global All Cap ex US) and BND differ
   from ACWX/AGG, but that doesn't plausibly explain 2.5 pp/yr. A 2016 start date could also change the first
   holding, depending on how the 12-month signal is warmed up. I can't reproduce their settings from the page,
   so I'm flagging this rather than explaining it away.

## Sources
- Quant4Free — https://quant4free.com/analysis/dual-momentum/ (read; SPY/VEU/AGG/BIL, 12m, monthly; fill price and costs not stated)
- BacktestedStrategies — https://www.backtestedstrategies.com/strategies/dual-momentum-backtest/ (read; SPY/ACWX/AGG, 3-mo Treasury hurdle; 2021–2025 free metrics only)
- BestFolio — https://bestfolio.app/strategies/gem (read; strategy page 1986–2026 13.3%, −33.7% on daily ETF data with stand-ins). The 10/1990–03/2026 ~11.3% figure is from a search snippet of their blog (second-hand).
- PortfolioDB — https://www.portfoliodb.com/portfolios/gem-dual-momentum (read; SPY/EFA/AGG, T-bill hurdle; page has internal inconsistencies, so only the MaxDD episode is used)
- StrategyIndex — https://strategyindex.io/gem.html (read; VOO/VXUS/BND, zero slippage)
- CXO Advisory on the book — https://www.cxoadvisory.com/momentum-investing/a-few-notes-on-dual-momentum-investing/ (read; quotes the book's 1974–2013 figures)
- SVRN (Samuel Lee) replication — https://www.svrn.co/blog/2015/8/2/is-gary-antonaccis-global-equity-momentum-strategy-robust (read)
- ReSolve, "GEM: A Craftsman's Perspective" — https://investresolve.com/inc/uploads/pdf/global-equity-momentum-a-craftsmans-perspective.pdf (read)
- SSRN (Petit) — https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7427878 (403; figures from search snippet only)
- optimalmomentum.com (Antonacci) and AllocateSmartly could not be fetched (403 and 404), so they are not used.

## Reproduce
```bash
# gem-nocost.json = presets/classic-gem.json with "settings": {"costPct": 0}
pnpm backtest --config gem-nocost.json --from 2007-12 --to 2026-09 --format table   # row 1
pnpm backtest --config gem-nocost.json --from 2013-12 --format table                # row 2
pnpm backtest --config gem-nocost.json --from 2020-12 --to 2025-12 --format table   # row 3
pnpm backtest --config gem-nocost.json --from 2015-12 --to 2026-06 --format table   # row 6
```
