import pandas as pd
import pytest

from pipeline.transform import (
    calendar_returns,
    chain,
    check_continuous,
    gate,
    month_end,
    outliers,
    tbill_index,
)


def P(s: str) -> pd.Period:
    return pd.Period(s, "M")


def lv(start: str, vals: list[float]) -> pd.Series:
    return pd.Series(vals, index=pd.period_range(start, periods=len(vals), freq="M"))


def test_month_end_takes_last_obs_and_cuts_at_through():
    d = pd.Series(
        [1.0, 2.0, 3.0, 4.0],
        index=pd.to_datetime(["2020-01-15", "2020-01-31", "2020-02-03", "2020-03-02"]),
    )
    s = month_end(d, "2020-02")
    assert list(s.index) == [P("2020-01"), P("2020-02")]
    assert list(s) == [2.0, 3.0]


def test_chain_rescales_and_uses_later_returns_only():
    a = lv("2020-01", [100, 110, 121])  # +10%, +10%
    b = lv("2020-02", [50, 50, 55])  # level differs; from splice: 0%, +10%
    out, stats = chain([a, b])
    assert list(out) == pytest.approx(
        [100, 110, 110, 121]
    )  # 2020-02 anchored at a's 110
    assert stats[0]["splice"] == "2020-02"


def test_chain_requires_overlap():
    with pytest.raises(ValueError, match="no overlap"):
        chain([lv("2020-01", [1, 2]), lv("2020-04", [1, 2])])


def test_splice_overlap_stats():
    a = lv("2020-01", [100 * 1.01**i * (1 + 0.01 * (i % 2)) for i in range(30)])
    b = a * 3  # identical returns
    _, stats = chain([a, b.iloc[2:]])
    o = stats[0]["overlap"]
    assert o["corr"] == pytest.approx(1.0) and o["annTrackDiff"] == pytest.approx(
        0.0, abs=1e-12
    )


def test_tbill_uses_prior_month_rate():
    # TB3MS 12% annualised in Jan -> Feb return 1%; 0% in Feb -> Mar return 0
    tb = lv("2020-01", [12.0, 0.0, 6.0])
    out = tbill_index(tb, "2020-01", "2020-03")
    assert list(out) == pytest.approx([100.0, 101.0, 101.0])
    assert out.index[0] == P("2020-01")  # no return attributed to the base month


def test_calendar_returns_and_outliers():
    lvl = lv("2019-12", [100] + [100] * 11 + [150] + [150] * 11 + [60])
    assert calendar_returns(lvl)[2020] == pytest.approx(0.5)
    assert list(outliers(lvl).index) == [P("2020-12"), P("2021-12")]


def test_check_continuous_flags_gap():
    s = lv("2020-01", [1, 2, 3, 4]).drop(P("2020-03"))
    with pytest.raises(ValueError, match="missing"):
        check_continuous(s, "x")


def test_gate_passes_close_proxy_and_fails_drifting_one():
    ref = lv("2019-12", [100 * (1 + 0.01 * (i % 3)) ** i for i in range(37)])
    good = ref * 1.0
    bad = ref * pd.Series(
        [1.0] * 12 + [1.0] * 12 + [0.9] * 13, index=ref.index
    )  # -10% in 2021
    end = P("2022-12")
    assert gate(good, ref, end)["passed"]
    assert not gate(bad, ref, end)["passed"]


def test_three_segment_chain_uses_each_segments_returns_in_its_window():
    a = lv(
        "2020-01", [100, 110, 121, 133.1, 146.41]
    )  # +10%/m, long: ignored after splice 1
    b = lv("2020-02", [1, 1.2, 1.2, 1.2])  # +20% in Mar, then 0
    c = lv("2020-04", [7, 7.7])  # +10% in May
    out, stats = chain([a, b, c])
    assert [x["splice"] for x in stats] == ["2020-02", "2020-04"]
    # Feb 110 (a) -> Mar 132 (b +20%) -> Apr 132 (b 0%) -> May 145.2 (c +10%)
    assert list(out) == pytest.approx([100, 110, 132, 132, 145.2])
