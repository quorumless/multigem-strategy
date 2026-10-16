"""Pure series logic: month-end resampling, chain-linking, T-bill index. No I/O."""

import itertools

import numpy as np
import pandas as pd


def month_end(daily: pd.Series, through: str) -> pd.Series:
    """Last observation of each calendar month, indexed by monthly Period, up to `through` (YYYY-MM)."""
    s = daily.dropna()
    s = s[~s.index.duplicated(keep="last")].sort_index()
    out = s.groupby(s.index.to_period("M")).last()
    return out[out.index <= pd.Period(through, "M")]


def check_continuous(s: pd.Series, name: str) -> None:
    full = pd.period_range(s.index[0], s.index[-1], freq="M")
    missing = full.difference(s.dropna().index)
    if len(missing):
        raise ValueError(
            f"{name}: missing months {[str(m) for m in missing[:5]]} (+{max(len(missing) - 5, 0)})"
        )


def tracking(earlier: pd.Series, later: pd.Series) -> dict | None:
    """Overlap stats of monthly returns: correlation and annualised geometric tracking difference."""
    r = pd.concat(
        [earlier.pct_change(), later.pct_change()], axis=1, join="inner"
    ).dropna()
    if len(r) < 12:
        return None
    a, b = r.iloc[:, 0], r.iloc[:, 1]
    td = ((1 + b).prod() / (1 + a).prod()) ** (12 / len(r)) - 1
    return {"months": len(r), "corr": float(a.corr(b)), "annTrackDiff": float(td)}


def chain(segments: list[pd.Series]) -> tuple[pd.Series, list[dict]]:
    """Chain-link level series oldest -> newest. Each later segment is rescaled to equal the
    chain at its first month and contributes only returns after that month."""
    out = segments[0].dropna()
    stats = []
    for prev, seg in itertools.pairwise(segments):
        seg = seg.dropna()
        s0 = seg.index[0]
        if s0 not in out.index:
            raise ValueError(
                f"no overlap at splice month {s0}: earlier chain ends {out.index[-1]}"
            )
        scaled = seg * (out[s0] / seg[s0])
        stats.append({"splice": str(s0), "overlap": tracking(prev.dropna(), seg)})
        out = pd.concat([out[out.index <= s0], scaled[scaled.index > s0]])
    return out, stats


def tbill_index(tb3ms: pd.Series, start: str, through: str) -> pd.Series:
    """Level = 100 at `start`; return for month t = TB3MS[t-1]/1200 (STRATEGY_SPEC §1)."""
    r = (tb3ms / 1200).shift(1, freq="M")  # value of month t-1 applies to month t
    r = r[(r.index > pd.Period(start, "M")) & (r.index <= pd.Period(through, "M"))]
    lvl = (1 + r).cumprod() * 100
    return pd.concat([pd.Series([100.0], index=[pd.Period(start, "M")]), lvl])


def calendar_returns(level: pd.Series) -> pd.Series:
    """Calendar-year returns from December to December (first year needs prior December)."""
    dec = level[level.index.month == 12]
    return dec.pct_change().set_axis(dec.index.year)


def outliers(level: pd.Series, thresh: float = 0.4) -> pd.Series:
    r = level.pct_change().dropna()
    return r[r.abs() > thresh]


def invert(s: pd.Series) -> pd.Series:
    return 1.0 / s.replace(0, np.nan)


def gate(
    cand: pd.Series,
    ref: pd.Series,
    end: pd.Period,
    min_corr: float = 0.98,
    tol_pp: float = 2.0,
) -> dict:
    """Acceptance gate for a proxy segment against a reference index over the overlap up to `end`:
    return correlation >= min_corr and every full calendar year within the window within tol_pp."""
    cand, ref = cand[cand.index <= end], ref[ref.index <= end]
    t = tracking(ref, cand) or {
        "months": 0,
        "corr": float("nan"),
        "annTrackDiff": float("nan"),
    }
    cy, ry = calendar_returns(cand), calendar_returns(ref)
    years = [
        (y, cy[y] * 100, ry[y] * 100)
        for y in cy.index.intersection(ry.index)
        if pd.notna(cy[y]) and pd.notna(ry[y])
    ]
    passed = bool(
        t["corr"] >= min_corr
        and years
        and all(abs(c - r) <= tol_pp for _, c, r in years)
    )
    return {**t, "years": years, "passed": passed}
