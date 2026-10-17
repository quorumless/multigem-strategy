"""Build data/processed/{monthly.csv,assets.json,sanity.md}. Run: uv run python -m pipeline.build"""

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

import pandas as pd

from . import fetch
from .transform import (
    calendar_returns,
    chain,
    check_continuous,
    gate,
    invert,
    month_end,
    outliers,
    tbill_index,
)

OUT = Path(__file__).resolve().parents[2] / "processed"
LATE_FB = (
    "later start accepted (owner: reliable data over longer history): msci.com free tool has no "
    "data before 1997-01 and no pre-1997 candidate passed the acceptance gate"
)
START = "1988-01"  # table start; nothing earlier is needed for a 1990-01 target

M = lambda code, variant: {"source": "msci.com", "ticker": code, "variant": variant}
Y = lambda t, note="", **kw: {"source": "yahoo", "ticker": t, "note": note, **kw}


ASSETS = [
    {
        "id": "US",
        "name": "S&P 500 TR",
        "role": "equity",
        "target": "1990-01",
        "segments": [Y("^SP500TR")],
        "ucits": ["iShares Core S&P 500 (CSPX)", "Vanguard S&P 500 (VUAA)"],
    },
    {
        "id": "DEVXUS",
        "name": "MSCI World ex USA",
        "role": "equity",
        "target": "1990-01",
        "fallback": LATE_FB,
        "fbTarget": "1997-01",
        "notes": "Net TR (NETR) from 1997-01 (msci.com serves World ex USA NETR back to 1997-01). "
        "VGTSX rejected: failed acceptance gate.",
        "segments": [M("991000", "NETR")],
        "ucits": ["Xtrackers MSCI World ex USA (EXUS)"],
    },
    {
        "id": "EM",
        "name": "MSCI Emerging Markets",
        "role": "equity",
        "target": "1990-01",
        "fallback": LATE_FB,
        "fbTarget": "1997-01",
        "notes": "Gross TR (GRTR) 1997-01..2000-12, Net TR from 2001-01 (gross-to-net ≈ 0.3-0.5%/yr). "
        "VEIEX (1994-05+) rejected: failed acceptance gate vs MSCI EM.",
        "segments": [M("891800", "GRTR"), M("891800", "NETR")],
        "ucits": ["iShares Core MSCI EM IMI (EIMI)"],
    },
    {
        "id": "ACWXUS",
        "name": "MSCI ACWI ex USA",
        "role": "equity — Classic GEM preset only",
        "target": "1990-01",
        "fallback": LATE_FB,
        "fbTarget": "1996-04",
        "notes": "VGTSX (Vanguard Total International Stock Index, adj. close) 1996-04..1997-01 "
        "(passed acceptance gate vs MSCI ACWI ex USA GRTR), then Gross TR to 2000-12, Net TR from 2001-01.",
        "segments": [
            Y(
                "VGTSX",
                "Vanguard Total International Stock Index (Investor)",
                gate=True,
            ),
            M("899901", "GRTR"),
            M("899901", "NETR"),
        ],
        "ucits": [
            {
                "name": "Xtrackers FTSE All-World ex US UCITS ETF 1C (AWEX)",
                "isin": "IE000YKHGYN2",
                "note": "Tracks FTSE All-World ex US, not MSCI ACWI ex USA (no UCITS ETF on the MSCI index found); "
                "issuer page etf.dws.com, TER 0.15% (justETF)",
            }
        ],
    },
    {
        "id": "AGG",
        "name": "US Aggregate Bonds",
        "role": "safe haven",
        "target": "1990-01",
        "segments": [Y("VBMFX", "Vanguard Total Bond Market Index (Investor)")],
        "ucits": ["iShares Core US Aggregate Bond UCITS"],
    },
    {
        "id": "LTT",
        "name": "US Treasuries 20+y",
        "role": "diversifier / safe haven",
        "target": "1990-01",
        "segments": [Y("VUSTX", "Vanguard Long-Term Treasury (Investor)")],
        "ucits": ["iShares $ Treasury Bond 20+yr (IDTL/DTLA)"],
    },
    {
        "id": "TBILL",
        "name": "3-month T-bills",
        "role": "cash, absolute-momentum hurdle",
        "target": "1990-01",
        "segments": [
            {
                "source": "FRED",
                "ticker": "TB3MS",
                "note": "r[t] = TB3MS[t-1]/1200, STRATEGY_SPEC §1",
            }
        ],
        "ucits": ["iShares $ Treasury Bond 0-1yr (IB01)"],
    },
    {
        "id": "GOLD",
        "name": "Gold (spot, physically-backed ETC)",
        "role": "diversifier",
        "target": "1990-01",
        "segments": [
            {
                "source": "gold.org chart API",
                "ticker": "goldprice/v11/chart/price/usd/oz",
                "note": "daily LBMA PM USD/oz, month-end observation",
            }
        ],
        "ucits": [
            "iShares Physical Gold (IGLN)",
            "Invesco Physical Gold (SGLD)",
            "Xetra-Gold (4GLD)",
        ],
    },
    {
        "id": "BCOM",
        "name": "Bloomberg Commodity TR (broad basket)",
        "role": "diversifier",
        "target": "1990-01",
        "fallback": "PRD §8.9",
        "segments": [
            Y(
                "PCRIX",
                "PIMCO CommodityRealReturn Strategy (actively managed, tracks BCOM)",
            ),
            Y("DJP", "iPath Bloomberg Commodity Index TR ETN"),
        ],
        "ucits": ["iShares Diversified Commodity Swap UCITS", "UBS CMCI Composite"],
    },
]
FX = [
    {
        "id": "FX_EUR",
        "name": "EUR per 1 USD",
        "target": "1999-01",
        "fallback": "PRD §8.10",
        "segments": [
            {
                "source": "FRED",
                "ticker": "DEXUSEU",
                "note": "USD per EUR, inverted; last obs of month",
            }
        ],
    },
    {
        "id": "FX_PLN",
        "name": "PLN per 1 USD",
        "target": "1995-01",
        "fallback": "PRD §8.10",
        "segments": [
            {
                "source": "FRED/OECD",
                "ticker": "CCUSSP01PLM650N",
                "note": "USD per PLN spot, inverted",
            },
            {
                "source": "NBP",
                "ticker": "api.nbp.pl table A USD mid",
                "note": "PLN per USD, last fixing of month",
            },
        ],
    },
]
# Pre-1997 proxy candidates that were evaluated and (if failing) not used: (asset, yahoo ticker, MSCI GRTR code)
REJECTED = [
    ("EM", "VEIEX", "891800"),
    ("DEVXUS", "VGTSX", "991000"),
    ("EM", "VGTSX", "891800"),
]
# (asset, year) -> (published calendar-year return %, tolerance in pp)
REFS = {
    ("US", 2008): (-37.0, 0.5),
    ("US", 2013): (32.4, 0.5),
    ("US", 2022): (-18.1, 0.5),
    ("EM", 2008): (-53.3, 0.5),
    ("EM", 2009): (78.5, 0.5),
    ("DEVXUS", 2008): (-43.6, 0.5),
    ("AGG", 2008): (5.2, 1.0),
    ("AGG", 2022): (-13.0, 1.0),
    ("GOLD", 2008): (4.3, 1.0),
    ("GOLD", 2013): (-27.3, 1.0),
    # MSCI EAFE / EM gross, approximate published values; DEVXUS (World ex USA) differs from EAFE by Canada
    ("DEVXUS", 1998): (20.0, 2.0),
    ("DEVXUS", 1999): (27.0, 2.0),
    ("EM", 1998): (-25.3, 2.0),
    ("EM", 1999): (66.4, 2.0),
}


