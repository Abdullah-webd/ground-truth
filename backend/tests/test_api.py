"""API tests against the built trend store. Tests marked `live` call Earth Engine and NASA services:
run them with `pytest -m live`."""

import pytest
from fastapi.testclient import TestClient

from ground_truth import store
from ground_truth.api import app

client = TestClient(app)


def built(var):
    try:
        store.load(var)
        return True
    except store.NotFound:
        return False


needs_temperature = pytest.mark.skipif(not built("temperature"), reason="temperature store not built")
needs_vegetation = pytest.mark.skipif(not built("vegetation"), reason="vegetation store not built")


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@needs_temperature
def test_variables_lists_built_stores():
    ids = [v["id"] for v in client.get("/api/variables").json()["variables"]]
    assert "temperature" in ids


@needs_temperature
def test_point_trend_lagos_is_significant_warming():
    r = client.get("/api/trend/point", params={"variable": "temperature", "lat": 6.5, "lon": 3.4})
    assert r.status_code == 200
    d = r.json()
    assert d["significant"] is True and d["direction"] == "increasing"
    assert 0.1 < d["slope_per_decade"] < 0.5
    assert len(d["years"]) == len(d["values"]) == 46
    assert "statistically significant increase" in d["verdict"]


@needs_vegetation
def test_point_over_ocean_for_land_variable_says_no_data():
    d = client.get("/api/trend/point", params={"variable": "vegetation", "lat": 0, "lon": -150}).json()
    assert d["tested"] is False and "no data" in d["verdict"]


@needs_temperature
def test_region_arctic_warms_faster_than_globe():
    arctic = client.get("/api/trend/region", params={"variable": "temperature", "bbox": "-180,66.5,180,90"}).json()
    world = client.get("/api/trend/region", params={"variable": "temperature", "bbox": "-180,-90,180,90"}).json()
    assert arctic["significant"] and arctic["slope_per_decade"] > 2.5 * world["slope_per_decade"]


@needs_temperature
def test_divergence_and_cluster_image():
    d = client.get("/api/divergence", params={"variable": "temperature"}).json()
    assert d["pairs"], "expected at least one opposite-trend pair"
    pair = d["pairs"][0]
    assert pair["increasing"]["slope_per_decade"] > 0 > pair["decreasing"]["slope_per_decade"]
    img = client.get("/api/divergence/cluster.png", params={"variable": "temperature",
                                                            "cluster": pair["decreasing"]["id"]})
    assert img.status_code == 200 and img.content[:8] == b"\x89PNG\r\n\x1a\n"


@needs_temperature
def test_static_overlays_are_served():
    r = client.get("/static/derived/temperature/significance.png")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"


def test_errors_are_clear():
    r = client.get("/api/trend/point", params={"variable": "snowfall", "lat": 0, "lon": 0})
    assert r.status_code == 404 and "unknown variable" in r.json()["error"]["message"]
    r = client.get("/api/trend/region", params={"variable": "temperature", "bbox": "1,2,3"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_bbox"
    r = client.get("/api/trend/point", params={"variable": "temperature", "lat": 95, "lon": 0})
    assert r.status_code == 422
    r = client.get("/api/change", params={"bbox": "0,0,10,10"})
    assert r.status_code == 400 and "too large" in r.json()["error"]["message"]
    r = client.get("/api/change", params={"bbox": "3.3,6.4,3.5,6.6", "year_a": 2024, "year_b": 2018})
    assert r.status_code == 400 and "earlier" in r.json()["error"]["message"]


@needs_temperature
def test_checks_report_global_temperature():
    d = client.get("/api/checks").json()
    assert d["global_temperature"]["passed"] is True
    assert any(c["id"] == "arctic-amplification" for c in d["regional"])


@pytest.mark.live
def test_live_change_detection_lagos():
    d = client.get("/api/change", params={"bbox": "3.15,6.35,3.75,6.75", "year_a": 2018, "year_b": 2024}).json()
    assert d["hotspots"] and d["tile_url"].startswith("https://earthengine.googleapis.com/")
    assert any("built-up" in h["transition"] for h in d["hotspots"])


@pytest.mark.live
def test_live_now_fires_locate():
    now = client.get("/api/now", params={"lat": 6.5, "lon": 3.4}).json()
    assert "anomaly" in now["temperature"]
    f = client.get("/api/fires", params={"limit": 5}).json()
    assert f["count"] > 100 and len(f["fires"]) == 5
    p = client.get("/api/locate", params={"q": "Lagos, Nigeria"}).json()
    assert abs(p["lat"] - 6.45) < 0.5
