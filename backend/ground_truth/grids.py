"""Regular latitude/longitude grids (cell centres, north-up)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

EARTH_RADIUS_KM = 6371.0


@dataclass(frozen=True)
class Grid:
    name: str
    step: float  # degrees

    @property
    def height(self) -> int:
        return round(180 / self.step)

    @property
    def width(self) -> int:
        return round(360 / self.step)

    @property
    def lats(self) -> np.ndarray:
        return 90 - self.step * (np.arange(self.height) + 0.5)

    @property
    def lons(self) -> np.ndarray:
        return -180 + self.step * (np.arange(self.width) + 0.5)

    @property
    def affine(self) -> list[float]:
        """Earth Engine crsTransform: [scaleX, shearX, translateX, shearY, scaleY, translateY]."""
        return [self.step, 0, -180, 0, -self.step, 90]

    def index(self, lat: float, lon: float) -> tuple[int, int]:
        """Row and column of the cell containing (lat, lon)."""
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError(f"coordinates out of range: {lat}, {lon}")
        row = min(int((90 - lat) / self.step), self.height - 1)
        col = min(int((lon + 180) / self.step), self.width - 1)
        return row, col

    def cell_area_km2(self) -> np.ndarray:
        """Area of each cell row (height,), in km²."""
        lat1 = np.radians(90 - self.step * np.arange(self.height))
        lat2 = np.radians(90 - self.step * (np.arange(self.height) + 1))
        return (EARTH_RADIUS_KM ** 2) * np.radians(self.step) * np.abs(np.sin(lat1) - np.sin(lat2))

    def box(self, west: float, south: float, east: float, north: float) -> tuple[slice, slice]:
        """Row and column slices covering a bounding box (no antimeridian wrap)."""
        r0, c0 = self.index(min(north, 90), max(west, -180))
        r1, c1 = self.index(max(south, -90), min(east, 180))
        return slice(r0, r1 + 1), slice(c0, c1 + 1)


GRID_HALF = Grid("0.5deg", 0.5)
GRID_TWO = Grid("2deg", 2.0)
