"""Cached raw downloads -> pandas objects. Raw files live in data/raw/ (gitignored)."""

import datetime as dt
import io
import json
import time
from pathlib import Path

import pandas as pd
import requests

RAW = Path(__file__).resolve().parents[2] / "raw"
REFRESH = False  # set by build --refresh: re-download every source
UA = {"User-Agent": "Mozilla/5.0"}
MSCI_URL = (
    "https://app2.msci.com/products/service/index/indexmaster/getLevelDataForGraph"
)
GOLD_URL = "https://fsapi.gold.org/api/goldprice/v11/chart/price/usd/oz/{a},{b}"
NBP_URL = "https://api.nbp.pl/api/exchangerates/rates/a/usd/{a}/{b}/?format=json"


def _cached(name: str, fetch, refresh: bool) -> str:
    p = RAW / name
    if refresh or REFRESH or not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(fetch())
    return p.read_text()


def _get(url: str, headers: dict | None = None, **params) -> str:
    for attempt in range(6):  # FRED in particular is intermittently slow
        try:
            r = requests.get(url, params=params or None, headers=headers, timeout=30)
            r.raise_for_status()
            return r.text
        except (requests.ConnectionError, requests.Timeout):
            if attempt == 5:
                raise
            time.sleep(10)
    raise AssertionError("unreachable")


def yahoo(ticker: str, refresh: bool = False) -> pd.Series:
    """Daily dividend-adjusted close (total return for funds / TR indices)."""

    def fetch() -> str:
        import yfinance as yf

        d = yf.Ticker(ticker).history(period="max", interval="1d", auto_adjust=True)
        if d.empty:
            raise RuntimeError(f"Yahoo returned no data for {ticker}")
        d.index = d.index.tz_localize(None).normalize()
        return d["Close"].rename("close").to_csv()

    s = pd.read_csv(
        io.StringIO(_cached(f"yahoo/{ticker}.csv", fetch, refresh)),
        index_col=0,
        parse_dates=True,
    )
    return s["close"]


def fred(series: str, refresh: bool = False) -> pd.Series:
    txt = _cached(
        f"fred/{series}.csv",
        lambda: _get("https://fred.stlouisfed.org/graph/fredgraph.csv", id=series),
        refresh,
    )
    s = pd.read_csv(io.StringIO(txt), index_col=0, parse_dates=True).iloc[:, 0]
    return pd.to_numeric(s, errors="coerce").dropna()


def msci(
    code: str, variant: str, first: int, through: str, refresh: bool = False
) -> pd.Series:
    """Month-end USD index levels from the msci.com end-of-day tool (free API: data from 1997-01 only).
    Requests are chunked (API caps a response at ~310 rows) and throttled (WAF blocks bursts)."""
    last = int(pd.Period(through, "M").end_time.strftime("%Y%m%d"))
    out = {}
    # The API returns only rows from 2000-12-29 onward when a range spans that date (so the
    # pre-2000-12 history needs its own request ending 2000-11-30); chunk the rest by decade.
    ranges = [(first, 20001130)] if first < 20001201 else []
    ranges += [
        (max(y * 10000 + 101, 20001201, first), min((y + 9) * 10000 + 1231, last))
        for y in range(
            2000 if first < 20010101 else first // 10000, last // 10000 + 1, 10
        )
    ]
    for a, b in ranges:
        if a > b:
            continue

        def fetch(a=a, b=b) -> str:
            time.sleep(3)
            return _get(
                MSCI_URL,
                UA,
                currency_symbol="USD",
                index_variant=variant,
                start_date=a,
                end_date=b,
                data_frequency="END_OF_MONTH",
                index_codes=code,
            )

        j = json.loads(_cached(f"msci/{code}_{variant}_{a}_{b}.json", fetch, refresh))
        if "indexes" not in j:
            raise RuntimeError(f"MSCI {code} {variant}: {j}")
        for x in j["indexes"]["INDEX_LEVELS"]:
            out[pd.Period(str(x["calc_date"])[:6], "M")] = x["level_eod"]
    return pd.Series(out).sort_index()


def gold(first_year: int, last_year: int, refresh: bool = False) -> pd.Series:
    """Daily LBMA PM gold, USD/oz, via the World Gold Council chart API (fetched per year)."""
    rows = []
    for y in range(first_year, last_year + 1):
        a = int(dt.datetime(y, 1, 1, tzinfo=dt.UTC).timestamp() * 1000)
        b = int(dt.datetime(y, 12, 31, tzinfo=dt.UTC).timestamp() * 1000)
        j = json.loads(
            _cached(
                f"gold/{y}.json",
                lambda a=a, b=b: _get(GOLD_URL.format(a=a, b=b)),
                refresh or y == last_year,
            )
        )
        rows += j["chartData"]["USD"]
    s = pd.Series(
        {pd.Timestamp(t, unit="ms").normalize(): p for t, p in rows}
    ).sort_index()
    return s[~s.index.duplicated(keep="last")]


def nbp_usdpln(first_year: int, last_year: int, refresh: bool = False) -> pd.Series:
    """Daily NBP table A mid USD/PLN (PLN per USD); the API limits a query to 367 days, so per year."""
    rows = []
    for y in range(first_year, last_year + 1):
        a, b = f"{y}-01-01", min(f"{y}-12-31", dt.date.today().isoformat())
        txt = _cached(
            f"nbp/usd_{y}.json",
            lambda a=a, b=b: _get(NBP_URL.format(a=a, b=b)),
            refresh or y == last_year,
        )
        rows += [(r["effectiveDate"], r["mid"]) for r in json.loads(txt)["rates"]]
    s = pd.Series(dict(rows))
    s.index = pd.to_datetime(s.index)
    return s.sort_index()
