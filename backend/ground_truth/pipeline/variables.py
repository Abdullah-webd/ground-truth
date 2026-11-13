"""The four NASA variables: how to build one year of each, and how to describe them."""

from __future__ import annotations

import gzip
import logging
import pathlib
import shutil
from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np
import requests

from ..config import RAW, USER_AGENT, init_earth_engine
from ..grids import GRID_HALF, GRID_TWO, Grid
from .ee_fetch import fetch_grid

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Variable:
    id: str
    label: str
    units: str               # units of the annual value
    long_name: str
    source: str
    citation: str
    url: str
    grid: Grid
    years: tuple[int, int]   # inclusive, complete years only
    palette: tuple[str, ...]  # diverging, low -> high (colour-blind safe ColorBrewer)
    increase_means: str      # plain-English meaning of a positive trend
    decrease_means: str
    land_only: bool
    fetch_year: Callable[[int], np.ndarray] = field(repr=False, compare=False)


# ColorBrewer diverging palettes (colour-blind safe)
RDBU = ("#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b")
BRBG = ("#8c510a", "#bf812d", "#dfc27d", "#f6e8c3", "#f5f5f5", "#c7eae5", "#80cdc1", "#35978f", "#01665e")


# ---------------------------------------------------------------- vegetation (MODIS NDVI)
def _ndvi_year(year: int) -> np.ndarray:
    import ee

    init_earth_engine()
    col = ee.ImageCollection("MODIS/061/MOD13C1").select("NDVI")
    img = col.filterDate(f"{year}-01-01", f"{year + 1}-01-01").mean()  # already scaled to NDVI units
    return fetch_grid(img, GRID_HALF, projection=col.first().projection())


# ---------------------------------------------------------------- rainfall (GPM IMERG)
def _rain_year(year: int) -> np.ndarray:
    import ee

    init_earth_engine()
    col = ee.ImageCollection("NASA/GPM_L3/IMERG_MONTHLY_V07").select("precipitation")
    months = col.filterDate(f"{year}-01-01", f"{year + 1}-01-01")
    if months.size().getInfo() != 12:
        raise RuntimeError(f"IMERG {year}: expected 12 months")

    def to_mm(img):
        start = ee.Date(img.get("system:time_start"))
        hours = start.advance(1, "month").difference(start, "hour")
        return img.multiply(hours)  # mm/hr * hours in month = mm

    total = months.map(to_mm).sum()
    return fetch_grid(total, GRID_HALF, projection=col.first().projection(), max_pixels=1024)


# ---------------------------------------------------------------- land water (GRACE / GRACE-FO)
MIN_GRACE_MONTHS = 9


def _water_year(year: int) -> np.ndarray:
    import ee

    init_earth_engine()
    col = ee.ImageCollection("NASA/GRACE/MASS_GRIDS_V04/MASCON").select("lwe_thickness")
    months = col.filterDate(f"{year}-01-01", f"{year + 1}-01-01")
    n = months.size().getInfo()
    if n < MIN_GRACE_MONTHS:  # GRACE -> GRACE-FO gap (mid-2017 to mid-2018)
        log.info("GRACE %s: only %d months, year marked missing", year, n)
        return np.full((GRID_HALF.height, GRID_HALF.width), np.nan)
    mean = months.mean().multiply(10)  # cm -> mm of equivalent water
    grid = fetch_grid(mean, GRID_HALF, projection=col.first().projection(), max_pixels=256)
    return np.where(_land_mask(), grid, np.nan)


_LAND: np.ndarray | None = None


def _land_mask() -> np.ndarray:
    """True where at least half of a 0.5° cell is land or ice (ETOPO1)."""
    global _LAND
    if _LAND is None:
        path = RAW / "land_mask_0.5deg.npy"
        if path.exists():
            _LAND = np.load(path)
        else:
            import ee

            init_earth_engine()
            etopo = ee.Image("NOAA/NGDC/ETOPO1")
            land = etopo.select("ice_surface").gt(0).toFloat()
            frac = fetch_grid(land, GRID_HALF, projection=etopo.projection(), max_pixels=4096)
            _LAND = np.nan_to_num(frac) >= 0.5
            path.parent.mkdir(parents=True, exist_ok=True)
            np.save(path, _LAND)
    return _LAND


# ---------------------------------------------------------------- temperature (GISTEMP v4)
GISTEMP_URL = "https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz"
GISTEMP_GLOBAL_URL = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv"
MIN_TEMP_MONTHS = 10


