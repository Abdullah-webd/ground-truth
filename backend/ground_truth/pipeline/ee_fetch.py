"""Download an Earth Engine image as a numpy grid, aggregated to a coarse cell size."""

from __future__ import annotations

import logging
import time

import numpy as np

from ..config import init_earth_engine
from ..grids import Grid

log = logging.getLogger(__name__)
MAX_ATTEMPTS = 4


def _request(image, grid: Grid, col0: int, width: int) -> np.ndarray:
    import ee

    translate_x = -180 + col0 * grid.step
    request = {
        "expression": image,
        "fileFormat": "NUMPY_NDARRAY",
        "grid": {
            "dimensions": {"width": width, "height": grid.height},
            "affineTransform": {"scaleX": grid.step, "shearX": 0, "translateX": translate_x,
                                "shearY": 0, "scaleY": -grid.step, "translateY": 90},
            "crsCode": "EPSG:4326",
        },
    }
    arr = ee.data.computePixels(request)
    band = arr.dtype.names[0]
    out = arr[band].astype(np.float64)
    if np.ma.isMaskedArray(arr[band]):
        out = np.where(np.ma.getmaskarray(arr[band]), np.nan, out)
    return out


def fetch_grid(image, grid: Grid, *, projection=None, max_pixels: int = 4096, strips: int = 1) -> np.ndarray:
    """Mean-aggregate a single-band `image` onto `grid`. Masked pixels become NaN.

    Composites (mean, sum) lose their source projection; pass the source `projection` so the
    aggregation runs from native resolution.

    Splits the globe into longitude strips and retries with more strips when Earth Engine
    reports a timeout or memory limit.
    """
    import ee

    init_earth_engine()
    src = ee.Image(image)
    if projection is not None:
        src = src.setDefaultProjection(projection)
    agg = (src
           .reduceResolution(reducer=ee.Reducer.mean(), maxPixels=max_pixels)
           .reproject(crs="EPSG:4326", crsTransform=grid.affine)
           .unmask(-9999))

    attempt = 0
    while True:
        try:
            width = grid.width // strips
            parts = [_request(agg, grid, k * width, width if k < strips - 1 else grid.width - k * width)
                     for k in range(strips)]
            out = np.concatenate(parts, axis=1)
            out[out <= -9998] = np.nan
            return out
        except ee.EEException as exc:
            attempt += 1
            msg = str(exc)
            transient = any(k in msg.lower() for k in ("memory", "timed out", "too large", "computation",
                                                       "too many", "rate", "internal", "unavailable"))
            if not transient or attempt >= MAX_ATTEMPTS:
                raise RuntimeError(f"Earth Engine fetch failed after {attempt} attempts: {msg}") from exc
            if any(k in msg.lower() for k in ("memory", "timed out", "too large", "computation")):
                strips = min(strips * 2, 16)
            log.warning("Earth Engine error (%s); retrying with %d strips", msg[:120], strips)
            time.sleep(2 ** attempt)
