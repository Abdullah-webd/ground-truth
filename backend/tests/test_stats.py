import numpy as np
import pymannkendall as mk
import pytest
from statsmodels.stats.multitest import multipletests

from ground_truth.stats import fdr_bh, format_p, mann_kendall, verdict

rng = np.random.default_rng(42)


def _ar1(rows, n, phi, sd=1.0):
    x = np.zeros((rows, n))
    e = rng.normal(0, sd, (rows, n))
    for k in range(1, n):
        x[:, k] = phi * x[:, k - 1] + e[:, k]
    return x


def _assert_core_matches_reference(series):
    """S, tie-corrected variance, tau and Sen's slope must equal pymannkendall's original test."""
    res = mann_kendall(series)
    for r, row in enumerate(series):
        ref = mk.original_test(row)
        assert res.s[r] == ref.s
        assert res.var_s[r] == pytest.approx(ref.var_s, rel=1e-12)
        assert res.tau[r] == pytest.approx(ref.Tau)
        assert res.slope[r] == pytest.approx(ref.slope, rel=1e-12, abs=1e-14)


def test_core_matches_reference():
    t = np.arange(25)
    series = np.vstack([0.03 * t + rng.normal(0, 0.2, 25), -0.05 * t + rng.normal(0, 0.5, 25),
                        rng.normal(0, 1, (40, 25))])
    _assert_core_matches_reference(series)


def test_core_matches_reference_with_ties():
    _assert_core_matches_reference(np.round(rng.normal(0, 1, (30, 20)), 1))


def test_no_autocorrelation_means_no_inflation():
    """With rho clipped at 0 the p-value equals the original Mann-Kendall test."""
    x = 0.05 * np.arange(30) + rng.normal(0, 1, (200, 30))
    res = mann_kendall(x)
    flat = res.rho == 0
    assert flat.any()
    for r in np.flatnonzero(flat)[:20]:
        assert res.p[r] == pytest.approx(mk.original_test(x[r]).p, rel=1e-9)


@pytest.mark.parametrize("n,phi,upper", [(25, 0.0, 0.06), (25, 0.3, 0.07), (25, 0.6, 0.09),
                                         (45, 0.3, 0.07), (45, 0.6, 0.08)])
def test_false_alarm_rate_near_alpha(n, phi, upper):
    """On trend-free data about 5 % should be flagged, even when years are autocorrelated."""
    rate = np.mean(mann_kendall(_ar1(6000, n, phi)).p < 0.05)
    assert 0.015 < rate < upper


@pytest.mark.parametrize("name,data,min_power", [
    ("global temperature-like", lambda: 0.02 * np.arange(45) + rng.normal(0, 0.1, (1000, 45)), 0.99),
    ("strong, short", lambda: 0.05 * np.arange(25) + rng.normal(0, 0.1, (1000, 25)), 0.99),
    ("moderate", lambda: 0.03 * np.arange(25) + rng.normal(0, 0.3, (1000, 25)), 0.75),
    ("trend + autocorrelated noise", lambda: 0.04 * np.arange(25) + _ar1(1000, 25, 0.4, 0.3), 0.6),
])
def test_detects_real_trends(name, data, min_power):
    assert np.mean(mann_kendall(data()).p < 0.05) >= min_power, name


def test_slope_recovers_known_rate_and_uses_times():
    years = np.arange(1981, 2025)
    x = 0.017 * (years - 1981) + 26 + rng.normal(0, 0.05, years.size)
    res = mann_kendall(x, times=years)
    assert res.slope[0] == pytest.approx(0.017, abs=0.002)
    assert res.intercept[0] == pytest.approx(26, abs=0.1)


def test_gaps_use_true_time_spacing():
    years = np.arange(2000, 2025, dtype=float)
    x = 0.1 * (years - 2000)
    x = x + rng.normal(0, 0.01, x.size)
    x[[3, 4, 10]] = np.nan
    res = mann_kendall(x, times=years)
    assert res.n_valid[0] == 22
    assert res.slope[0] == pytest.approx(0.1, abs=0.005)
    assert res.p[0] < 1e-4


def test_untestable_rows_are_nan():
    n = 20
    series = np.vstack([np.full(n, 3.0),
                        np.where(np.arange(n) < 10, np.nan, 1.0) + np.arange(n),
                        np.full(n, np.nan)])
    res = mann_kendall(series)
    assert np.isnan(res.p).all() and np.isnan(res.slope).all()


def test_fdr_removes_map_wide_false_alarms():
    res = mann_kendall(rng.normal(0, 1, (6000, 25)))
    assert np.mean(fdr_bh(res.p) < 0.05) < 0.005


def test_fdr_matches_statsmodels():
    p = rng.uniform(0, 1, 500) ** 3
    p[[3, 77]] = np.nan
    q = fdr_bh(p)
    ok = np.isfinite(p)
    _, ref, _, _ = multipletests(p[ok], method="fdr_bh")
    np.testing.assert_allclose(q[ok], ref, rtol=1e-12)
    assert np.isnan(q[~ok]).all()
    assert np.isnan(fdr_bh(np.array([np.nan, np.nan]))).all()


def test_verdict_text():
    yes = verdict(0.17, "°C", 1e-7, True, (1981, 2024), "Temperature")
    assert "statistically significant increase" in yes and "+0.17 °C per decade" in yes
    assert "< 0.001" in yes
    no = verdict(-0.4, "mm", 0.31, False, (2001, 2024), "Rainfall")
    assert "not statistically significant" in no and "= 0.310" in no
    assert "not enough valid data" in verdict(float("nan"), "mm", 0.5, False, (2001, 2024), "Rainfall")
    assert format_p(float("nan")) == "n/a"


def test_speed_on_a_global_grid():
    """A 0.5° land grid (~70k cells) x 25 years must finish quickly enough for the pipeline."""
    import time
    x = rng.normal(0, 1, (70000, 25))
    t0 = time.perf_counter()
    mann_kendall(x)
    assert time.perf_counter() - t0 < 30
