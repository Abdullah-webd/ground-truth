"""Read-only access to the precomputed trend store (data/derived/<variable>/)."""

from __future__ import annotations

import functools
import io
import json
from dataclasses import dataclass

import numpy as np
from PIL import Image

from .config import DERIVED
from .grids import GRID_HALF, GRID_TWO, Grid
from .stats import fdr_bh, mann_kendall, verdict

VARIABLE_IDS = ("temperature", "vegetation", "rainfall", "water")
GRIDS = {"0.5deg": GRID_HALF, "2deg": GRID_TWO}


class NotFound(LookupError):
    """Unknown variable, or the store for it has not been built."""


class OutOfRange(ValueError):
    """Bad coordinates or region."""


@dataclass
class VariableStore:
    meta: dict
    grid: Grid
    years: np.ndarray
    values: np.ndarray          # (years, H, W)
    trend: dict[str, np.ndarray]
    divergence: dict

    @property
    def period(self) -> tuple[int, int]:
        return int(self.years[0]), int(self.years[-1])


@functools.cache
def load(var_id: str) -> VariableStore:
    if var_id not in VARIABLE_IDS:
        raise NotFound(f"unknown variable '{var_id}'; choose one of {', '.join(VARIABLE_IDS)}")
    folder = DERIVED / var_id
    if not (folder / "meta.json").exists():
        raise NotFound(f"the '{var_id}' store has not been built yet (run the pipeline)")
    meta = json.loads((folder / "meta.json").read_text())
    series = np.load(folder / "series.npz")
    trend = dict(np.load(folder / "trend.npz"))
    divergence = json.loads((folder / "divergence.json").read_text())
    return VariableStore(meta=meta, grid=GRIDS[meta["grid"]["name"]], years=series["years"],
                         values=series["values"], trend=trend, divergence=divergence)


def available() -> list[dict]:
    out = []
    for v in VARIABLE_IDS:
        try:
            m = load(v).meta
        except NotFound:
            continue
        out.append({k: m[k] for k in ("id", "label", "units", "long_name", "source", "citation", "url", "years",
                                       "increase_means", "decrease_means", "land_only", "legend", "palette",
                                       "summary", "years_missing", "method", "built")})
    return out


def _finite(x: float) -> float | None:
    return float(x) if np.isfinite(x) else None


def _validate_point(lat: float, lon: float) -> None:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise OutOfRange(f"coordinates out of range: lat {lat}, lon {lon}")


def point(var_id: str, lat: float, lon: float) -> dict:
    """Series and trend statistics for the grid cell containing (lat, lon)."""
    _validate_point(lat, lon)
    s = load(var_id)
    r, c = s.grid.index(lat, lon)
    tr = s.trend
    tested = bool(tr["tested"][r, c])
    slope, p, q = tr["slope_decade"][r, c], tr["p"][r, c], tr["q"][r, c]
    significant = bool(tr["significant"][r, c])
    values = s.values[:, r, c]
    m = s.meta
    result = {
        "variable": var_id, "label": m["label"], "units": m["units"],
        "cell": {"lat": float(s.grid.lats[r]), "lon": float(s.grid.lons[c]), "size_deg": s.grid.step},
        "years": s.years.tolist(), "values": [_finite(v) for v in values],
        "period": list(s.period), "tested": tested,
        "slope_per_decade": _finite(slope), "p": _finite(p), "q": _finite(q),
        "significant": significant,
        "direction": None if not tested else ("increasing" if slope > 0 else "decreasing"),
        "meaning": None if not significant else (m["increase_means"] if slope > 0 else m["decrease_means"]),
        "source": m["source"], "method": m["method"],
        "trend_line": None,
    }
    intercept = tr["intercept"][r, c]
    if tested and np.isfinite(intercept):
        y0, y1 = s.period
        per_year = float(slope) / 10
        result["trend_line"] = [[y0, float(intercept)], [y1, float(intercept + per_year * (y1 - y0))]]
    if not tested:
        no_data = not np.isfinite(values).any()
        result["verdict"] = (f"{m['label']}: no data here" + (" (land-only variable)." if m["land_only"] else ".")
                             if no_data else f"{m['label']}: not enough valid years here to test for a trend.")
    else:
        result["verdict"] = verdict(float(slope), m["units"], float(q), significant, s.period, m["label"]) + \
            " (p adjusted for testing the whole map)"
    return result


