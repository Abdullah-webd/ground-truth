"""Trend statistics for whole grids at once.

Method (chosen by simulation, see docs/methods.md):
- Mann-Kendall S on the original series (does the series tend to rise or fall?),
- Theil-Sen slope (how much per time step),
- variance correction for autocorrelation (Yue & Wang 2004): effective sample size from an
  AR(1) model fitted to the Sen-detrended series, with the lag-1 autocorrelation bias-corrected
  for short records, r' = (n r + 1) / (n - 4) (Kendall 1954), clipped to [0, 0.95],
- Benjamini-Hochberg false discovery rate across grid cells (Wilks 2016).

On 25-45 year records this kept false alarms at 2.9-6.9 % for independent and autocorrelated
noise while detecting 72-100 % of realistic trends. Hamed-Rao gave 7-22 % false alarms;
pre-whitening detected only 23-76 % of strong trends.

S, its tie-corrected variance and the Theil-Sen slope match `pymannkendall.original_test`
(tests compare them); the correction is validated by calibration tests.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.stats import norm

ALPHA = 0.05
MIN_VALID_FRACTION = 0.8   # cells with fewer valid years are not tested
MIN_YEARS = 8              # below this a trend test is not meaningful
MAX_RHO = 0.95
CHUNK = 8192               # rows per vectorized block (memory: CHUNK * n^2 / 2 floats)
METHOD = ("Mann-Kendall with bias-corrected AR(1) variance correction (Yue & Wang 2004), "
          "Theil-Sen slope, Benjamini-Hochberg FDR")


@dataclass(frozen=True)
class TrendResult:
    """Per-series results. Every array has shape (rows,). NaN where not tested."""

    slope: np.ndarray       # Theil-Sen slope per time step (per year for annual data)
    intercept: np.ndarray   # value of the Theil-Sen line at the first time step
    s: np.ndarray           # Mann-Kendall S
    var_s: np.ndarray       # tie-corrected variance of S, before the autocorrelation correction
    rho: np.ndarray         # bias-corrected lag-1 autocorrelation of the detrended series
    var_ratio: np.ndarray   # variance inflation n / n* applied for autocorrelation
    z: np.ndarray
    p: np.ndarray           # two-sided p-value
    tau: np.ndarray         # Kendall's tau
    n_valid: np.ndarray


def _tie_term(x: np.ndarray) -> np.ndarray:
    """Sum over tie groups of t(t-1)(2t+5) for each row."""
    rows, n = x.shape
    xs = np.sort(x, axis=1)
    new_group = np.ones((rows, n), dtype=bool)
    new_group[:, 1:] = xs[:, 1:] != xs[:, :-1]
    group = np.cumsum(new_group, axis=1) - 1
    flat = (np.arange(rows)[:, None] * n + group).ravel()
    t = np.bincount(flat, minlength=rows * n).reshape(rows, n).astype(float)
    return np.sum(t * (t - 1) * (2 * t + 5), axis=1)


def _block(x: np.ndarray, t: np.ndarray) -> dict[str, np.ndarray]:
    """All statistics for rows of `x` (rows, n) sampled at shared times `t` (n,)."""
    rows, n = x.shape
    i, j = np.triu_indices(n, k=1)
    diffs = x[:, j] - x[:, i]
    s = np.sign(diffs).sum(axis=1)
    var_s = (n * (n - 1) * (2 * n + 5) - _tie_term(x)) / 18.0
    tau = s / (0.5 * n * (n - 1))

    slope = np.median(diffs / (t[j] - t[i]), axis=1)
    intercept = np.median(x - slope[:, None] * (t - t[0]), axis=1)

    resid = x - slope[:, None] * t
    y = resid - resid.mean(axis=1, keepdims=True)
    with np.errstate(invalid="ignore", divide="ignore"):
        r1 = np.sum(y[:, :-1] * y[:, 1:], axis=1) / np.sum(y * y, axis=1)
    rho = np.clip((n * r1 + 1) / (n - 4), 0.0, MAX_RHO)
    k = np.arange(1, n)
    var_ratio = 1 + 2 * np.sum((1 - k / n)[None, :] * rho[:, None] ** k[None, :], axis=1)

    with np.errstate(invalid="ignore", divide="ignore"):
        sd = np.sqrt(var_s * var_ratio)
        z = np.where(s > 0, (s - 1) / sd, np.where(s < 0, (s + 1) / sd, 0.0))
    p = 2 * norm.sf(np.abs(z))
    return dict(slope=slope, intercept=intercept, s=s, var_s=var_s, rho=rho,
                var_ratio=var_ratio, z=z, p=p, tau=tau)


def mann_kendall(series: np.ndarray, times: np.ndarray | None = None) -> TrendResult:
    """Trend test and slope for each row of `series` (rows, n_times); NaN marks missing values.

    `times` gives the time of each column (default 0..n-1); the slope is per unit of `times`.
    """
    x = np.asarray(series, dtype=float)
    if x.ndim == 1:
        x = x[None, :]
    rows, n = x.shape
    t = np.arange(n, dtype=float) if times is None else np.asarray(times, dtype=float)
    keys = ("slope", "intercept", "s", "var_s", "rho", "var_ratio", "z", "p", "tau")
    out = {k: np.full(rows, np.nan) for k in keys}
    valid = np.isfinite(x)
    n_valid = valid.sum(axis=1)

    with np.errstate(invalid="ignore"):
        lo = np.min(np.where(valid, x, np.inf), axis=1)
        hi = np.max(np.where(valid, x, -np.inf), axis=1)
    testable = (n_valid >= max(MIN_YEARS, int(np.ceil(MIN_VALID_FRACTION * n)))) & (hi > lo)

    complete = np.flatnonzero(testable & (n_valid == n))
    for start in range(0, complete.size, CHUNK):
        idx = complete[start:start + CHUNK]
        for key, v in _block(x[idx], t).items():
            out[key][idx] = v

    for r in np.flatnonzero(testable & (n_valid < n)):
        keep = valid[r]
        for key, v in _block(x[r, keep][None, :], t[keep]).items():
            out[key][r] = v[0]

    out["p"][~np.isfinite(out["z"])] = np.nan
    return TrendResult(n_valid=n_valid, **out)


def fdr_bh(p: np.ndarray) -> np.ndarray:
    """Benjamini-Hochberg adjusted p-values (q). NaN p-values stay NaN and are not counted."""
    p = np.asarray(p, dtype=float)
    q = np.full(p.shape, np.nan)
    ok = np.isfinite(p)
    pv = p[ok]
    m = pv.size
    if m == 0:
        return q
    order = np.argsort(pv)
    ranked = pv[order] * m / np.arange(1, m + 1)
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    adjusted = np.empty(m)
    adjusted[order] = np.minimum(ranked, 1.0)
    q[ok] = adjusted
    return q


def format_p(p: float) -> str:
    if not np.isfinite(p):
        return "n/a"
    if p < 0.001:
        return "< 0.001"
    return f"= {p:.3f}"


def verdict(slope_per_decade: float, units: str, p: float, significant: bool,
            period: tuple[int, int], label: str) -> str:
    """Plain-English verdict built only from computed numbers."""
    if not np.isfinite(slope_per_decade) or not np.isfinite(p):
        return f"{label}: not enough valid data to test for a trend."
    direction = "increase" if slope_per_decade > 0 else "decrease"
    rate = f"{slope_per_decade:+.3g} {units} per decade"
    span = f"{period[0]}–{period[1]}"
    if significant:
        return f"{label}: statistically significant {direction}, {rate} ({span}), p {format_p(p)}."
    return (f"{label}: change of {rate} ({span}) is not statistically significant "
            f"(p {format_p(p)}); it could be natural variability.")
