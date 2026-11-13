"""Place search with OpenStreetMap Nominatim: cached, and throttled to 1 request per second."""

from __future__ import annotations

import hashlib
import json
import threading
import time

import requests

from .config import CACHE, USER_AGENT
from .nowcast import UpstreamError

NOMINATIM = "https://nominatim.openstreetmap.org/search"
_lock = threading.Lock()
_last = 0.0


class PlaceNotFound(LookupError):
    pass


def locate(name: str) -> dict:
    name = " ".join(name.split())[:200]
    if not name:
        raise PlaceNotFound("empty place name")
    path = CACHE / "geocode" / (hashlib.sha1(name.lower().encode()).hexdigest()[:16] + ".json")
    if path.exists():
        return json.loads(path.read_text())
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
              "bbox": [west, south, east, north], "type": h.get("type"), "category": h.get("category")}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result))
    return result
