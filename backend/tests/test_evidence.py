"""95 % ranges and evidence cards (no network)."""

import numpy as np

from ground_truth import evidence
from ground_truth.agent import count_checked_numbers
from ground_truth.stats import sen_slope_ci


def test_range_brackets_a_real_trend_and_excludes_zero():
    rng = np.random.default_rng(3)
    t = np.arange(30)
    lo, hi = sen_slope_ci(0.1 * t + rng.normal(scale=0.5, size=30), t)
    assert lo < 0.1 < hi and lo > 0


def test_range_includes_zero_for_noise():
    rng = np.random.default_rng(4)
    lo, hi = sen_slope_ci(rng.normal(size=30), np.arange(30))
    assert lo < 0 < hi


def test_range_needs_enough_years():
    assert sen_slope_ci([1.0, 2.0, 3.0], [2000, 2001, 2002]) is None


def _trend(significant: bool, tested: bool = True) -> dict:
    return {
        "variable": "rainfall", "label": "Rainfall", "units": "mm", "period": [2001, 2024], "tested": tested,
        "slope_per_decade": -93.2 if tested else None, "q": 0.01 if significant else 0.48, "significant": significant,
        "slope_ci_per_decade": [-214.0, 56.0], "years": [2001, 2002], "values": [800.0, 790.0], "trend_line": None,
        "source": "NASA GPM IMERG", "method": "Mann-Kendall",
    }


def test_trend_card_tiers_and_source():
    proven = evidence.trend(_trend(True), "point", {"lat": 9.0, "lon": 7.5})
    assert proven["tier"] == "proven" and proven["source"] == "NASA GPM IMERG V07"
    assert proven["chance_luck"] == "about 1 in 100"
    assert evidence.trend(_trend(False), "point", None)["tier"] == "not_proven"
    assert evidence.trend(_trend(False, tested=False), "point", None)["tier"] == "no_data"
    assert abs(proven["total_change"] - (-93.2 / 10 * 23)) < 1e-6


def test_checked_numbers_skip_years_and_small_counts():
    text = "Rain fell 214 mm from 2001 to 2024, about 15% less; 7 of 23 months were warm."
    assert count_checked_numbers(text, []) == 3  # 214, 15, 23
    assert count_checked_numbers(text, ["214"]) == 2
