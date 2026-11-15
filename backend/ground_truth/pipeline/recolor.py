"""Re-render the confirmed-trend maps with a colour scale set by Africa's own confirmed cells.

Global 90th-percentile scales are dominated by polar and ice-sheet cells, which left Africa pale. Uses the saved
trend.npz, so no data is re-downloaded. Usage: python -m ground_truth.pipeline.recolor
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from ..config import DERIVED
from . import render
from .variables import VARIABLES

AFRICA = (-20.0, -36.0, 55.0, 38.0)  # west, south, east, north
PCT = 90


def africa_limit(var, tr) -> float:
    lats, lons = var.grid.lats, var.grid.lons
    w, s, e, n = AFRICA
    box = ((lats >= s) & (lats <= n))[:, None] & ((lons >= w) & (lons <= e))[None, :]
    sel = tr["significant"] & box
    if sel.sum() < 20:
        sel = tr["significant"]
    return render.symmetric_limit(tr["slope_decade"][sel], pct=PCT)


def main() -> None:
    for vid, var in VARIABLES.items():
        out = Path(DERIVED) / vid
        tr = dict(np.load(out / "trend.npz"))
        lim = africa_limit(var, tr)
        render.write_webp(render.significance(tr["slope_decade"], tr["tested"], tr["significant"], lim, var.palette),
                          out / "significance.webp")
        meta = json.loads((out / "meta.json").read_text())
        old = meta["legend"]["significance"]["limit"]
        meta["legend"]["significance"]["limit"] = lim
        meta["legend"]["significance"]["scale"] = "Colour range set by Africa's confirmed trends (90th percentile); stronger changes elsewhere show at full colour."
        (out / "meta.json").write_text(json.dumps(meta, indent=1))
        print(f"{vid}: limit {old:.4g} -> {lim:.4g} {meta['legend']['significance']['units']}")


if __name__ == "__main__":
    main()
