"""Place names for the globe, from OpenStreetMap via OpenFreeMap vector tiles (OpenMapTiles schema).

Each vector tile is decoded once into a compact list of labels (name, kind, rank, position) and kept
on disk, so labels keep working when the venue network is flaky. Also answers "what is the nearest
named place to this point?" for fires and other spots in empty country.

Data: © OpenStreetMap contributors (ODbL), tiles by OpenFreeMap, schema by OpenMapTiles.
"""

from __future__ import annotations

import gzip
import json
import math
import threading
import time

import requests

from .config import CACHE, USER_AGENT

TILEJSON = "https://tiles.openfreemap.org/planet"
MAX_ZOOM = 14
TEMPLATE_TTL = 24 * 3600
TILE_DIR = CACHE / "labels"
CREDIT = "© OpenStreetMap contributors, OpenFreeMap, OpenMapTiles"

_template: dict = {"url": None, "at": 0.0}
_lock = threading.Lock()


class LabelsUnavailable(RuntimeError):
    pass


# ---------------------------------------------------------------- protobuf / MVT decoding

def _varint(b: bytes, i: int) -> tuple[int, int]:
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        s += 7
        if c < 0x80:
            return r, i


def _fields(b: bytes):
    i = 0
    n = len(b)
    while i < n:
        key, i = _varint(b, i)
        f, t = key >> 3, key & 7
        if t == 0:
            v, i = _varint(b, i)
        elif t == 2:
            ln, i = _varint(b, i)
            v = b[i:i + ln]
            i += ln
        elif t == 5:
            v = b[i:i + 4]
            i += 4
        elif t == 1:
            v = b[i:i + 8]
            i += 8
        else:  # groups are not used by MVT
            raise ValueError(f"unsupported wire type {t}")
        yield f, t, v


def _packed(b: bytes) -> list[int]:
    out, i = [], 0
    while i < len(b):
        v, i = _varint(b, i)
        out.append(v)
    return out


def _zigzag(n: int) -> int:
    return (n >> 1) ^ -(n & 1)


def _geometry(cmds: list[int]) -> list[list[tuple[int, int]]]:
    """MVT geometry commands to a list of parts (each a list of tile-space points)."""
    parts: list[list[tuple[int, int]]] = []
    x = y = i = 0
    while i < len(cmds):
        cmd, count = cmds[i] & 7, cmds[i] >> 3
        i += 1
        if cmd == 1:  # MoveTo
            for _ in range(count):
                x += _zigzag(cmds[i])
                y += _zigzag(cmds[i + 1])
                i += 2
                parts.append([(x, y)])
        elif cmd == 2:  # LineTo
            for _ in range(count):
                x += _zigzag(cmds[i])
                y += _zigzag(cmds[i + 1])
                i += 2
                parts[-1].append((x, y))
        elif cmd == 7:  # ClosePath
            pass
        else:
            break
    return parts


def _value(b: bytes):
    for f, t, v in _fields(b):
        if f == 1:
            return v.decode("utf-8", "replace")
        if f in (2, 3):  # float, double
            import struct

            return struct.unpack("<f" if f == 2 else "<d", v)[0]
        if t == 0:
            return v
    return None


def decode_tile(data: bytes) -> dict[str, list[dict]]:
    """Decode a Mapbox Vector Tile into {layer: [{props..., '_type', '_geom', '_extent'}]}."""
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    layers: dict[str, list[dict]] = {}
    for f, _, layer in _fields(data):
        if f != 3:
            continue
        name, keys, values, raw, extent = None, [], [], [], 4096
        for lf, _, lv in _fields(layer):
            if lf == 1:
                name = lv.decode()
            elif lf == 2:
                raw.append(lv)
            elif lf == 3:
                keys.append(lv.decode())
            elif lf == 4:
                values.append(_value(lv))
            elif lf == 5:
                extent = lv
        feats = []
        for fb in raw:
            tags, gtype, geom = [], 0, []
            for ff, _, fv in _fields(fb):
                if ff == 2:
                    tags = _packed(fv)
                elif ff == 3:
                    gtype = fv
                elif ff == 4:
                    geom = _packed(fv)
            props = {keys[a]: values[c] for a, c in zip(tags[::2], tags[1::2])}
            props["_type"], props["_geom"], props["_extent"] = gtype, geom, extent
            feats.append(props)
        if name:
            layers[name] = feats
    return layers