def gistemp_path() -> pathlib.Path:
    nc = RAW / "gistemp" / "gistemp1200_GHCNv4_ERSSTv5.nc"
    if not nc.exists():
        nc.parent.mkdir(parents=True, exist_ok=True)
        gz = nc.with_suffix(".nc.gz")
        log.info("downloading GISTEMP grid")
        with requests.get(GISTEMP_URL, stream=True, timeout=120, headers={"User-Agent": USER_AGENT}) as r:
            r.raise_for_status()
            with open(gz, "wb") as f:
                shutil.copyfileobj(r.raw, f)
        with gzip.open(gz, "rb") as src, open(nc, "wb") as dst:
            shutil.copyfileobj(src, dst)
        gz.unlink()
    return nc


def _temp_year(year: int) -> np.ndarray:
    import xarray as xr

    with xr.open_dataset(gistemp_path()) as ds:
        da = ds["tempanomaly"].sel(time=str(year))
        valid_months = da.notnull().sum("time")
        annual = da.mean("time").where(valid_months >= MIN_TEMP_MONTHS)
        annual = annual.sortby("lat", ascending=False).sortby("lon")
        lats, lons = annual["lat"].values, annual["lon"].values
        if not (np.allclose(lats, GRID_TWO.lats) and np.allclose(lons, GRID_TWO.lons)):
            raise RuntimeError("GISTEMP grid does not match the expected 2° grid")
        return annual.values.astype(np.float64)


VARIABLES: dict[str, Variable] = {
    v.id: v for v in [
        Variable(
            id="temperature", label="Surface temperature", units="°C",
            long_name="Annual mean surface temperature anomaly (vs 1951–1980)",
            source="NASA GISS Surface Temperature Analysis (GISTEMP v4), 1200 km smoothing, 2° grid",
            citation="GISTEMP Team (2026). GISS Surface Temperature Analysis, version 4. NASA GISS. "
                     "Lenssen et al. (2024), JGR Atmospheres.",
            url="https://data.giss.nasa.gov/gistemp/",
            grid=GRID_TWO, years=(1980, 2025), palette=RDBU,
            increase_means="warming", decrease_means="cooling", land_only=False, fetch_year=_temp_year),
        Variable(
            id="vegetation", label="Vegetation greenness", units="NDVI",
            long_name="Annual mean Normalized Difference Vegetation Index",
            source="NASA MODIS Terra MOD13C1 v6.1, 16-day 0.05° NDVI, aggregated to 0.5°",
            citation="Didan, K. (2021). MODIS/Terra Vegetation Indices 16-Day L3 Global 0.05Deg CMG V061. "
                     "NASA EOSDIS LP DAAC. doi:10.5067/MODIS/MOD13C1.061",
            url="https://lpdaac.usgs.gov/products/mod13c1v061/",
            grid=GRID_HALF, years=(2001, 2025), palette=BRBG,
            increase_means="greening", decrease_means="browning", land_only=True, fetch_year=_ndvi_year),
        Variable(
            id="rainfall", label="Rainfall", units="mm",
            long_name="Annual total precipitation",
            source="NASA GPM IMERG Final Run v07, monthly 0.1°, aggregated to 0.5°",
            citation="Huffman, G. J. et al. (2023). GPM IMERG Final Precipitation L3 1 month 0.1 degree x "
                     "0.1 degree V07. NASA GES DISC. doi:10.5067/GPM/IMERG/3B-MONTH/07",
            url="https://gpm.nasa.gov/data/imerg",
            grid=GRID_HALF, years=(2001, 2024), palette=BRBG,
            increase_means="getting wetter", decrease_means="getting drier", land_only=False,
            fetch_year=_rain_year),
        Variable(
            id="water", label="Land water storage", units="mm",
            long_name="Annual mean terrestrial water storage anomaly (liquid water equivalent)",
            source="NASA JPL GRACE and GRACE-FO mascons RL06.3 v04, 0.5° (land only)",
            citation="Watkins, M. M. et al. (2015). Improved methods for observing Earth's time variable mass "
                     "distribution with GRACE using spherical cap mascons. JGR Solid Earth. "
                     "doi:10.5067/TEMSC-3JC63",
            url="https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/",
            grid=GRID_HALF, years=(2003, 2023), palette=BRBG,
            increase_means="gaining water", decrease_means="losing water", land_only=True,
            fetch_year=_water_year),
    ]
}
