"""Turn grids into map overlay PNGs (equirectangular, north-up, full globe).

Overlays are drawn smoothly: values are interpolated bilinearly between grid-cell centres up to
OUTPUT_WIDTH, the way NASA draws its own GISTEMP maps, instead of hard-edged cells. This is
display only; every number the app reports comes from the grid cell itself.
"""

from __future__ import annotations

import pathlib

import numpy as np
from PIL import Image
from scipy import ndimage

NOT_SIGNIFICANT_RGBA = (96, 108, 122, 78)     # dim slate: tested, but change not proven
OUTPUT_WIDTH = 2880                           # 0.125° per pixel


def _hex(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def colormap(values: np.ndarray, limit: float, palette: tuple[str, ...]) -> np.ndarray:
    """Map values in [-limit, limit] onto a diverging palette. Returns (H, W, 3) uint8."""
    stops = np.array([_hex(h) for h in palette], dtype=float)
    pos = np.linspace(-limit, limit, len(stops))
    v = np.clip(np.nan_to_num(values), -limit, limit)
    rgb = np.stack([np.interp(v, pos, stops[:, c]) for c in range(3)], axis=-1)
    return rgb.round().astype(np.uint8)


def symmetric_limit(values: np.ndarray, pct: float = 98) -> float:
    finite = np.abs(values[np.isfinite(values)])
    if finite.size == 0:
        return 1.0
    lim = float(np.percentile(finite, pct))
    return lim if lim > 0 else float(finite.max() or 1.0)


def _factor(shape: tuple[int, ...]) -> float:
    return OUTPUT_WIDTH / shape[1]


def smooth(values: np.ndarray) -> np.ndarray:
    """Bilinear upsampling between cell centres; gaps stay gaps (with soft edges)."""
    f = _factor(values.shape)
    valid = np.isfinite(values)
    if not valid.any():
        return np.full((round(values.shape[0] * f), round(values.shape[1] * f)), np.nan)
    # Fill gaps from the nearest valid cell so interpolation near coasts doesn't pull in NaN.
    idx = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    filled = values[tuple(idx)]
    up = ndimage.zoom(filled, f, order=1, mode="nearest", grid_mode=True)
    up_valid = ndimage.zoom(valid.astype(float), f, order=1, mode="nearest", grid_mode=True)
    up[up_valid < 0.5] = np.nan
    return up


def smooth_mask(mask: np.ndarray) -> np.ndarray:
    return ndimage.zoom(mask.astype(float), _factor(mask.shape), order=1, mode="nearest", grid_mode=True) >= 0.5


FRAME_SIZE = (1440, 720)  # 4× the 0.5° data grid: smooth on the globe, ~0.5 MB per year to stream


def write_webp(rgba: np.ndarray, path: pathlib.Path, size: tuple[int, int] | None = None, quality: int = 90) -> None:
    """Save an RGBA map as WebP (keeps transparency, ~4× smaller than PNG for these smooth colour maps).

    Resizing happens in premultiplied alpha so coloured areas don't get dark fringes at their edges."""
    path.parent.mkdir(parents=True, exist_ok=True)
    im = Image.fromarray(rgba, "RGBA")
    if size and im.size != size:
        im = im.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")
    im.save(path, "WEBP", quality=quality, method=6)


def _intensity(values: np.ndarray, limit: float) -> np.ndarray:
    """0..1 strength of each value. Square-root scaling so moderate values still read on a dark globe."""
    return np.sqrt(np.clip(np.abs(np.nan_to_num(values)) / limit, 0, 1))


def _ramped(values: np.ndarray, limit: float, palette: tuple[str, ...], a_min: int, a_max: int) -> np.ndarray:
    """Colour by sign and strength; opacity grows with strength so weak signals stay translucent."""
    k = _intensity(values, limit)
    rgba = np.zeros(values.shape + (4,), dtype=np.uint8)
    rgba[..., :3] = colormap(np.sign(np.nan_to_num(values)) * k * limit, limit, palette)
    rgba[..., 3] = (a_min + (a_max - a_min) * k).round().astype(np.uint8)
    return rgba


def frame(values: np.ndarray, limit: float, palette: tuple[str, ...]) -> np.ndarray:
    up = smooth(values)
    rgba = _ramped(up, limit, palette, 40, 230)
    rgba[..., 3][~np.isfinite(up)] = 0
    return rgba


def significance(slope: np.ndarray, tested: np.ndarray, significant: np.ndarray, limit: float,
                 palette: tuple[str, ...]) -> np.ndarray:
    up_slope = smooth(np.where(tested, slope, np.nan))
    up_tested = smooth_mask(tested) & np.isfinite(up_slope)
    up_sig = smooth_mask(tested & significant) & up_tested
    rgba = np.zeros(up_slope.shape + (4,), dtype=np.uint8)
    rgba[up_tested & ~up_sig] = NOT_SIGNIFICANT_RGBA
    rgba[up_sig] = _ramped(up_slope, limit, palette, 110, 245)[up_sig]
    return rgba
