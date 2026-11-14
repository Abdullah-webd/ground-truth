"""Build the trend store.

    python -m ground_truth.pipeline.build                 # all variables
    python -m ground_truth.pipeline.build vegetation      # one variable
    python -m ground_truth.pipeline.build --force-trends  # recompute trends from cached years

Downloaded years are cached in data/raw/<variable>/<year>.npy, so an interrupted run resumes.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import logging
import sys
import time

import numpy as np
import requests

from ..config import DERIVED, RAW, USER_AGENT
from ..stats import METHOD, fdr_bh, mann_kendall
from . import render
from .divergence import find_divergence
from .variables import GISTEMP_GLOBAL_URL, VARIABLES, Variable

log = logging.getLogger("pipeline")
FDR_Q = 0.05
WORKERS = 4


def fetch_years(var: Variable) -> tuple[np.ndarray, np.ndarray]:
    years = np.arange(var.years[0], var.years[1] + 1)
    folder = RAW / var.id
    folder.mkdir(parents=True, exist_ok=True)

    def one(year: int) -> np.ndarray:
        path = folder / f"{year}.npy"
        if path.exists():
            return np.load(path)
        t0 = time.perf_counter()
        arr = var.fetch_year(int(year))
        if arr.shape != (var.grid.height, var.grid.width):
            raise RuntimeError(f"{var.id} {year}: unexpected shape {arr.shape}")
        np.save(path, arr)
        log.info("%s %d fetched in %.0fs (%.0f%% valid)", var.id, year, time.perf_counter() - t0,
                 100 * np.isfinite(arr).mean())
        return arr

    workers = 1 if var.id == "temperature" else WORKERS
    with cf.ThreadPoolExecutor(workers) as pool:
        cube = np.stack(list(pool.map(one, years)))
    return years, cube


def compute_trends(var: Variable, years: np.ndarray, cube: np.ndarray) -> dict:
    h, w = cube.shape[1:]
    flat = cube.reshape(len(years), -1).T
    res = mann_kendall(flat, times=years)
    q = fdr_bh(res.p)
    tested = np.isfinite(res.p)
    sig = tested & (q < FDR_Q)
    return {
        "slope_decade": (res.slope * 10).reshape(h, w),
        "intercept": res.intercept.reshape(h, w),
        "p": res.p.reshape(h, w), "q": q.reshape(h, w), "z": res.z.reshape(h, w),
        "rho": res.rho.reshape(h, w), "tested": tested.reshape(h, w), "significant": sig.reshape(h, w),
    }


def summarize(var: Variable, tr: dict) -> dict:
    area = var.grid.cell_area_km2()[:, None] * np.ones((1, var.grid.width))
    tested, sig, slope = tr["tested"], tr["significant"], tr["slope_decade"]
    tested_area = area[tested].sum()
    return {
        "cells_tested": int(tested.sum()),
        "cells_significant": int(sig.sum()),
        "share_area_significant_increase": float(area[sig & (slope > 0)].sum() / tested_area),
        "share_area_significant_decrease": float(area[sig & (slope < 0)].sum() / tested_area),
        "raw_p_below_005_share": float((tr["p"][tested] < 0.05).mean()),
    }


def global_temperature_check(years: np.ndarray, cube: np.ndarray) -> dict:
    """Compare the trend of our area-weighted global mean with NASA GISS's official global series."""
    from .variables import VARIABLES as V

    grid = V["temperature"].grid
    weights = np.cos(np.radians(grid.lats))[:, None] * np.ones((1, grid.width))
    ours = np.array([np.nansum(c * weights) / np.nansum(np.where(np.isfinite(c), weights, 0)) for c in cube])

    text = requests.get(GISTEMP_GLOBAL_URL, timeout=60, headers={"User-Agent": USER_AGENT}).text
    lines = text.splitlines()
    start = next(i for i, ln in enumerate(lines) if ln.startswith("Year,"))
    official = {}
    for ln in lines[start + 1:]:
        parts = ln.split(",")
        if parts[0].isdigit() and parts[13].strip() not in ("***", ""):
            official[int(parts[0])] = float(parts[13])
    common = [y for y in years if y in official]
    off = np.array([official[y] for y in common])
    ours_c = np.array([ours[list(years).index(y)] for y in common])
    t = np.array(common, dtype=float)
    ours_trend = mann_kendall(ours_c, times=t)
    off_trend = mann_kendall(off, times=t)
    diff = abs(ours_trend.slope[0] - off_trend.slope[0]) * 10
    return {
        "id": "gistemp-global-trend",
        "title": "Global temperature trend matches NASA GISS",
        "detail": f"Area-weighted mean of the 2° grid vs NASA GISS's published global series "
                  f"(GLB.Ts+dSST, J–D), {common[0]}–{common[-1]}.",
        "ours": round(float(ours_trend.slope[0] * 10), 4), "reference": round(float(off_trend.slope[0] * 10), 4),
        "units": "°C per decade", "tolerance": 0.02, "difference": round(float(diff), 4),
        "passed": bool(diff <= 0.02), "source": GISTEMP_GLOBAL_URL,
    }


