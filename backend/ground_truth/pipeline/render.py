"""Turn grids into map overlay PNGs (equirectangular, north-up, full globe)."""

from __future__ import annotations

import pathlib

import numpy as np
from PIL import Image

NOT_SIGNIFICANT_RGBA = (96, 108, 122, 78)     # dim slate: tested, but change not proven
UPSCALE = 4                                   # nearest-neighbour so cells stay crisp on the globe


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


def write_png(rgba: np.ndarray, path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(rgba, "RGBA")
    if UPSCALE > 1:
        img = img.resize((img.width * UPSCALE, img.height * UPSCALE), Image.Resampling.NEAREST)
    img.save(path, optimize=True)


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
    rgba = _ramped(values, limit, palette, 40, 230)
    rgba[..., 3][~np.isfinite(values)] = 0
    return rgba


def significance(slope: np.ndarray, tested: np.ndarray, significant: np.ndarray, limit: float,
                 palette: tuple[str, ...]) -> np.ndarray:
    rgba = np.zeros(slope.shape + (4,), dtype=np.uint8)
    rgba[tested & ~significant] = NOT_SIGNIFICANT_RGBA
    sig = tested & significant
    rgba[sig] = _ramped(slope, limit, palette, 110, 245)[sig]
    return rgba
