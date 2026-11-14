"""Trend statistics for whole grids at once.

Method (chosen by simulation, see docs/methods.md):
- Mann-Kendall S on the original series (does the series tend to rise or fall?),
- Theil-Sen slope (how much per time step),
- variance correction for autocorrelation (Yue & Wang 2004): effective sample size from an
  AR(1) model. The lag-1 autocorrelation is estimated on residuals from a quadratic fit (so a
  curved, e.g. accelerating, trend is not mistaken for persistence) and bias-corrected for short
  records, r' = (n r + 3) / (n - 6), clipped to [0, 0.95]. The constants were calibrated by
  simulation (scripts/compare_trend_tests.py), extending Kendall's (1954) correction,
- a second opinion for smooth curved trends: a Monte Carlo p-value against trend-free AR(1)
  noise at the strongest persistence allowed (0.95); the reported p is the smaller of the two,
- Benjamini-Hochberg false discovery rate across grid cells (Wilks 2016).

On 18-45 year records this kept false alarms at 2.2-6.3 % for independent and autocorrelated
noise while detecting most realistic linear, accelerating and step-like trends. Hamed-Rao gave
7-22 % false alarms; pre-whitening missed 24-77 % of strong trends; correcting with linear
detrending detected only 45 % of Greenland-like accelerating declines.

S, its tie-corrected variance and the Theil-Sen slope match `pymannkendall.original_test`
(tests compare them); the correction is validated by calibration tests.
"""

from __future__ import annotations

import functools
from dataclasses import dataclass

import numpy as np
from scipy.stats import norm

ALPHA = 0.05
MIN_VALID_FRACTION = 0.8   # cells with fewer valid years are not tested
MIN_YEARS = 8              # below this a trend test is not meaningful
MAX_RHO = 0.95
RHO_BIAS_C, RHO_BIAS_D = 3.0, 6.0  # r' = (n r + c) / (n - d), calibrated by simulation
NULL_SIMS = 20000                  # Monte Carlo series for the worst-case persistence null
CHUNK = 8192               # rows per vectorized block (memory: CHUNK * n^2 / 2 floats)
METHOD = ("Mann-Kendall with bias-corrected AR(1) variance correction (Yue & Wang 2004; quadratic detrending), "
          "Theil-Sen slope, Benjamini-Hochberg FDR")


@dataclass(frozen=True)
class TrendResult:
    """Per-series results. Every array has shape (rows,). NaN where not tested."""

    slope: np.ndarray       # Theil-Sen slope per time step (per year for annual data)
    intercept: np.ndarray   # value of the Theil-Sen line at the first time step
    s: np.ndarray           # Mann-Kendall S
    var_s: np.ndarray       # tie-corrected variance of S, before the autocorrelation correction
    rho: np.ndarray         # bias-corrected lag-1 autocorrelation of the quadratic-detrended series
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


