"""Land-surface change discovery with AlphaEarth embeddings, labelled with Dynamic World.

Change score per 10 m pixel = 1 - dot(embedding_yearA, embedding_yearB). Embeddings are unit
vectors, so the dot product is their cosine similarity: 0 = unchanged, larger = more different.
Hotspots are connected areas whose score (averaged to 60 m) exceeds CHANGE_THRESHOLD.
"""

from __future__ import annotations

import concurrent.futures as cf
import hashlib
import json
import logging
import math
import time

from .config import CACHE, init_earth_engine

log = logging.getLogger(__name__)

EMBEDDINGS = "GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL"
DYNAMIC_WORLD = "GOOGLE/DYNAMICWORLD/V1"
YEARS = (2017, 2025)
MAX_SIDE_KM = 100.0
CHANGE_THRESHOLD = 0.3
HOTSPOT_SCALE_M = 60
STATS_SCALE_M = 120   # area summaries: coarser is faster and changes nothing meaningful
LABEL_SCALE_M = 60    # Dynamic World mode per hotspot
MIN_HOTSPOT_KM2 = 0.05
MAX_HOTSPOTS = 20
VIS = {"min": 0.15, "max": 0.55, "palette": ["4a1a6b", "b5367a", "fb8761", "fcfdbf"]}  # shown only above 0.15
DW_CLASSES = ["water", "trees", "grass", "flooded vegetation", "crops", "shrub and scrub", "built-up",
              "bare ground", "snow and ice"]
CACHE_VERSION = 1


class ChangeError(ValueError):
    """Invalid request (region too large, bad years)."""


def side_lengths_km(bbox: tuple[float, float, float, float]) -> tuple[float, float]:
    west, south, east, north = bbox
    mid = math.radians((south + north) / 2)
    return (east - west) * 111.32 * math.cos(mid), (north - south) * 110.57


def _validate(bbox, year_a: int, year_b: int) -> tuple[float, float, float, float]:
    west, south, east, north = (float(v) for v in bbox)
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ChangeError("bbox must be west,south,east,north with west<east and south<north")
    w, h = side_lengths_km((west, south, east, north))
    if max(w, h) > MAX_SIDE_KM:
        raise ChangeError(f"region too large: {w:.0f} km x {h:.0f} km; the maximum is {MAX_SIDE_KM:.0f} km "
                          "per side. Pick a smaller area (for example a city instead of a country).")
    for y in (year_a, year_b):
        if not YEARS[0] <= y <= YEARS[1]:
            raise ChangeError(f"years must be between {YEARS[0]} and {YEARS[1]} (AlphaEarth coverage)")
    if year_a >= year_b:
        raise ChangeError("year_a must be earlier than year_b")
    return west, south, east, north


def _change_image(region, year_a: int, year_b: int):
    import ee

    col = ee.ImageCollection(EMBEDDINGS).filterBounds(region)
    a = col.filterDate(f"{year_a}-01-01", f"{year_a + 1}-01-01").mosaic()
    b = col.filterDate(f"{year_b}-01-01", f"{year_b + 1}-01-01").mosaic()
    # Normalised cosine similarity: correct at native 10 m and at any coarser pyramid level, where
    # averaged embeddings are no longer unit length.
    dot = a.multiply(b).reduce(ee.Reducer.sum())
    norm_a = a.multiply(a).reduce(ee.Reducer.sum()).sqrt()
    norm_b = b.multiply(b).reduce(ee.Reducer.sum()).sqrt()
    similarity = dot.divide(norm_a.multiply(norm_b))
    return ee.Image(1).subtract(similarity).rename("change").clip(region)


def _landcover(region, year: int):
    import ee

    return (ee.ImageCollection(DYNAMIC_WORLD).filterBounds(region)
            .filterDate(f"{year}-01-01", f"{year + 1}-01-01").select("label").mode())


def _cache_path(bbox, year_a, year_b):
    key = json.dumps([CACHE_VERSION, [round(v, 4) for v in bbox], year_a, year_b])
    return CACHE / "change" / (hashlib.sha1(key.encode()).hexdigest()[:16] + ".json")


def tile_url(bbox, year_a: int, year_b: int) -> str:
    """Fresh Earth Engine tile URL for the change layer (URLs expire, so never cached)."""
    import ee

    init_earth_engine()
    region = ee.Geometry.Rectangle(list(bbox))
    change = _change_image(region, year_a, year_b)
    m = change.updateMask(change.gt(VIS["min"])).getMapId(VIS)
    return m["tile_fetcher"].url_format


