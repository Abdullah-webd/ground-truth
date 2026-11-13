"""Science checks: do our results reproduce well-documented findings? Shown on the Checks page.

Each regional check states the published finding, the region, and the expected direction. A check
passes when the regional-average trend has the expected sign and p < 0.05. Results are reported
whether they pass or fail.
"""

from __future__ import annotations

import json

from . import store
from .config import DERIVED

REGIONAL = [
    {
        "id": "arctic-amplification", "variable": "temperature", "bbox": (-180, 66.5, 180, 90),
        "title": "The Arctic warms much faster than the globe",
        "finding": "The Arctic has warmed nearly four times faster than the globe since 1979.",
        "reference": "Rantanen, M. et al. (2022). Communications Earth & Environment 3, 168.",
        "expect": "increase", "ratio_to_global": 2.5,
    },
    {
        "id": "greenland-mass-loss", "variable": "water", "bbox": (-73, 60, -12, 83),
        "title": "Greenland is losing ice mass",
        "finding": "GRACE shows sustained mass loss from the Greenland ice sheet since 2002.",
        "reference": "Velicogna, I. et al. (2020). Geophysical Research Letters 47, e2020GL087291.",
        "expect": "decrease",
    },
    {
        "id": "north-india-groundwater", "variable": "water", "bbox": (70, 25, 80, 32),
        "title": "Northern India's groundwater is declining",
        "finding": "GRACE revealed rapid groundwater depletion in north-west India, driven by irrigation.",
        "reference": "Rodell, M., Velicogna, I. & Famiglietti, J. (2009). Nature 460, 999–1002.",
        "expect": "decrease",
    },
    {
        "id": "global-greening", "variable": "vegetation", "bbox": (70, 18, 135, 54),
        "title": "China and India are greening",
        "finding": "Satellite records show strong greening over China and India, from forestation and cropland.",
        "reference": "Chen, C. et al. (2019). Nature Sustainability 2, 122–129.",
        "expect": "increase",
    },
    {
        "id": "sahel-rainfall-recovery", "variable": "rainfall", "bbox": (-17, 10, 38, 18),
        "title": "Sahel rainfall has partly recovered",
        "finding": "After the 1970s–80s drought, Sahel rainfall has partly recovered.",
        "reference": "Biasutti, M. (2019). WIREs Climate Change 10, e591.",
        "expect": "increase",
    },
]


def regional_checks() -> list[dict]:
    results = []
    for c in REGIONAL:
        try:
            r = store.region(c["variable"], c["bbox"])
        except store.NotFound as exc:
            results.append({**_public(c), "status": "not built", "detail": str(exc), "passed": None})
            continue
        slope, p = r["slope_per_decade"], r["p"]
        ok_sign = slope is not None and ((slope > 0) if c["expect"] == "increase" else (slope < 0))
        passed = bool(ok_sign and p is not None and p < 0.05)
        detail = f"Regional average {slope:+.3g} {r['units']} per decade ({r['period'][0]}–{r['period'][1]}), " \
                 f"p {'< 0.001' if p < 0.001 else f'= {p:.3f}'}."
        if "ratio_to_global" in c:
            g = store.region(c["variable"], (-180, -90, 180, 90))["slope_per_decade"]
            ratio = slope / g if g else None
            detail += f" That is {ratio:.1f}× the global rate of {g:+.3g} {r['units']} per decade."
            passed = passed and ratio is not None and ratio >= c["ratio_to_global"]
        results.append({**_public(c), "ours": round(slope, 4) if slope is not None else None, "p": p,
                        "units": f"{r['units']} per decade", "detail": detail, "passed": passed,
                        "status": "pass" if passed else "fail"})
    return results


def _public(c: dict) -> dict:
    return {k: (list(v) if k == "bbox" else v) for k, v in c.items() if k != "ratio_to_global"}


def all_checks() -> dict:
    folder = DERIVED / "checks"
    out = {"regional": regional_checks()}
    g = folder / "gistemp_global.json"
    out["global_temperature"] = json.loads(g.read_text()) if g.exists() else None
    t = folder / "trend_tests.json"
    out["trend_tests"] = json.loads(t.read_text()) if t.exists() else None
    return out
