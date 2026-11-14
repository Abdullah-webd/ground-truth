"""Evidence cards: the data behind every answer, shown to the user next to it.

Each card is built from a tool's *full* result (not the model's summary of it), so what the user sees is
exactly what the analyst read. Three tiers keep claims honest:

- "proven"      a long-term trend that passed the significance test (95 %, corrected for the whole map)
- "not_proven"  a long-term trend that did not pass: could be natural year-to-year variation
- "observed"    something the satellites recorded (recent weather, land change, fires): real, but not a
                tested long-term trend
"""

from __future__ import annotations

SHORT_SOURCE = {
    "temperature": ("NASA GISTEMP v4", "https://data.giss.nasa.gov/gistemp/"),
    "vegetation": ("NASA MODIS Terra (MOD13C1)", "https://lpdaac.usgs.gov/products/mod13c1v061/"),
    "rainfall": ("NASA GPM IMERG V07", "https://gpm.nasa.gov/data/imerg"),
    "water": ("NASA GRACE / GRACE-FO (JPL mascons)", "https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/"),
    "groundwater": ("NASA GLDAS-2.2 (with GRACE)", "https://disc.gsfc.nasa.gov/datasets/GLDAS_CLSM025_DA1_D_2.2/summary"),
}


def _chance(p: float | None) -> str | None:
    if p is None:
        return None
    if p < 0.001:
        return "less than 1 in 1,000"
    if p < 0.1:
        n = round(1 / p)
        return f"about 1 in {round(n, -1) if n >= 100 else n}"
    return f"about {max(1, min(9, round(p * 10)))} in 10"


def trend(r: dict, scope: str, place: dict | None = None) -> dict:
    """A long-term NASA trend at a point or across a region."""
    tested = r.get("tested", True) and r.get("slope_per_decade") is not None
    p = r.get("q") if r.get("q") is not None else r.get("p")
    significant = bool(r.get("significant")) and tested
    name, url = SHORT_SOURCE.get(r["variable"], (r.get("source", ""), None))
    period = r.get("period")
    total = None
    if tested and period:
        total = round(r["slope_per_decade"] / 10 * (period[1] - period[0]), 4)
    return {
        "kind": "trend",
        "tier": "proven" if significant else ("not_proven" if tested else "no_data"),
        "variable": r["variable"],
        "label": r.get("label"),
        "scope": scope,
        "place": place,
        "source": name,
        "source_url": url,
        "source_detail": r.get("source"),
        "method": r.get("method"),
        "period": period,
        "units": r.get("units"),
        "slope_per_decade": r.get("slope_per_decade"),
        "ci_per_decade": r.get("slope_ci_per_decade"),
        "total_change": total,
        "p": p,
        "chance_luck": _chance(p) if tested else None,
        "years": r.get("years"),
        "values": r.get("values"),
        "trend_line": r.get("trend_line"),
        "cell": r.get("cell"),
        "bbox": r.get("bbox"),
        "share_significant_increase": r.get("share_significant_increase"),
        "share_significant_decrease": r.get("share_significant_decrease"),
    }


def now(r: dict, place: dict) -> dict:
    t = r["temperature"]
    rain = r.get("rainfall") or {}
    return {
        "kind": "observed",
        "tier": "observed",
        "topic": "recent_weather",
        "title": "The last 30 days compared with normal",
        "place": place,
        "source": "NASA POWER",
        "source_url": "https://power.larc.nasa.gov/",
        "period": r.get("window"),
        "normal_period": r.get("normal_period"),
        "facts": [
            {"label": "Temperature", "value": t.get("recent_mean"), "units": "°C"},
            {"label": "Compared with normal", "value": t.get("anomaly"), "units": "°C", "signed": True},
            *([{"label": "Rain, % of normal", "value": rain.get("percent_of_normal"), "units": "%"}]
              if rain.get("percent_of_normal") is not None else []),
        ],
        "summary": r.get("summary"),
    }


def history(r: dict, place: dict) -> dict:
    t = r["temperature"]
    return {
        "kind": "observed",
        "tier": "observed",
        "topic": "recent_history",
        "title": f"Daily NASA records, {r['period'][0]} to {r['period'][1]}",
        "place": place,
        "source": "NASA POWER (daily)",
        "source_url": "https://power.larc.nasa.gov/",
        "period": r.get("period"),
        "normal_period": r.get("normal_period"),
        "facts": [
            {"label": "Average temperature", "value": t.get("mean_c"), "units": "°C"},
            {"label": "Compared with normal", "value": t.get("mean_anomaly_vs_normal_c"), "units": "°C", "signed": True},
            {"label": "Hottest day", "value": t.get("hottest_day_c"), "units": "°C", "note": t.get("hottest_day")},
            {"label": "Coldest night", "value": t.get("coldest_night_c"), "units": "°C", "note": t.get("coldest_night")},
            {"label": "Total rain", "value": r["rainfall"].get("total_mm"), "units": "mm"},
        ],
        "months": [{"month": m["month"], "anomaly_c": m.get("anomaly_c"), "rain_mm": m.get("rain_mm")} for m in r["months"]],
    }


def change(r: dict, place: dict) -> dict:
    top = sorted(r["hotspots"], key=lambda h: -h["area_km2"])[:4]
    return {
        "kind": "observed",
        "tier": "observed",
        "topic": "land_change",
        "title": f"Land that changed between {r['year_a']} and {r['year_b']}",
        "place": place,
        "source": "Google DeepMind AlphaEarth + Dynamic World (not a NASA dataset)",
        "source_url": "https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_SATELLITE_EMBEDDING_V1_ANNUAL",
        "period": [r["year_a"], r["year_b"]],
        "facts": [
            {"label": "Changed patches found", "value": len(r["hotspots"]), "units": ""},
            {"label": "Share of the area that changed strongly", "value": round(r["share_strong_change"] * 100, 2), "units": "%"},
            *[{"label": f"{h['from']} → {h['to']}", "value": round(h["area_km2"], 2), "units": "km²"} for h in top],
        ],
    }


def fires(r: dict, bbox: list[float]) -> dict:
    return {
        "kind": "observed",
        "tier": "observed",
        "topic": "fires",
        "title": "Fires seen in the last 24 hours",
        "place": {"bbox": bbox},
        "source": "NASA FIRMS (VIIRS)",
        "source_url": "https://firms.modaps.eosdis.nasa.gov/",
        "period": ["last 24 hours"],
        "facts": [{"label": "Fire detections", "value": r["count"], "units": ""}],
    }
