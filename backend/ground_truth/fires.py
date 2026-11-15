"""Live active fires from NASA FIRMS (VIIRS NOAA-20, last 24 hours), cached for 10 minutes."""

from __future__ import annotations

import csv
import io
import threading
import time
from datetime import datetime, timedelta, timezone

import requests

from .config import FIRMS_MAP_KEY, USER_AGENT
from .nowcast import UpstreamError

SOURCE = "VIIRS_NOAA20_NRT"
FIRMS_AREA = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/world/2"  # FIRMS day ranges are UTC dates; "1" is empty just after midnight, so take 2 and trim to 24 h
TTL_SECONDS = 600
_lock = threading.Lock()
_cache: dict = {"at": 0.0, "rows": None}


def _download() -> list[dict]:
    if not FIRMS_MAP_KEY:
        raise UpstreamError("FIRMS_MAP_KEY is not set in .env")
    try:
        r = requests.get(FIRMS_AREA.format(key=FIRMS_MAP_KEY, source=SOURCE), timeout=30,
                         headers={"User-Agent": USER_AGENT})
        r.raise_for_status()
    except requests.RequestException as exc:
        raise UpstreamError(f"NASA FIRMS request failed: {exc}") from exc
    text = r.text
    if not text.startswith("latitude"):
        raise UpstreamError(f"NASA FIRMS returned an error: {text[:120]}")
    rows = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            rows.append({"lat": float(row["latitude"]), "lon": float(row["longitude"]),
                         "frp": float(row["frp"] or 0), "confidence": row["confidence"],
                         "time": f"{row['acq_date']}T{row['acq_time'].zfill(4)[:2]}:{row['acq_time'].zfill(4)[2:]}Z",
                         "daynight": row["daynight"]})
        except (KeyError, ValueError):
            continue
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%MZ")
    return [f for f in rows if f["time"] >= cutoff]


def fires(bbox: tuple[float, float, float, float] | None = None, limit: int | None = None) -> dict:
    with _lock:
        if _cache["rows"] is None or time.time() - _cache["at"] > TTL_SECONDS:
            _cache["rows"] = _download()
            _cache["at"] = time.time()
        rows, fetched = _cache["rows"], _cache["at"]
    if bbox:
        w, s, e, n = bbox
        rows = [f for f in rows if w <= f["lon"] <= e and s <= f["lat"] <= n]
    strongest = sorted(rows, key=lambda f: f["frp"], reverse=True)
    return {
        "count": len(rows), "bbox": list(bbox) if bbox else None,
        "fires": strongest[:limit] if limit else strongest,
        "source": "NASA FIRMS, VIIRS NOAA-20 near real-time, last 24 hours",
        "note": "Thermal anomalies: mostly vegetation fires, but some are gas flares, volcanoes or industrial heat.",
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(fetched)),
    }
