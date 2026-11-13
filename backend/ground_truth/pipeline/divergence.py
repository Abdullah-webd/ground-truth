"""Find regions where the same variable trends significantly in opposite directions."""

from __future__ import annotations

import math

import numpy as np
from scipy import ndimage

from ..grids import Grid

EIGHT_CONNECTED = np.ones((3, 3), dtype=int)
DISTANCE_SCALE_KM = 3000.0   # pairs further apart than this score lower
TOP_CLUSTERS = 40
TOP_PAIRS = 12


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(min(1.0, a)))


TILE_DEG = 30.0  # regions are found within 30° tiles so a planet-wide trend still yields local places


def _tiled_labels(mask: np.ndarray, grid: Grid) -> np.ndarray:
    """Connected regions of `mask`, never crossing a 30° tile edge. Labels are unique across tiles."""
    tile = round(TILE_DEG / grid.step)
    labels = np.zeros(mask.shape, dtype=np.int32)
    offset = 0
    for r0 in range(0, mask.shape[0], tile):
        for c0 in range(0, mask.shape[1], tile):
            sub, n = ndimage.label(mask[r0:r0 + tile, c0:c0 + tile], structure=EIGHT_CONNECTED)
            labels[r0:r0 + tile, c0:c0 + tile] = np.where(sub > 0, sub + offset, 0)
            offset += n
    return labels


def _clusters(mask: np.ndarray, sign: int, slope: np.ndarray, z: np.ndarray, grid: Grid,
              min_cells: int) -> tuple[np.ndarray, list[dict]]:
    labels = _tiled_labels(mask, grid)
    area_row = grid.cell_area_km2()
    lats, lons = grid.lats, grid.lons
    out = []
    for lab, sl in enumerate(ndimage.find_objects(labels), start=1):
        if sl is None:
            continue
        cells = labels[sl] == lab
        n = int(cells.sum())
        if n < min_cells:
            labels[sl][cells] = 0
            continue
        rows, cols = np.nonzero(cells)
        rows, cols = rows + sl[0].start, cols + sl[1].start
        w = area_row[rows]
        area = float(w.sum())
        out.append({
            "label": lab, "sign": sign, "cells": n, "area_km2": round(area),
            "slope_per_decade": float(np.average(slope[rows, cols], weights=w)),
            "mean_abs_z": float(np.average(np.abs(z[rows, cols]), weights=w)),
            "lat": float(np.average(lats[rows], weights=w)),
            "lon": float(np.average(lons[cols], weights=w)),
            "bbox": [float(lons[cols].min() - grid.step / 2), float(lats[rows].min() - grid.step / 2),
                     float(lons[cols].max() + grid.step / 2), float(lats[rows].max() + grid.step / 2)],
        })
    for c in out:
        c["strength"] = c["area_km2"] * c["mean_abs_z"]
    out.sort(key=lambda c: c["strength"], reverse=True)
    return labels, out[:TOP_CLUSTERS]


def find_divergence(slope: np.ndarray, z: np.ndarray, significant: np.ndarray, grid: Grid,
                    min_cells: int) -> dict:
    """Significant increasing and decreasing clusters, and the strongest opposite-sign pairs."""
    up_labels, up = _clusters(significant & (slope > 0), 1, slope, z, grid, min_cells)
    down_labels, down = _clusters(significant & (slope < 0), -1, slope, z, grid, min_cells)
    for c in up:
        c["id"] = f"up-{c['label']}"
    for c in down:
        c["id"] = f"down-{c['label']}"
    pairs = []
    for a in up[:25]:
        for b in down[:25]:
            d = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
            score = math.sqrt(a["strength"] * b["strength"]) / (1 + d / DISTANCE_SCALE_KM)
            pairs.append({"increasing": a["id"], "decreasing": b["id"], "distance_km": round(d),
                          "score": score})
    pairs.sort(key=lambda p: p["score"], reverse=True)
    return {"clusters": up + down, "pairs": pairs[:TOP_PAIRS],
            "labels_up": up_labels.astype(np.int32), "labels_down": down_labels.astype(np.int32)}
