"""'Now vs normal': the last 30 days at a point compared with the 1991–2020 normal for the same days.

Data: NASA POWER daily point API (MERRA-2 based temperature, bias-corrected precipitation).
"""

from __future__ import annotations

import datetime as dt
import json
import math

import numpy as np
import requests

from .config import CACHE, USER_AGENT

POWER_DAILY = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMS = "T2M,PRECTOTCORR"
NORMAL = (1991, 2020)
WINDOW_DAYS = 30
TIMEOUT = 30


class UpstreamError(RuntimeError):
    """A NASA service failed or returned unusable data."""


def _get(lat: float, lon: float, start: dt.date, end: dt.date) -> dict[str, dict[str, float]]:
    try:
        r = requests.get(POWER_DAILY, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}, params={
            "parameters": PARAMS, "community": "RE", "latitude": lat, "longitude": lon,
            "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"), "format": "JSON"})
        r.raise_for_status()
        return r.json()["properties"]["parameter"]
    except (requests.RequestException, KeyError, ValueError) as exc:
        raise UpstreamError(f"NASA POWER request failed: {exc}") from exc


def _normal(lat: float, lon: float) -> dict[str, dict[str, float]]:
    """Daily values for the whole normal period, cached per 0.5° location (they never change)."""
    key = f"{round(lat * 2) / 2:+.1f}_{round(lon * 2) / 2:+.1f}"
    path = CACHE / "power_normals" / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    data = _get(lat, lon, dt.date(NORMAL[0], 1, 1), dt.date(NORMAL[1], 12, 31))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))
    return data


def _valid(series: dict[str, float]) -> dict[str, float]:
    return {k: v for k, v in series.items() if v is not None and v > -998}


def now_vs_normal(lat: float, lon: float, today: dt.date | None = None) -> dict:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError(f"coordinates out of range: {lat}, {lon}")
    today = today or dt.date.today()
    recent = _get(lat, lon, today - dt.timedelta(days=WINDOW_DAYS + 14), today)
    t_recent = _valid(recent["T2M"])
    if len(t_recent) < WINDOW_DAYS // 2:
        raise UpstreamError("NASA POWER has too few recent days for this location")
    days = sorted(t_recent)[-WINDOW_DAYS:]
    first = dt.datetime.strptime(days[0], "%Y%m%d").date()
    last = dt.datetime.strptime(days[-1], "%Y%m%d").date()
    month_days = {d[4:] for d in days}       # calendar days in the window, e.g. "1012"

    normal = _normal(lat, lon)
    out = {"lat": lat, "lon": lon, "window": [first.isoformat(), last.isoformat()],
           "normal_period": list(NORMAL), "source": "NASA POWER daily (MERRA-2, IMERG-corrected precipitation)"}

    t_norm = [v for k, v in _valid(normal["T2M"]).items() if k[4:] in month_days]
    t_now = float(np.mean([t_recent[d] for d in days]))
    t_mean, t_sd = float(np.mean(t_norm)), float(np.std(t_norm))
    # standard deviation of a 30-day mean, from yearly window means
    yearly = {}
    for k, v in _valid(normal["T2M"]).items():
        if k[4:] in month_days:
            yearly.setdefault(k[:4], []).append(v)
    window_means = [np.mean(v) for v in yearly.values() if len(v) >= len(month_days) * 0.8]
    sd_window = float(np.std(window_means)) if len(window_means) > 5 else t_sd
    out["temperature"] = {
        "units": "°C", "recent_mean": round(t_now, 2), "normal_mean": round(t_mean, 2),
        "anomaly": round(t_now - t_mean, 2),
        "standardized": round((t_now - t_mean) / sd_window, 2) if sd_window > 0 else None,
        "rank_note": _rank_note(t_now, window_means),
    }

    p_recent = _valid(recent["PRECTOTCORR"])
    p_days = [d for d in days if d in p_recent]
    if len(p_days) >= len(days) * 0.8:
        p_now = float(np.sum([p_recent[d] for d in p_days])) * len(days) / len(p_days)
        yearly_p = {}
        for k, v in _valid(normal["PRECTOTCORR"]).items():
            if k[4:] in month_days:
                yearly_p.setdefault(k[:4], []).append(v)
        totals = [float(np.sum(v)) for v in yearly_p.values() if len(v) >= len(month_days) * 0.8]
        p_norm = float(np.mean(totals)) if totals else math.nan
        out["rainfall"] = {
            "units": "mm", "recent_total": round(p_now, 1), "normal_total": round(p_norm, 1),
            "percent_of_normal": round(100 * p_now / p_norm) if p_norm > 0 else None,
            "rank_note": _rank_note(p_now, totals),
        }
    out["summary"] = _summary(out)
    return out


def _rank_note(value: float, history: list[float]) -> str | None:
    if len(history) < 10:
        return None
    above = sum(1 for h in history if h >= value)
    if above == 0:
        return f"higher than every year in {NORMAL[0]}–{NORMAL[1]}"
    below = sum(1 for h in history if h <= value)
    if below == 0:
        return f"lower than every year in {NORMAL[0]}–{NORMAL[1]}"
    return None


def _summary(o: dict) -> str:
    t = o["temperature"]
    parts = [(f"The last 30 days ({o['window'][0]} to {o['window'][1]}) averaged {t['recent_mean']} °C, "
             f"{abs(t['anomaly'])} °C {'warmer' if t['anomaly'] >= 0 else 'cooler'} than the "
             f"{NORMAL[0]}–{NORMAL[1]} normal for these days")]
    if t["rank_note"]:
        parts[0] += f" ({t['rank_note']})"
    if "rainfall" in o and o["rainfall"]["percent_of_normal"] is not None:
        r = o["rainfall"]
        parts.append(f"rainfall was {r['recent_total']} mm, {r['percent_of_normal']}% of normal")
    return "; ".join(parts) + "."
