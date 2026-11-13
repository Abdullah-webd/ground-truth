"""Place search with OpenStreetMap Nominatim: cached, and throttled to 1 request per second."""

from __future__ import annotations

import hashlib
import json
import threading
import time

import requests

from .config import CACHE, CESIUM_ION_TOKEN, USER_AGENT
from .nowcast import UpstreamError

NOMINATIM = "https://nominatim.openstreetmap.org/search"
ION_GEOCODE = "https://api.cesium.com/v1/geocode/search"
_lock = threading.Lock()
_last = 0.0


class PlaceNotFound(LookupError):
    pass


def _locate_ion(name: str) -> dict:
    """Google geocoding through Cesium ion. Required whenever Google Photorealistic 3D Tiles are shown."""
    try:
        r = requests.get(ION_GEOCODE, params={"text": name, "geocoder": "google"},
                         headers={"Authorization": f"Bearer {CESIUM_ION_TOKEN}"}, timeout=10)
        r.raise_for_status()
        features = r.json().get("features", [])
    except (requests.RequestException, ValueError) as exc:
        raise UpstreamError(f"place search failed: {exc}") from exc
    if not features:
        raise PlaceNotFound(f"no place found for '{name}'")
    f = features[0]
    lon, lat = f["geometry"]["coordinates"][:2]
    bbox = f.get("bbox") or [lon - 0.1, lat - 0.1, lon + 0.1, lat + 0.1]
    props = f.get("properties", {})
    return {"name": props.get("label") or props.get("name") or name, "lat": float(lat), "lon": float(lon),
            "bbox": [float(v) for v in bbox], "type": props.get("layer"), "category": "place",
            "provider": "google"}


def locate(name: str) -> dict:
    name = " ".join(name.split())[:200]
    if not name:
        raise PlaceNotFound("empty place name")
    provider = "google" if CESIUM_ION_TOKEN else "osm"
    key = f"{provider}:{name.lower()}"
    path = CACHE / "geocode" / (hashlib.sha1(key.encode()).hexdigest()[:16] + ".json")
    if path.exists():
        return json.loads(path.read_text())
    if CESIUM_ION_TOKEN:
        result = _locate_ion(name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(result))
        return result
    global _last
    with _lock:
        wait = 1.0 - (time.time() - _last)
        if wait > 0:
            time.sleep(wait)
        try:
            r = requests.get(NOMINATIM, params={"q": name, "format": "jsonv2", "limit": 1},
                             headers={"User-Agent": USER_AGENT}, timeout=10)
            r.raise_for_status()
            hits = r.json()
        except (requests.RequestException, ValueError) as exc:
            raise UpstreamError(f"place search failed: {exc}") from exc
        finally:
            _last = time.time()
    if not hits:
        raise PlaceNotFound(f"no place found for '{name}'")
    h = hits[0]
    south, north, west, east = (float(v) for v in h["boundingbox"])
    result = {"name": h["display_name"], "lat": float(h["lat"]), "lon": float(h["lon"]),
              "bbox": [west, south, east, north], "type": h.get("type"), "category": h.get("category"),
              "provider": "osm"}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result))
    return result
