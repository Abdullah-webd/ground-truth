"""Reproduce the trend-test comparison in docs/methods.md and write it as JSON for the Checks view.

Usage: python scripts/compare_trend_tests.py [--out ../data/derived/checks/trend_tests.json]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import warnings

import numpy as np
import pymannkendall as mk

from ground_truth.stats import mann_kendall

warnings.filterwarnings("ignore")
SEED = 7
REPS = 1500


def ar1(rng, rows, n, phi, sd=1.0, burn=60):
    """Stationary AR(1) noise: burn-in so each series starts at its long-run variance."""
    e = rng.normal(0, sd, (rows, n + burn))
    x = np.zeros_like(e)
    for k in range(1, n + burn):
        x[:, k] = phi * x[:, k - 1] + e[:, k]
    return x[:, burn:]


def rate(fn, data):
    p = np.array([fn(row) for row in data]) if fn is not None else None
    return float(np.nanmean(p < 0.05))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    rng = np.random.default_rng(SEED)

    methods = {
        "Original Mann-Kendall": lambda r: mk.original_test(r).p,
        "Hamed-Rao (all lags)": lambda r: mk.hamed_rao_modification_test(r).p,
        "Pre-whitening (von Storch)": lambda r: mk.pre_whitening_modification_test(r).p,
        "Trend-free pre-whitening (Yue)": lambda r: mk.trend_free_pre_whitening_modification_test(r).p,
        "Ours (variance correction + worst-case check)": None,
    }
    null_cases = {f"n={n}, AR(1) phi={phi}": ar1(rng, REPS, n, phi)
                  for n in (18, 25, 45) for phi in (0.0, 0.3, 0.6)}
    power_cases = {
        "Global-temperature-like (45 yr, 0.2/decade, sd 0.1)": 0.02 * np.arange(45) + rng.normal(0, .1, (REPS, 45)),
        "Strong (25 yr, 0.5/decade, sd 0.1)": 0.05 * np.arange(25) + rng.normal(0, .1, (REPS, 25)),
        "Moderate (25 yr, 0.3/decade, sd 0.3)": 0.03 * np.arange(25) + rng.normal(0, .3, (REPS, 25)),
        "Trend + autocorrelated noise (25 yr, AR 0.4)": 0.04 * np.arange(25) + ar1(rng, REPS, 25, .4, .3),
        "Accelerating decline (18 yr, Greenland-like)":
            -(20 * np.arange(18) + 2.0 * np.arange(18) ** 2) + rng.normal(0, 20, (REPS, 18)),
        "Rise then flatten (18 yr, S-curve)":
            400 * np.tanh((np.arange(18) - 6) / 4) + rng.normal(0, 25, (REPS, 18)),
        "Step change (25 yr)": np.where(np.arange(25) > 12, 1.0, 0) + rng.normal(0, .5, (REPS, 25)),
    }
    result = {"alpha": 0.05, "replicates": REPS, "seed": SEED, "false_alarm": {}, "power": {}}
    for name, fn in methods.items():
        ours = (lambda d: float(np.mean(mann_kendall(d).p < 0.05))) if fn is None else (lambda d, f=fn: rate(f, d))
        result["false_alarm"][name] = {c: ours(d) for c, d in null_cases.items()}
        result["power"][name] = {c: ours(d) for c, d in power_cases.items()}
        fa = result["false_alarm"][name].values()
        pw = result["power"][name].values()
        print(f"{name:42s} false alarms {min(fa):.3f}-{max(fa):.3f}   power {min(pw):.2f}-{max(pw):.2f}")

    if args.out:
        out = pathlib.Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=2))
        print("wrote", out)


if __name__ == "__main__":
    main()