def seg_levels(seg: dict, through: str) -> pd.Series:
    if seg["source"] == "yahoo":
        s = month_end(fetch.yahoo(seg["ticker"]), through)
    elif seg["source"] == "msci.com":
        s = fetch.msci(seg["ticker"], seg["variant"], 19970101, through)
        s = s[s.index <= pd.Period(through, "M")]
    elif seg["source"].startswith("gold.org"):
        s = month_end(fetch.gold(int(START[:4]) - 1, int(through[:4])), through)
    else:
        raise ValueError(seg)
    check_continuous(s, f"{seg['source']}:{seg['ticker']}")
    return s


def build_asset(a: dict, through: str) -> tuple[pd.Series, list[dict]]:
    if a["id"] == "TBILL":
        tb = fetch.fred("TB3MS")
        tb.index = tb.index.to_period("M")
        return tbill_index(tb, START, through), []
    levels = [seg_levels(s, through) for s in a["segments"]]
    lvl, stats = chain(levels)
    # acceptance gate for proxy (fund) segments: judged against the next segment, up to the
    # month the segment after that takes over
    for i, seg in enumerate(a["segments"]):
        if seg.get("gate"):
            end = (
                levels[i + 2].index[0]
                if i + 2 < len(levels)
                else pd.Period(through, "M")
            )
            g = gate(levels[i], levels[i + 1], end)
            stats[i]["gate"] = g
            if not g["passed"]:
                raise SystemExit(
                    f"{a['id']}: segment {seg['ticker']} failed acceptance gate: {g}"
                )
    return lvl, stats