def _bbox(bbox: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise OutOfRange("bbox must be west,south,east,north with west<east and south<north")
    return west, south, east, north


def region(var_id: str, bbox: tuple[float, float, float, float]) -> dict:
    """Trend of the area-weighted regional mean, plus the share of the region's cells trending."""
    west, south, east, north = _bbox(bbox)
    s = load(var_id)
    rows, cols = s.grid.box(west, south, east, north)
    sub = s.values[:, rows, cols]
    weights = s.grid.cell_area_km2()[rows][:, None] * np.ones((1, sub.shape[2]))
    valid = np.isfinite(sub)
    w = np.where(valid, weights[None], 0.0)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = np.nansum(np.nan_to_num(sub) * w, axis=(1, 2)) / w.sum(axis=(1, 2))
    mean[w.sum(axis=(1, 2)) == 0] = np.nan
    m = s.meta
    res = mann_kendall(mean, times=s.years)
    slope, p = res.slope[0] * 10, res.p[0]
    significant = bool(np.isfinite(p) and p < 0.05)

    tr = s.trend
    tested = tr["tested"][rows, cols]
    sig = tr["significant"][rows, cols]
    sl = tr["slope_decade"][rows, cols]
    area = weights
    tested_area = float(area[tested].sum())
    share = (lambda mask: float(area[mask].sum() / tested_area) if tested_area else None)
    return {
        "variable": var_id, "label": m["label"], "units": m["units"], "bbox": [west, south, east, north],
        "years": s.years.tolist(), "values": [_finite(v) for v in mean], "period": list(s.period),
        "slope_per_decade": _finite(slope), "p": _finite(p), "significant": significant,
        "verdict": verdict(float(slope), m["units"], float(p), significant, s.period,
                           f"{m['label']} (regional average)"),
        "cells_tested": int(tested.sum()),
        "share_significant_increase": share(sig & (sl > 0)),
        "share_significant_decrease": share(sig & (sl < 0)),
        "source": m["source"], "method": m["method"],
    }


def _intersects(b: list[float], bbox: tuple[float, float, float, float]) -> bool:
    return not (b[2] < bbox[0] or b[0] > bbox[2] or b[3] < bbox[1] or b[1] > bbox[3])


def divergence(var_id: str, bbox: tuple[float, float, float, float] | None = None, limit: int = 3) -> dict:
    s = load(var_id)
    clusters = {c["id"]: c for c in s.divergence["clusters"]}
    pairs = s.divergence["pairs"]
    if bbox is not None:
        box = _bbox(bbox)
        pairs = [p for p in pairs if _intersects(clusters[p["increasing"]]["bbox"], box)
                 or _intersects(clusters[p["decreasing"]]["bbox"], box)]
    keep = ("id", "sign", "area_km2", "slope_per_decade", "lat", "lon", "bbox", "cells")
    out = []
    for p in pairs[:limit]:
        a, b = clusters[p["increasing"]], clusters[p["decreasing"]]
        out.append({"increasing": {k: a[k] for k in keep}, "decreasing": {k: b[k] for k in keep},
                    "distance_km": p["distance_km"]})
    m = s.meta
    return {"variable": var_id, "label": m["label"], "units": f"{m['units']} per decade",
            "increase_means": m["increase_means"], "decrease_means": m["decrease_means"],
            "period": list(s.period), "pairs": out}


def _rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in h):
        raise OutOfRange("color must be a 6-digit hex value")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def cluster_png(var_id: str, cluster_id: str, color: str | None = None) -> bytes:
    """Transparent full-globe PNG highlighting one divergence cluster."""
    s = load(var_id)
    sign, _, num = cluster_id.partition("-")
    if sign not in ("up", "down") or not num.isdigit():
        raise NotFound(f"unknown cluster '{cluster_id}'")
    labels = s.trend["labels_up" if sign == "up" else "labels_down"]
    mask = labels == int(num)
    if not mask.any():
        raise NotFound(f"unknown cluster '{cluster_id}'")
    rgba = np.zeros(mask.shape + (4,), dtype=np.uint8)
    palette = s.meta["palette"]
    rgb = _rgb(color) if color else _rgb(palette[-1] if sign == "up" else palette[0])
    rgba[mask] = (*rgb, 235)
    img = Image.fromarray(rgba, "RGBA").resize((mask.shape[1] * 4, mask.shape[0] * 4), Image.Resampling.NEAREST)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


__all__ = ["NotFound", "OutOfRange", "available", "cluster_png", "divergence", "fdr_bh", "load", "point",
           "region"]