# ---------------------------------------------------------------- labels

def _lonlat(z: int, x: int, y: int, px: float, py: float, extent: int) -> tuple[float, float]:
    n = 2 ** z
    lon = (x + px / extent) / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + py / extent) / n))))
    return round(lon, 6), round(lat, 6)


def _anchor(props: dict) -> tuple[tuple[float, float] | None, float]:
    """A point to hang the label on, and the feature's length in tile units (lines: longest part)."""
    parts = _geometry(props["_geom"])
    if not parts:
        return None, 0
    if props["_type"] == 1:
        return parts[0][0], 0
    best, best_len = None, -1.0
    for part in parts:
        if len(part) < 2:
            continue
        seg = [math.dist(part[k], part[k + 1]) for k in range(len(part) - 1)]
        total = sum(seg)
        if total > best_len:
            half, acc = total / 2, 0.0
            for k, s in enumerate(seg):
                if acc + s >= half and s > 0:
                    t = (half - acc) / s
                    (x0, y0), (x1, y1) = part[k], part[k + 1]
                    best = (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
                    break
                acc += s
            best_len = total
    return best, max(best_len, 0)


def _name(p: dict) -> str | None:
    for k in ("name:en", "name_en", "name:latin", "name"):
        v = p.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


# kind, layer, filter
_PLACE_KIND = {
    "continent": "continent", "country": "country", "state": "state", "province": "state",
    "city": "city", "town": "town", "village": "village", "hamlet": "hamlet",
    "suburb": "suburb", "quarter": "suburb", "neighbourhood": "neighbourhood", "island": "island",
}
_MAJOR_ROADS = {"motorway", "trunk", "primary", "secondary"}
MAX_POIS = 70
MAX_STREETS = 90


def tile_labels(z: int, x: int, y: int, data: bytes) -> list[dict]:
    layers = decode_tile(data)
    out: list[dict] = []

    def add(p: dict, kind: str, cls: str, rank: int | float):
        pt, _ = _anchor(p)
        name = _name(p)
        if pt is None or not name:
            return
        lon, lat = _lonlat(z, x, y, pt[0], pt[1], p["_extent"])
        if not (-180 <= lon <= 180 and -85.1 <= lat <= 85.1):
            return
        out.append({"n": name, "k": kind, "c": cls, "r": rank, "lat": lat, "lon": lon})

    for p in layers.get("place", []):
        kind = _PLACE_KIND.get(str(p.get("class")))
        if kind:
            rank = p.get("rank") if isinstance(p.get("rank"), (int, float)) else 10
            # From space, provinces would bury the country names: keep only the biggest few.
            if kind == "state" and (z <= 2 or (z <= 4 and rank > 2)):
                continue
            if p.get("capital") in (2, "2"):
                kind = "capital" if kind == "city" else kind
            add(p, kind, str(p.get("class")), rank)

    for p in layers.get("water_name", []):
        add(p, "water", str(p.get("class", "water")), 5)
    for p in layers.get("aerodrome_label", []):
        add(p, "airport", "aerodrome", 4)
    for p in layers.get("mountain_peak", []):
        add(p, "peak", "peak", p.get("rank") if isinstance(p.get("rank"), (int, float)) else 8)

    # Streets: one label per name per tile, on the longest stretch.
    streets: dict[str, dict] = {}
    for p in layers.get("transportation_name", []):
        name = _name(p)
        if not name or p.get("_type") != 2:
            continue
        _, ln = _anchor(p)
        cls = str(p.get("class", "minor"))
        prev = streets.get(name)
        if prev is None or ln > prev["_len"]:
            p["_len"] = ln
            p["_cls"] = cls
            streets[name] = p
    ranked = sorted(streets.values(), key=lambda s: (s["_cls"] not in _MAJOR_ROADS, -s["_len"]))
    for p in ranked[:MAX_STREETS]:
        add(p, "road" if p["_cls"] in _MAJOR_ROADS else "street", p["_cls"], 0 if p["_cls"] in _MAJOR_ROADS else 1)

    pois = [p for p in layers.get("poi", []) if _name(p)]
    pois.sort(key=lambda p: p.get("rank") if isinstance(p.get("rank"), (int, float)) else 99)
    for p in pois[:MAX_POIS]:
        add(p, "poi", str(p.get("subclass") or p.get("class") or "poi"), p.get("rank") or 50)
    return out


def _tile_template() -> str:
    with _lock:
        if _template["url"] and time.time() - _template["at"] < TEMPLATE_TTL:
            return _template["url"]
    try:
        r = requests.get(TILEJSON, timeout=15, headers={"User-Agent": USER_AGENT})
        r.raise_for_status()
        url = r.json()["tiles"][0]
    except (requests.RequestException, KeyError, ValueError) as exc:
        if _template["url"]:
            return _template["url"]  # stale but usable
        raise LabelsUnavailable(f"OpenFreeMap tile index unavailable: {exc}") from exc
    with _lock:
        _template.update(url=url, at=time.time())
    return url


def labels(z: int, x: int, y: int) -> dict:
    """Labels for one tile, from disk when we've seen it before."""
    if not (0 <= z <= MAX_ZOOM and 0 <= x < 2 ** z and 0 <= y < 2 ** z):
        raise ValueError("tile out of range")
    path = TILE_DIR / str(z) / str(x) / f"{y}.json"
    if path.exists():
        return {"z": z, "x": x, "y": y, "labels": json.loads(path.read_text()), "credit": CREDIT}
    url = _tile_template().format(z=z, x=x, y=y)
    try:
        r = requests.get(url, timeout=20, headers={"User-Agent": USER_AGENT})
    except requests.RequestException as exc:
        raise LabelsUnavailable(f"OpenFreeMap tile request failed: {exc}") from exc
    if r.status_code == 404 or not r.content:
        items: list[dict] = []
    elif not r.ok:
        raise LabelsUnavailable(f"OpenFreeMap returned {r.status_code}")
    else:
        items = tile_labels(z, x, y, r.content)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(items, ensure_ascii=False, separators=(",", ":")))
    return {"z": z, "x": x, "y": y, "labels": items, "credit": CREDIT}


