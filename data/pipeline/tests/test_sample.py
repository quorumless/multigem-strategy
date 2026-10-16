import io

import pandas as pd

from pipeline import sample


def test_deterministic_and_parseable():
    a, b = (
        sample.build().to_csv(float_format="%.6f"),
        sample.build().to_csv(float_format="%.6f"),
    )
    assert a == b
    df = pd.read_csv(io.StringIO(a), index_col=0)
    months = pd.PeriodIndex(df.index, freq="M")
    assert (months.asi8[1:] - months.asi8[:-1] == 1).all() and df.index[
        -1
    ] == sample.THROUGH
    assert ((df.dropna(how="all") > 0) | df.isna()).all().all()
    for id_, first in sample.FIRST.items():
        assert df[id_].first_valid_index() == first
    assert all(x["synthetic"] for x in sample.assets_json())


def test_2008_episode_equities_below_tbill():
    df = sample.build()
    for id_ in ("US", "ACWXUS"):
        r12 = df[id_] / df[id_].shift(12) - 1
        tb12 = df["TBILL"] / df["TBILL"].shift(12) - 1
        assert (r12["2008-06":"2008-12"] < tb12["2008-06":"2008-12"]).all()
        assert (
            r12["2010-06":"2010-12"].min() > tb12["2010-06":"2010-12"].max() - 0.2
        )  # recovered