def write_outputs(var: Variable, years: np.ndarray, cube: np.ndarray, tr: dict) -> dict:
    out = DERIVED / var.id
    out.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out / "series.npz", values=cube.astype(np.float32), years=years)

    min_cells = 2 if var.grid.step >= 2 else 8
    div = find_divergence(tr["slope_decade"], tr["z"], tr["significant"], var.grid, min_cells)
    np.savez_compressed(out / "trend.npz", **{k: v for k, v in tr.items()},
                        labels_up=div["labels_up"], labels_down=div["labels_down"])
    (out / "divergence.json").write_text(json.dumps(
        {"clusters": div["clusters"], "pairs": div["pairs"]}, indent=1))

    # time-lapse frames: temperature is already an anomaly; others are shown as departures
    anomalies = cube if var.id == "temperature" else cube - np.nanmean(cube, axis=0, keepdims=True)
    frame_limit = render.symmetric_limit(anomalies, pct=95)
    for k, year in enumerate(years):
        render.write_webp(render.frame(anomalies[k], frame_limit, var.palette), out / "frames" / f"{year}.webp",
                          size=render.FRAME_SIZE)

    sig_limit = render.symmetric_limit(tr["slope_decade"][tr["significant"]], pct=90)
    render.write_webp(render.significance(tr["slope_decade"], tr["tested"], tr["significant"], sig_limit,
                                          var.palette), out / "significance.webp")

    meta = {
        "id": var.id, "label": var.label, "units": var.units, "long_name": var.long_name,
        "source": var.source, "citation": var.citation, "url": var.url,
        "grid": {"name": var.grid.name, "step": var.grid.step},
        "years": [int(years[0]), int(years[-1])], "n_years": len(years),
        "years_missing": [int(y) for y, c in zip(years, cube, strict=True) if not np.isfinite(c).any()],
        "palette": list(var.palette), "increase_means": var.increase_means, "decrease_means": var.decrease_means,
        "land_only": var.land_only, "method": METHOD, "fdr_q": FDR_Q,
        "legend": {"significance": {"limit": sig_limit, "units": f"{var.units} per decade"},
                   "frames": {"limit": frame_limit, "units": var.units,
                              "baseline": "1951–1980" if var.id == "temperature" else
                              f"{years[0]}–{years[-1]} mean"}},
        "summary": summarize(var, tr),
        "built": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    return meta


def build(var_id: str) -> dict:
    var = VARIABLES[var_id]
    t0 = time.perf_counter()
    years, cube = fetch_years(var)
    tr = compute_trends(var, years, cube)
    meta = write_outputs(var, years, cube, tr)
    s = meta["summary"]
    log.info("%s done in %.0fs: %d cells tested, %.1f%% of area significant up, %.1f%% down",
             var.id, time.perf_counter() - t0, s["cells_tested"],
             100 * s["share_area_significant_increase"], 100 * s["share_area_significant_decrease"])
    if var.id == "temperature":
        check = global_temperature_check(years, cube)
        checks = DERIVED / "checks"
        checks.mkdir(parents=True, exist_ok=True)
        (checks / "gistemp_global.json").write_text(json.dumps(check, indent=1))
        log.info("GISTEMP check: ours %.3f vs official %.3f °C/decade -> %s", check["ours"], check["reference"],
                 "PASS" if check["passed"] else "FAIL")
    return meta


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        stream=sys.stdout, force=True)
    ap = argparse.ArgumentParser()
    ap.add_argument("variables", nargs="*", default=list(VARIABLES))
    args = ap.parse_args()
    failed = []
    for v in args.variables:
        try:
            build(v)
        except Exception:
            log.exception("%s failed", v)
            failed.append(v)
    if failed:
        raise SystemExit(f"failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
