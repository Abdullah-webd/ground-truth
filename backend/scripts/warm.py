"""Pre-compute change scans and place lookups for likely demo questions, so they answer instantly.

Usage: python scripts/warm.py [place ...]      (defaults to DEMO_PLACES)
Results land in data/cache/ and survive restarts.
"""

from __future__ import annotations

import sys
import time

from ground_truth.agent import _box_around
from ground_truth.change import detect_change
from ground_truth.geo import locate

DEMO_PLACES = [
    "Lagos, Nigeria", "Nairobi, Kenya", "Dubai, United Arab Emirates", "Las Vegas, Nevada",
    "Ludhiana, Punjab, India", "Porto Velho, Rondonia, Brazil", "Beijing, China", "Cairo, Egypt",
    "Phoenix, Arizona", "Jakarta, Indonesia", "Dhaka, Bangladesh", "Addis Ababa, Ethiopia",
]
YEAR_PAIRS = [(2018, 2024), (2017, 2025)]


def main(places: list[str]) -> None:
    failures = 0
    for name in places:
        try:
            p = locate(name)
        except Exception as exc:  # noqa: BLE001 - report and carry on with the next place
            print(f"FAIL locate {name}: {exc}")
            failures += 1
            continue
        for a, b in YEAR_PAIRS:
            t0 = time.perf_counter()
            try:
                r = detect_change(_box_around(p["lat"], p["lon"]), a, b)
                print(f"ok   {name:32s} {a}-{b}  {time.perf_counter() - t0:5.1f}s  {len(r['hotspots'])} hotspots"
                      f"{' (cached)' if r['cached'] else ''}")
            except Exception as exc:  # noqa: BLE001 - one failing place must not stop the rest
                print(f"FAIL {name} {a}-{b}: {str(exc)[:150]}")
                failures += 1
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main(sys.argv[1:] or DEMO_PLACES)