def build_fx(through: str) -> tuple[dict[str, pd.Series], dict]:
    eur = invert(month_end(fetch.fred("DEXUSEU"), through))
    oecd = invert(
        fetch.fred("CCUSSP01PLM650N").set_axis(
            fetch.fred("CCUSSP01PLM650N").index.to_period("M")
        )
    )
    oecd = oecd[
        (oecd.index >= pd.Period("1995-01", "M"))
        & (oecd.index <= pd.Period(through, "M"))
    ]
    nbp = month_end(fetch.nbp_usdpln(2002, int(through[:4])), through)
    both = pd.concat([oecd, nbp], axis=1, join="inner").dropna()
    dev = (both.iloc[:, 0] / both.iloc[:, 1] - 1).abs()
    pln = pd.concat([oecd[oecd.index < nbp.index[0]], nbp])
    check_continuous(pln, "FX_PLN")
    return {"FX_EUR": eur, "FX_PLN": pln}, {
        "months": len(both),
        "meanAbsDevPct": float(dev.mean() * 100),
        "maxAbsDevPct": float(dev.max() * 100),
        "nbpFrom": str(nbp.index[0]),
    }


def fx_bounds(
    f: dict, fx: dict, fxcheck: dict, through: str
) -> tuple[list[str], list[str]]:
    first = str(fx[f["id"]].index[0])
    if len(f["segments"]) == 1:
        return [first], [through]
    cut = pd.Period(fxcheck["nbpFrom"], "M")
    return [first, str(cut)], [str(cut - 1), through]