@functools.cache
def _worst_case_null(n: int) -> np.ndarray:
    """Sorted |S| of trend-free AR(1) series with the strongest persistence we allow (MAX_RHO).

    A series whose S is extreme even against this null is trending whatever its true
    persistence, so its p-value is the smaller of the formula p and this Monte Carlo p. This
    rescues smooth curved trends (e.g. Greenland's ice loss) that the AR(1) formula mistakes for
    persistence, and adds almost no false alarms (docs/methods.md).
    """
    rng = np.random.default_rng(1000 + n)
    burn = 100
    out = []
    i, j = np.triu_indices(n, k=1)
    for _ in range(NULL_SIMS // 4000):
        e = rng.standard_normal((4000, n + burn))
        x = np.empty_like(e)
        x[:, 0] = e[:, 0] / np.sqrt(1 - MAX_RHO ** 2)
        for k in range(1, n + burn):
            x[:, k] = MAX_RHO * x[:, k - 1] + e[:, k]
        x = x[:, burn:]
        out.append(np.abs(np.sign(x[:, j] - x[:, i]).sum(axis=1)))
    return np.sort(np.concatenate(out))


def _block(x: np.ndarray, t: np.ndarray) -> dict[str, np.ndarray]:
    """All statistics for rows of `x` (rows, n) sampled at shared times `t` (n,)."""
    n = x.shape[1]
    i, j = np.triu_indices(n, k=1)
    diffs = x[:, j] - x[:, i]
    s = np.sign(diffs).sum(axis=1)
    var_s = (n * (n - 1) * (2 * n + 5) - _tie_term(x)) / 18.0
    tau = s / (0.5 * n * (n - 1))

    slope = np.median(diffs / (t[j] - t[i]), axis=1)
    intercept = np.median(x - slope[:, None] * (t - t[0]), axis=1)

    tc = (t - t.mean()) / (t.std() or 1.0)
    design = np.vstack([np.ones(n), tc, tc ** 2]).T
    coef, *_ = np.linalg.lstsq(design, x.T, rcond=None)
    y = x - (design @ coef).T
    with np.errstate(invalid="ignore", divide="ignore"):
        r1 = np.sum(y[:, :-1] * y[:, 1:], axis=1) / np.sum(y * y, axis=1)
    rho = np.clip((n * r1 + RHO_BIAS_C) / (n - RHO_BIAS_D), 0.0, MAX_RHO)
    k = np.arange(1, n)
    var_ratio = 1 + 2 * np.sum((1 - k / n)[None, :] * rho[:, None] ** k[None, :], axis=1)

    with np.errstate(invalid="ignore", divide="ignore"):
        sd = np.sqrt(var_s * var_ratio)
        z = np.where(s > 0, (s - 1) / sd, np.where(s < 0, (s + 1) / sd, 0.0))
    p_formula = 2 * norm.sf(np.abs(z))
    null = _worst_case_null(n)
    p_worst = (NULL_SIMS - np.searchsorted(null, np.abs(s), side="left") + 1) / (NULL_SIMS + 1)
    p = np.minimum(p_formula, p_worst)
    return {"slope": slope, "intercept": intercept, "s": s, "var_s": var_s, "rho": rho,
            "var_ratio": var_ratio, "z": z, "p": p, "tau": tau}


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


def sen_slope_ci(values, times=None, alpha: float = 0.05) -> tuple[float, float] | None:
    """Two-sided (1 - alpha) confidence range for the Theil-Sen slope of one series (per unit of `times`).

    Gilbert (1987, ch. 16): rank the n' pairwise slopes; the limits are the slopes at ranks
    (n' - C)/2 and (n' + C)/2 + 1 with C = z_(1-alpha/2) * sqrt(Var(S)). Var(S) is the same
    autocorrelation-inflated variance the significance test uses, so the range and "proven" agree.
    """
    from scipy.stats import norm

    y = np.asarray(values, dtype=float)
    t = np.arange(len(y), dtype=float) if times is None else np.asarray(times, dtype=float)
    ok = np.isfinite(y)
    y, t = y[ok], t[ok]
    n = len(y)
    if n < 4:
        return None
    i, j = np.triu_indices(n, k=1)
    dt = t[j] - t[i]
    slopes = np.sort((y[j] - y[i])[dt != 0] / dt[dt != 0])
    n_pairs = len(slopes)
    if n_pairs < 3:
        return None
    res = mann_kendall(y[None, :], times=t)
    var_s = float(res.var_s[0] * (res.var_ratio[0] if np.isfinite(res.var_ratio[0]) else 1.0))
    c = float(norm.ppf(1 - alpha / 2) * np.sqrt(max(var_s, 0.0)))
    lo_rank = (n_pairs - c) / 2           # 1-based ranks, possibly fractional: interpolate
    hi_rank = (n_pairs + c) / 2 + 1

    def at(rank: float) -> float:
        k = min(max(rank - 1, 0.0), n_pairs - 1.0)
        f = int(np.floor(k))
        frac = k - f
        return float(slopes[f] + (slopes[min(f + 1, n_pairs - 1)] - slopes[f]) * frac)

    return at(lo_rank), at(hi_rank)