def _tile_xy(lat: float, lon: float, z: int) -> tuple[int, int]:
    n = 2 ** z
    lat = max(-85.0, min(85.0, lat))
    x = int((lon + 180) / 360 * n) % n
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, max(0, min(n - 1, y))


def _distance_km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


_COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]


def _bearing_word(lat1, lon1, lat2, lon2) -> str:
    """Direction of point 1 as seen from point 2 ("38 km north-west of Newman")."""
    p1, p2 = math.radians(lat2), math.radians(lat1)
    dl = math.radians(lon1 - lon2)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    deg = (math.degrees(math.atan2(y, x)) + 360) % 360
    return _COMPASS[int((deg + 22.5) // 45) % 8]


_SETTLEMENT = {"capital": 0, "city": 1, "town": 2, "village": 3, "suburb": 3, "neighbourhood": 4, "hamlet": 5}


def nearest_place(lat: float, lon: float) -> dict | None:
    """The closest named settlement, looking wider until something is found (z12 → z10 → z8)."""
    for z, radius_km in ((12, 8), (10, 40), (8, 250)):
        x0, y0 = _tile_xy(lat, lon, z)
        best = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                x, y = (x0 + dx) % (2 ** z), y0 + dy
                if not 0 <= y < 2 ** z:
                    continue
                try:
                    items = labels(z, x, y)["labels"]
                except LabelsUnavailable:
                    continue
                for it in items:
                    if it["k"] not in _SETTLEMENT:
                        continue
                    d = _distance_km(lat, lon, it["lat"], it["lon"])
                    score = d * (1 + 0.15 * _SETTLEMENT[it["k"]])
                    if d <= radius_km and (best is None or score < best[0]):
                        best = (score, d, it)
        if best:
            _, d, it = best
            return {"name": it["n"], "kind": it["k"], "distance_km": round(d, 1),
                    "direction": _bearing_word(lat, lon, it["lat"], it["lon"]),
                    "lat": it["lat"], "lon": it["lon"], "source": CREDIT}
    return None