def segment_ranges(a: dict, level: pd.Series, stats: list[dict]) -> list[dict]:
    if not stats:
        return [
            {
                **{k: v for k, v in a["segments"][0].items() if v != ""},
                "from": str(level.index[0]),
                "to": str(level.index[-1]),
            }
        ]
    bounds = [level.index[0]] + [pd.Period(s["splice"], "M") + 1 for s in stats]
    ends = [pd.Period(s["splice"], "M") for s in stats] + [level.index[-1]]
    return [
        {**{k: v for k, v in seg.items() if v != ""}, "from": str(b), "to": str(e)}
        for seg, b, e in zip(a["segments"], bounds, ends)
        if b <= e
    ]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--through",
        default=(pd.Period(dt.date.today(), "M") - 1).strftime("%Y-%m"),
        help="last complete month, YYYY-MM (default: previous calendar month)",
    )
    ap.add_argument(
        "--refresh",
        action="store_true",
        help="re-download all sources instead of using data/raw caches",
    )
    args = ap.parse_args()
    through = args.through
    fetch.REFRESH = args.refresh

    cols, assets, splices, outl = {}, [], {}, {}
    for a in ASSETS:
        lvl, stats = build_asset(a, through)
        lvl = lvl[lvl.index >= pd.Period(START, "M")]
        if lvl.empty:
            assets.append(
                {
                    **a,
                    "firstDate": None,
                    "segments": [],
                    "notes": "UNRESOLVED: no source found",
                }
            )
            continue
        cols[a["id"]], splices[a["id"]], outl[a["id"]] = lvl, stats, outliers(lvl)
        assets.append(
            {
                **a,
                "firstDate": str(lvl.index[0]),
                "segments": segment_ranges(a, lvl, stats),
            }
        )
    fx, fxcheck = build_fx(through)
    cols.update(fx)

    df = pd.DataFrame(cols).sort_index()
    df = df[df.index >= pd.Period(START, "M")]
    df.index = df.index.strftime("%Y-%m")
    df.index.name = "date"
    OUT.mkdir(parents=True, exist_ok=True)
    prev_csv = OUT / "monthly.csv"
    prev_last = (
        pd.read_csv(prev_csv, usecols=["date"])["date"].iloc[-1]
        if prev_csv.exists()
        else None
    )
    # write to temp files, os.replace all three only once everything is produced
    tmp = {n: OUT / f".{n}.tmp" for n in ("monthly.csv", "assets.json", "sanity.md")}
    df.to_csv(tmp["monthly.csv"], float_format="%.6f")

    out_assets = []
    for a in assets + [
        {
            **f,
            "role": "fx",
            "firstDate": str(fx[f["id"]].index[0]),
            "ucits": [],
            "segments": [
                {**s, "from": b, "to": e}
                for s, b, e in zip(f["segments"], *fx_bounds(f, fx, fxcheck, through))
            ],
        }
        for f in FX
    ]:
        out_assets.append(
            {
                "id": a["id"],
                "name": a["name"],
                "role": a["role"],
                "firstDate": a["firstDate"],
                "segments": a["segments"],
                "ucits": [
                    u if isinstance(u, dict) else {"name": u} for u in a["ucits"]
                ],
                "notes": a.get("notes")
                or (
                    f"target {a['target']}"
                    + (
                        f"; later start accepted per {a['fallback']}"
                        if a.get("fallback")
                        and a["firstDate"]
                        and a["firstDate"] > a["target"]
                        else ""
                    )
                ),
            }
        )
    tmp["assets.json"].write_text(json.dumps(out_assets, indent=2) + "\n")

    missed = [
        (a["id"], a["firstDate"], a.get("fbTarget", a["target"]))
        for a in assets + FX_AS(fx)
        if (a["firstDate"] is None or a["firstDate"] > a.get("fbTarget", a["target"]))
        and ("fbTarget" in a or not a.get("fallback"))
    ]
    report = sanity(
        df, assets, splices, outl, fxcheck, through, missed, candidate_gates(through)
    )
    tmp["sanity.md"].write_text(report)
    for n, t in tmp.items():
        os.replace(t, OUT / n)
    print(report)
    print(f"Wrote {OUT} — run the app with real data now")
    if missed:
        print(
            "\n!!! TARGET MISSED (not covered by a PRD §8 fallback) — M1 is NOT done:",
            file=sys.stderr,
        )
        for i, f, t in missed:
            print(f"    {i}: first date {f or 'no data'} > target {t}", file=sys.stderr)
    print(
        "RESULT "
        + json.dumps({"lastMonth": df.index[-1], "previousLastMonth": prev_last})
    )
    if missed:
        sys.exit(1)


def FX_AS(fx: dict) -> list[dict]:
    return [{**f, "firstDate": str(fx[f["id"]].index[0])} for f in FX]


def candidate_gates(through: str) -> list[tuple[str, str, dict]]:
    out = []
    for asset, ticker, code in REJECTED:
        ref = fetch.msci(code, "GRTR", 19970101, through)
        out.append(
            (
                asset,
                ticker,
                gate(
                    month_end(fetch.yahoo(ticker), through),
                    ref,
                    pd.Period("2000-12", "M"),
                ),
            )
        )
    return out


def gate_rows(label: str, g: dict) -> list[str]:
    yrs = ", ".join(f"{y}: {c:+.1f} vs {r:+.1f}" for y, c, r in g["years"]) or "none"
    verdict = "pass" if g["passed"] else "**FAIL**"
    return [
        f"| {label} | {g['months']} | {g['corr']:.3f} | {g['annTrackDiff']:+.2%} | {yrs} | {verdict} |"
    ]


