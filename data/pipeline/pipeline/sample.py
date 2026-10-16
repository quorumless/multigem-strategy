"""Synthetic sample data (NOT real market data) for tests/CI. Run: uv run python -m pipeline.sample

Same files/columns as data/processed, same first dates, through 2026-09. Seeded random walks;
no real data is read (asset names/roles/segments come from the static config in build.py).
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

from .build import ASSETS, FX

OUT = Path(__file__).resolve().parents[2] / "sample"
THROUGH = "2026-09"
SEED = 20260101
FIRST = {
    "US": "1988-01", "DEVXUS": "1997-01", "EM": "1997-01", "ACWXUS": "1996-04", "AGG": "1988-01",
    "LTT": "1988-01", "TBILL": "1988-01", "GOLD": "1988-01", "BCOM": "2002-07",
    "FX_EUR": "1999-01", "FX_PLN": "1995-01",
}  # fmt: skip
# monthly (drift, vol); levels start at 100
PARAMS = {
    "US": (0.008, 0.045), "DEVXUS": (0.006, 0.05), "EM": (0.007, 0.07), "ACWXUS": (0.006, 0.05),
    "AGG": (0.004, 0.01), "LTT": (0.005, 0.03), "GOLD": (0.004, 0.04), "BCOM": (0.002, 0.045),
    "FX_EUR": (0.0, 0.02), "FX_PLN": (0.0, 0.025),
}  # fmt: skip
EQUITY = ("US", "DEVXUS", "EM", "ACWXUS")
NOTE = "SYNTHETIC SAMPLE — not real market data"


def returns(idx: pd.PeriodIndex, rng: np.random.Generator, id_: str) -> pd.Series:
    mu, sd = PARAMS[id_]
    r = pd.Series(rng.normal(mu, sd, len(idx)), index=idx)
    if (
        id_ in EQUITY
    ):  # 2008-style crash (below T-bills for all of 2008) and recovery by 2009-2010
        r[(idx >= "2007-11") & (idx <= "2008-12")] = rng.normal(
            -0.04, 0.01, ((idx >= "2007-11") & (idx <= "2008-12")).sum()
        )
        r[(idx >= "2009-03") & (idx <= "2010-06")] = rng.normal(
            0.03, 0.01, ((idx >= "2009-03") & (idx <= "2010-06")).sum()
        )
    if id_ == "AGG":
        r[(idx >= "2007-11") & (idx <= "2008-12")] = 0.006
    return r.clip(-0.5, 0.5)


def build() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    idx = pd.period_range("1988-01", THROUGH, freq="M")
    cols = {}
    for id_ in FIRST:
        i = idx[idx >= FIRST[id_]]
        if id_ == "TBILL":
            r = pd.Series(0.003, index=i)
        else:
            r = returns(i, rng, id_)
        cols[id_] = 100 * (1 + r).cumprod().shift(
            fill_value=1.0
        )  # level 100 at first date
    # FX: units per USD, around a plausible level
    cols["FX_EUR"] *= 0.9 / 100
    cols["FX_PLN"] *= 3.5 / 100
    df = pd.DataFrame(cols)
    df.index = df.index.strftime("%Y-%m")
    df.index.name = "date"
    return df[
        [
            "US",
            "DEVXUS",
            "EM",
            "ACWXUS",
            "AGG",
            "LTT",
            "TBILL",
            "GOLD",
            "BCOM",
            "FX_EUR",
            "FX_PLN",
        ]
    ]


def assets_json() -> list[dict]:
    out = []
    for a in ASSETS + [{**f, "role": "fx", "ucits": []} for f in FX]:
        out.append(
            {
                "id": a["id"],
                "name": a["name"],
                "role": a["role"],
                "firstDate": FIRST[a["id"]],
                "segments": [
                    {**s, "from": FIRST[a["id"]], "to": THROUGH} for s in a["segments"]
                ],
                "ucits": [
                    u if isinstance(u, dict) else {"name": u} for u in a["ucits"]
                ],
                "notes": NOTE,
                "synthetic": True,
            }
        )
    return out


README = f"""# Sample data — {NOTE}

Fake, seeded random-walk data for tests and CI. It has the same files, columns and first dates as
`data/processed/` but **no real prices**; the numbers mean nothing. It includes a 2008-style
episode (equities fall below T-bills through 2008, recover in 2009–2010) so strategy tests can
exercise a switch to bonds. Every asset in `assets.json` has `"synthetic": true`.

Regenerate: `cd data/pipeline && uv run python -m pipeline.sample` (deterministic).

## Real data
Real data is not committed. Build it locally (needs network; free sources only):
`cd data/pipeline && uv sync && uv run python -m pipeline.build` — writes `data/processed/`.
See `docs/DATA.md` for sources and licensing.
"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    build().to_csv(OUT / "monthly.csv", float_format="%.6f")
    (OUT / "assets.json").write_text(json.dumps(assets_json(), indent=2) + "\n")
    (OUT / "README.md").write_text(README)
    print(f"Wrote {OUT} (synthetic)")


if __name__ == "__main__":
    main()
