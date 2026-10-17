from pipeline import fetch


def test_cached_refetches_when_refresh_flag_set(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(fetch, "RAW", tmp_path)
    assert fetch._cached("a.csv", lambda: "old", False) == "old"
    assert fetch._cached("a.csv", lambda: "new", False) == "old"
    monkeypatch.setattr(fetch, "REFRESH", True)
    assert fetch._cached("a.csv", lambda: "new", False) == "new"