def detect_change(bbox, year_a: int, year_b: int) -> dict:
    """Hotspots of land-surface change inside `bbox` between two years."""
    import ee

    west, south, east, north = _validate(bbox, int(year_a), int(year_b))
    bbox = (west, south, east, north)
    path = _cache_path(bbox, year_a, year_b)
    if path.exists():
        result = json.loads(path.read_text())
        result["tile_url"] = tile_url(bbox, year_a, year_b)
        result["cached"] = True
        return result

    init_earth_engine()
    t0 = time.perf_counter()
    region = ee.Geometry.Rectangle([west, south, east, north])
    change = _change_image(region, year_a, year_b)
    coarse = change  # evaluated at HOTSPOT_SCALE_M by each reduction below

    stats = coarse.reduceRegion(
        reducer=ee.Reducer.percentile([50, 90, 99]).combine(ee.Reducer.mean(), sharedInputs=True),
        geometry=region, scale=STATS_SCALE_M, maxPixels=1e9, bestEffort=True)
    share = coarse.gt(CHANGE_THRESHOLD).reduceRegion(ee.Reducer.mean(), region, STATS_SCALE_M,
                                                     maxPixels=1e9, bestEffort=True)

    hot = coarse.gt(CHANGE_THRESHOLD).selfMask()
    vectors = hot.addBands(coarse).reduceToVectors(
        geometry=region, scale=HOTSPOT_SCALE_M, geometryType="polygon", eightConnected=True,
        labelProperty="hot", reducer=ee.Reducer.mean(), maxPixels=1e9, bestEffort=True)
    vectors = vectors.map(lambda f: f.set("area_km2", f.geometry().area(10).divide(1e6)))
    vectors = vectors.filter(ee.Filter.gte("area_km2", MIN_HOTSPOT_KM2))
    vectors = vectors.map(lambda f: f.set("weight", ee.Number(f.get("area_km2")).multiply(f.get("mean"))))
    top = vectors.sort("weight", False).limit(MAX_HOTSPOTS)

    lc = _landcover(region, year_a).rename("from").addBands(_landcover(region, year_b).rename("to"))
    labelled = lc.reduceRegions(collection=top, reducer=ee.Reducer.mode(), scale=LABEL_SCALE_M)
    labelled = labelled.map(lambda f: f.setGeometry(f.geometry().simplify(30)).set(
        "centroid", f.geometry().centroid(10).coordinates()))

    # The summary statistics and the labelled hotspots are independent: fetch them in parallel.
    with cf.ThreadPoolExecutor(2) as pool:
        summary = pool.submit(lambda: ee.Dictionary({"stats": stats, "share": share.get("change")}).getInfo())
        spots = pool.submit(lambda: labelled.toList(MAX_HOTSPOTS).getInfo())
        info = {**summary.result(), "hotspots": spots.result()}

    hotspots = []
    for k, f in enumerate(info["hotspots"], start=1):
        p = f["properties"]
        frm, to = p.get("from"), p.get("to")
        hotspots.append({
            "id": f"h{k}", "lon": round(p["centroid"][0], 5), "lat": round(p["centroid"][1], 5),
            "area_km2": round(p["area_km2"], 3), "score": round(p["mean"], 3),
            "from": DW_CLASSES[int(frm)] if frm is not None else "unknown",
            "to": DW_CLASSES[int(to)] if to is not None else "unknown",
            "geometry": f["geometry"],
        })
    for h in hotspots:
        h["transition"] = "no class change" if h["from"] == h["to"] else f"{h['from']} → {h['to']}"
        h["summary"] = (f"{h['area_km2']:.2f} km² changed (score {h['score']:.2f}); land cover "
                        + ("stayed " + h["from"] if h["from"] == h["to"] else f"went from {h['from']} to {h['to']}"))
    s = info["stats"]
    result = {
        "bbox": list(bbox), "year_a": year_a, "year_b": year_b,
        "threshold": CHANGE_THRESHOLD, "scale_m": HOTSPOT_SCALE_M,
        "median_change": s.get("change_p50"), "p90_change": s.get("change_p90"),
        "p99_change": s.get("change_p99"), "mean_change": s.get("change_mean"),
        "share_strong_change": info["share"],
        "hotspots": hotspots,
        "method": "AlphaEarth satellite embeddings (Google DeepMind), change = 1 − cosine similarity between "
                  "years; land-cover labels from Dynamic World (Google/WRI), most frequent class each year",
        "seconds": round(time.perf_counter() - t0, 1),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result))
    result["tile_url"] = tile_url(bbox, year_a, year_b)
    result["cached"] = False
    return result
