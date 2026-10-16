# Data — sources, splices, asset mapping

Free sources only. Monthly, month-end, **USD total return**. Built by `data/pipeline`
(M1, implemented; data v2 through 2026-09). Outputs: `data/processed/monthly.csv`,
`data/processed/assets.json`, `data/processed/sanity.md`.

Items marked **OWNER** need a decision (PRD §8). Everything else is verified by the pipeline's
sanity checks unless marked **CHECK**.

## Output contract
- `data/processed/monthly.csv`: `date` (`YYYY-MM`) + one column per asset ID (TR index level,
  base 100 at the asset's first level) + `FX_PLN`, `FX_EUR` (currency per 1 USD). Empty = no data.
  Sorted ascending. Table starts 1988-01; cut-off = last complete month.
- `data/processed/assets.json`: per asset: `id, name, role, firstDate, segments: [{source,
  ticker/series, from, to, gate?, proxy?}], ucits: [{name, isin?, note?}], notes`.
- First date = base-level month; the first usable return is one month later.
- The pipeline exits 0 only when every asset meets its target or its documented fallback. It exits
  1 if any asset starts later than its fallback.

## Splicing
Proxy chain = ordered segments. Chain-link at the splice month: the later segment is rescaled so
its level equals the earlier segment's at the splice date; only returns from each segment are used.
Prefer the segment closest to the investable product for recent periods.
Each splice logs overlap length, correlation of overlapping returns and annualised tracking
difference (TD) to `sanity.md`.

## Acceptance gate for pre-1997 proxies
`transform.gate(cand, ref, end, min_corr=0.98, tol_pp=2.0)`. A candidate passes if its correlation
with the reference index is ≥ 0.98 and every full calendar year in the overlap is within ±2 pp of
the reference. Segments flagged `gate` in `ASSETS` are checked inside `build_asset`, and the build
aborts if they fail. `sanity.md` lists the used segment and each rejected candidate.

## Assets

| ID | Segments (oldest → newest) | First date (fallback) | Splices and verification |
|---|---|---|---|
| US | Yahoo `^SP500TR` daily adj. close → month-end | 1988-01 | No splice. Verified: 2008 −37.0%, 2013 +32.4%, 2022 −18.1%. |
| DEVXUS | msci.com `991000` (MSCI World ex USA), NETR, USD | **1997-01** | No splice. Code verified: 2008 −43.6%, 2009 +33.7%. Pre-1997 history is not available free (see Pre-1997 search). |
| EM | msci.com `891800` (MSCI EM): GRTR 1997-01 to 2000-12 → NETR from 2001-01 | **1997-01** | GRTR→NETR splice 2000-12: corr 1.000, TD −0.35%/yr. Verified: 1998 −25.3%, 1999 +66.4% (match published), 2008 −53.3%, 2009 +78.5%. NETR for this code only exists from 2000-12-29, so the earlier part is gross. VEIEX (1994-05 onward) rejected by the gate. |
| ACWXUS | Yahoo `VGTSX` adj. close 1996-04 to 1997-01 (**gate: passed**) → msci.com `899901` (MSCI ACWI ex USA): GRTR 1997-02 to 2000-12 → NETR from 2001-01 | **1996-04** | VGTSX vs MSCI GRTR 1997–2000: corr 0.998; calendar years within 1.1 pp. Full-history VGTSX vs ACWXUS GRTR: 356 months, corr 0.993, TD +0.54%/yr. GRTR→NETR splice 2000-12: corr 1.000, TD −0.45%/yr. Verified: 2008 −45.5%, 2009 +41.5%, 2013 +15.3%. |
| AGG | Yahoo `VBMFX` adj. close | 1988-01 | Fund history from 1986-12, table cut at 1988-01. Verified: 2008 +5.1%, 2022 −13.2%. |
| LTT | Yahoo `VUSTX` adj. close | 1988-01 | Fund history from 1986-05, table cut at 1988-01. |
| TBILL | FRED `TB3MS`; r[t] = TB3MS[t−1] / 1200 (STRATEGY_SPEC §1); base 100 at 1988-01 | 1988-01 | Timing pinned by pytest. |
| GOLD | World Gold Council chart API `https://fsapi.gold.org/api/goldprice/v11/chart/price/usd/oz/{startMs},{endMs}`: daily LBMA PM USD/oz, fetched per year, last observation of the month | 1988-01 | Keyless, undocumented endpoint. Verified: 2008-10-31 = 730.75; 2008 +4.3%, 2013 −27.3%. Month-end gaps: none > 4 days. **CHECK**: relies on an undocumented endpoint. |
| BCOM | Yahoo `PCRIX` adj. close (2002-07 to 2006-10, actively managed fund) → Yahoo `DJP` (iPath Bloomberg Commodity TR ETN) | 2002-07 (PRD §8.9) | 2006-10 splice: 239 months, corr 0.962, TD −1.76%/yr. DJP is an ETN on BCOM TR: issuer credit risk, ~0.7% fee. **OWNER**: accept the PCRIX segment, or start at 2006-10. |
| FX_EUR | FRED `DEXUSEU` (USD per EUR), last observation of month, inverted to EUR per USD | 1999-01 (PRD §8.10) | Do not use `EXUSEU` (monthly average). |
| FX_PLN | FRED `CCUSSP01PLM650N` (OECD end-of-period spot, USD per PLN, inverted) 1995-01 to 2001-12 → NBP API table A USD mid, last fixing of month, from 2002-01 | 1995-01 (PRD §8.10) | OECD vs NBP over 264 overlapping months: mean absolute deviation 0.0002%, max 0.03%. No rescale applied to FX. |

### Effect on strategy start dates
- Classic GEM (ACWXUS, US, AGG, TBILL) runs from 1997-04, after the 12-month warm-up.
- gem-em (DEVXUS, EM) runs from 1998-01.
- Strategies using only US, bonds, gold or T-bills reach back to 1988.
- Gross TR is used for EM and ACWXUS before 2001. It overstates net return by about 0.3–0.5%/yr over 1997–2000.

### UCITS candidates
- US: iShares Core S&P 500 UCITS (CSPX), Vanguard S&P 500 UCITS (VUAA).
- DEVXUS: Xtrackers MSCI World ex USA (EXUS). ⚠️ Verify ISIN.
- EM: iShares Core MSCI EM IMI UCITS (EIMI). ⚠️ Verify ISIN.
- ACWXUS: **Xtrackers FTSE All-World ex US UCITS ETF 1C (AWEX), ISIN IE000YKHGYN2**, Irish-domiciled,
  accumulating, TER 0.15%. It tracks **FTSE All-World ex US, not MSCI ACWI ex USA**, so it is a
  near-equivalent, not the same index. No UCITS ETF tracking MSCI ACWI ex USA was found. Source: justETF;
  the issuer KID confirms name, ISIN and benchmark.
- AGG: iShares Core US Aggregate Bond UCITS. ⚠️ Verify ISIN.
- LTT: iShares $ Treasury Bond 20+yr (IDTL/DTLA). ⚠️ Verify ISIN.
- TBILL: iShares $ Treasury Bond 0–1yr (IB01). ⚠️ Verify ISIN.
- GOLD: iShares Physical Gold (IGLN), Invesco Physical Gold (SGLD), Xetra-Gold (4GLD).
- BCOM: DJP is the closest recent segment. Buyable UCITS candidates: iShares Diversified Commodity
  Swap, UBS CMCI Composite (⚠️ verify).

## Pre-1997 search

The msci.com index-level API refuses any date before 1997-01-01 for every index code and variant
tried (GRTR, NETR, STRD) for 990300 (EAFE), 991000, 891800 and 899901. When a request range spans
2000-12-29, it returns only rows from that date. The pipeline therefore requests history in two
parts: 1997-01-01 to 2000-11-30, then decade chunks from 2000-12-01.

Candidates evaluated against the gate:

| Candidate | Used as | Result |
|---|---|---|
| VGTSX | ACWXUS, 1996-04 to 1997-01 | **Passed**: corr 0.998; calendar years within 1.1 pp |
| VEIEX | EM, 1994-05 to 2000-12 | Failed: corr 0.968; 1998 −18.2% vs −25.3%; 2000 −27.6% vs −30.6% |
| VGTSX | DEVXUS | Failed: corr 0.995; includes EM; 1998 +15.6% vs +19.1% |
| VGTSX | EM | Failed: corr 0.821 |
| Ken French regional returns | DEVXUS, EM | Rejected by owner: DEVXUS 1999 off by 9.6 pp; EM pre-1995 far from MSCI |

Not usable:
- VEURX + VPACX (both 1990-06) → EAFE: no free historical Europe or Pacific weights. Fixed weights
  are wrong: Japan is about 45% of EAFE in 1990 and about 20% in 1999.
- Yahoo `^990100-USD-STRD` and similar: price-only.
- EFA (2001), IEFA, VTMGX (1999-08), Fidelity Spartan International Index (1997): no earlier than msci.com.

Unchecked: published pre-1997 years (EAFE 1990 −23.2%, 1991 +12.1%, 1993 +32.6%, 1995 +11.2%; EM 1990
−10.6%, 1991 +59.9%, 1993 +74.8%, 1994 −7.3%). No free candidate of index quality covers them, so EM
1994-05 to 1996 has no accepted source.

## Sanity checks (pipeline, data v2)
- Calendar-year returns: all checks within tolerance, including DEVXUS 1998 and 1999 and EM 1998 and
  1999 (match published). US, EM 2008 and 2009, DEVXUS 2008, AGG and GOLD also pass.
- No month has |r| > 40% without a note.
- Pipeline status: ruff passed, pytest 10 passed, exit 0.

## Rejected and blocked sources
- Yahoo `^990100-USD-STRD` and similar MSCI "STRD" tickers: price-only. Rejected (TR required).
- Yahoo `^BCOMTR`, `^BCOM`, `^SPBCOMTR`: no data or delisted.
- Stooq `usdpln`: JavaScript proof-of-work challenge. Not circumvented.
- LBMA `prices.lbma.org.uk/json/gold_pm.json`: Cloudflare 403.
- datahub / `datasets/gold-prices` (World Bank Pink Sheet): monthly average, not month-end. Rejected.
- FRED LBMA gold series (e.g. `GOLDPMGBD228NLBM`): discontinued.
- FRED `DEXPLUS`: not available.
- Bundesbank gold series (`BBK01/WT5511`, `BBEX3/…XAU…`): 404 for the IDs tried.
- NBP archive CSV paths: guessed, 404. The NBP API is used instead (367-day limit per query, so fetched per year).
- French `Emerging_3_Factors_CSV.zip`: 404. Ken French regional data: removed (see Pre-1997 search).
- msci.com `downloadLevelData`: HTTP 500 with every parameter set tried. `getIndexDataLevelHistory`: 404.

## Operational notes
- msci.com (Akamai WAF) IP-blocked the host for about 30 minutes after about 250 requests. The
  pipeline throttles to 3 s per request and caches every response in `data/raw/` (gitignored).
- FRED stalls on `User-Agent: Mozilla/5.0`. The pipeline sends the default requests UA to FRED,
  gold and NBP, and the browser UA only to msci.com.
- Yahoo is fetched daily (`interval=1d`, `auto_adjust=True`) and resampled to month-end. Monthly bars are not used.
- Current-year gold and NBP caches are always refetched. Other cache files persist. To force a
  refresh, delete the relevant files in `data/raw/`.
- `data/processed/monthly.csv` is tracked in git. The v2 change altered DEVXUS, EM and ACWXUS history,
  so downstream snapshots and the web copy of the data must be regenerated.

## Correlation reference (approximate, regime-dependent; the app computes real ones)
Gold–silver 0.75–0.85 · gold–equities ~0 · gold–BCOM 0.3–0.4 · BCOM–equities 0.3–0.5 since 2008 ·
US–ex-US equities 0.8–0.9 · AGG–LTT 0.8–0.9 · LTT–equities negative 2000–2021, positive before
2000 and since 2022.

## Refresh procedure
`cd data/pipeline && uv run python -m pipeline.build` → review the diff of `data/processed/`,
`sanity.md` and the gate table → `pnpm test` (snapshot tests flag changed history). Update snapshots
only for appended months or documented source fixes.

## Open questions (OWNER)
Resolved (owner, data v2): the Ken French back-fill is rejected (PRD §8.12). DEVXUS and EM start
1997-01; ACWXUS starts 1996-04 via VGTSX.

1. Accept the 1997 start for DEVXUS, EM and ACWXUS (about 7 years later than the original 1990 target)?
   A US/AGG/GOLD-only backtest still reaches 1988.
2. Accept ACWXUS 1996-04 via VGTSX for 9 extra months? Easy to drop by removing the VGTSX segment.
3. Accept gross-before-net for EM and ACWXUS in 1997–2000 (about 0.4 pp/yr over 4 years)?
4. Accept BCOM from 2002-07 via PCRIX until 2006-10, or start BCOM at 2006-10?
5. GOLD relies on an undocumented WGC endpoint. Acceptable, or add a second source later?
6. A licensed MSCI history (1987+) could replace the pre-1997 data later. The code only needs a segment
   appended in `ASSETS`.
7. ISINs and TERs for the remaining UCITS candidates are unverified.

## Licensing (owner decision)
The public repo is published **without data**. Real data stays local.
- `data/processed/` is **gitignored and never committed**. Users build it locally with the pipeline
  (see README §Getting the data).
- `data/sample/` is a **committed synthetic dataset** in the same format, generated by
  `uv run python -m pipeline.sample`. It is for tests, CI and demo mode. It is **not real market data**.
- No public deploy with real data. The public repo is code only (PRD §8.3).

Per-source terms summary:
- **MSCI** (`991000`, `891800`, `899901`): personal and non-commercial use only. Do not redistribute.
- **Yahoo Finance** (`^SP500TR`, `VBMFX`, `VUSTX`, `PCRIX`, `DJP`, `VGTSX`): no redistribution.
- **LBMA gold via WGC** (`fsapi.gold.org`): restricted. Keyless, undocumented endpoint; do not redistribute.
- **FRED** (`TB3MS`, `DEXUSEU`, `CCUSSP01PLM650N`), **NBP**, **OECD**: fine with attribution.
- Ken French data is no longer used.