def sanity(df, assets, splices, outl, fxcheck, through, missed, candidates) -> str:
    L = [
        f"# Sanity report (data through {through})",
        "",
        "## First dates",
        "| id | first | target | status |",
        "|---|---|---|---|",
    ]
    for a in assets + [
        {
            "id": f["id"],
            "firstDate": df[f["id"]].first_valid_index(),
            "target": f["target"],
            "fallback": f["fallback"],
        }
        for f in FX
    ]:
        f, t = a["firstDate"], a["target"]
        if a.get("fbTarget"):
            t = f"{t} (fallback {a['fbTarget']})"
            ok = f and f <= a["fbTarget"]
            st = f"fallback ok: {a['fallback']}" if ok else "**MISSED**"
        else:
            st = (
                "ok"
                if f and f <= t
                else (
                    f"fallback {a['fallback']}" if a.get("fallback") else "**MISSED**"
                )
            )
        L.append(f"| {a['id']} | {f or '-'} | {t} | {st} |")
    L += [
        "",
        "## Splices (overlap = months where both segments have returns)",
        "| asset | splice | months | corr | ann. track diff (later − earlier) |",
        "|---|---|---|---|---|",
    ]
    for k, ss in splices.items():
        for s in ss:
            o = s["overlap"]
            L.append(
                f"| {k} | {s['splice']} | "
                + (
                    f"{o['months']} | {o['corr']:.3f} | {o['annTrackDiff']:+.2%} |"
                    if o
                    else "<12 | - | - |"
                )
            )
    L += [
        "",
        "## Pre-1997 / proxy acceptance gate (corr >= 0.98 and calendar years within 2pp of MSCI GRTR, overlap to 2000-12)",
        "| segment | months | corr | ann. TD | years: candidate vs MSCI % | verdict |",
        "|---|---|---|---|---|---|",
    ]
    for k, ss in splices.items():
        for s_ in ss:
            if "gate" in s_:
                L += gate_rows(f"{k} (used) segment before {s_['splice']}", s_["gate"])
    for asset, ticker, g in candidates:
        L += gate_rows(f"{ticker} as {asset} (evaluated)", g)
    L += [
        "",
        "## FX_PLN: OECD (FRED) vs NBP month-end overlap",
        f"{fxcheck['months']} months, mean |dev| {fxcheck['meanAbsDevPct']:.2f}%, max {fxcheck['maxAbsDevPct']:.2f}%; NBP used from {fxcheck['nbpFrom']}",
    ]
    L += ["", "## Months with |r| > 40%"]
    ol = [f"- {k} {p}: {v:+.1%}" for k, o in outl.items() for p, v in o.items()]
    r = {
        c: calendar_returns(
            df[c].dropna().set_axis(pd.PeriodIndex(df[c].dropna().index, freq="M"))
        )
        for c in df.columns
        if not c.startswith("FX_")
    }
    L += ol or ["none"]
    L += [
        "",
        "## Calendar-year returns vs published",
        "| asset | year | computed % | published % | status |",
        "|---|---|---|---|---|",
    ]
    for (k, y), (pub, tol) in REFS.items():
        v = r.get(k, pd.Series(dtype=float)).get(y)
        ok = (
            "n/a"
            if v is None or pd.isna(v)
            else ("ok" if abs(v * 100 - pub) <= tol else "**CHECK**")
        )
        L.append(
            f"| {k} | {y} | {'-' if v is None or pd.isna(v) else f'{v * 100:.1f}'} | {pub} (±{tol}) | {ok} |"
        )
    L += [
        "",
        "## Calendar-year returns (computed, %)",
        "| year | " + " | ".join(r) + " |",
        "|---|" + "---|" * len(r),
    ]
    for y in range(1989, int(through[:4]) + 1):
        L.append(
            f"| {y} | "
            + " | ".join(
                "" if pd.isna(r[c].get(y)) else f"{r[c][y] * 100:.1f}" for c in r
            )
            + " |"
        )
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    main()
