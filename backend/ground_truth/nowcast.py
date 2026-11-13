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


def _get(lat: float, lon: float, start: dt.date, end: dt.date, params: str = PARAMS) -> dict[str, dict[str, float]]:
    try:
        r = requests.get(POWER_DAILY, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}, params={
            "parameters": params, "community": "RE", "latitude": lat, "longitude": lon,
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
    out = {"lat": lat, "lon": lon, "window": [first.isoformat(), last.isoformat()], "window_days": len(days),
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


HISTORY_PARAMS = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR"
MAX_HISTORY_MONTHS = 60


def recent_history(lat: float, lon: float, months: int, today: dt.date | None = None) -> dict:
    """Day-by-day NASA POWER record for the last `months` months, summarised by month and compared
    with the 1991–2020 normal: temperature range (hottest day, coldest night), monthly means and
    rainfall totals. Answers "what was the temperature range over the last two years?"."""
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError(f"coordinates out of range: {lat}, {lon}")
    months = int(months)
    if not 1 <= months <= MAX_HISTORY_MONTHS:
        raise ValueError(f"months must be between 1 and {MAX_HISTORY_MONTHS}; for longer periods use the trend tools")
    today = today or dt.date.today()
    start = today - dt.timedelta(days=round(months * 30.44))
    data = _get(lat, lon, start, today, HISTORY_PARAMS)
    t_mean, t_max, t_min, rain = (_valid(data[k]) for k in ("T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR"))
    days = sorted(t_mean)
    if len(days) < 20:
        raise UpstreamError("NASA POWER has too little recent data for this location")
    normal = _normal(lat, lon)
    n_t, n_p = _valid(normal["T2M"]), _valid(normal["PRECTOTCORR"])

    def normal_month(month: str) -> tuple[float | None, float | None]:
        temps = [v for k, v in n_t.items() if k[4:6] == month]
        by_year: dict[str, float] = {}
        for k, v in n_p.items():
            if k[4:6] == month:
                by_year[k[:4]] = by_year.get(k[:4], 0.0) + v
        return (float(np.mean(temps)) if temps else None,
                float(np.mean(list(by_year.values()))) if by_year else None)

    table = []
    for ym in sorted({d[:6] for d in days}):
        ds = [d for d in days if d.startswith(ym)]
        n_mean, n_rain = normal_month(ym[4:])
        mean = float(np.mean([t_mean[d] for d in ds]))
        complete = len(ds) >= 25
        rain_total = float(sum(rain.get(d, 0.0) for d in ds))
        table.append({
            "month": f"{ym[:4]}-{ym[4:]}", "days": len(ds), "complete": complete,
            "mean_c": round(mean, 2),
            "hottest_day_c": round(max(t_max[d] for d in ds if d in t_max), 1),
            "coldest_night_c": round(min(t_min[d] for d in ds if d in t_min), 1),
            "rain_mm": round(rain_total, 1),
            "anomaly_c": round(mean - n_mean, 2) if n_mean is not None else None,
            "rain_percent_of_normal": round(100 * rain_total / n_rain) if (complete and n_rain) else None,
        })

    hottest = max((d for d in days if d in t_max), key=lambda d: t_max[d])
    coldest = min((d for d in days if d in t_min), key=lambda d: t_min[d])
    complete_months = [m for m in table if m["complete"] and m["anomaly_c"] is not None]
    warmer = sum(1 for m in complete_months if m["anomaly_c"] > 0)
    iso = lambda d: f"{d[:4]}-{d[4:6]}-{d[6:]}"
    mean_anom = float(np.mean([m["anomaly_c"] for m in complete_months])) if complete_months else None
    return {
        "lat": lat, "lon": lon, "period": [iso(days[0]), iso(days[-1])], "days": len(days),
        "months_requested": months, "normal_period": list(NORMAL),
        "temperature": {
            "mean_c": round(float(np.mean([t_mean[d] for d in days])), 2),
            "hottest_day_c": round(t_max[hottest], 1), "hottest_day": iso(hottest),
            "coldest_night_c": round(t_min[coldest], 1), "coldest_night": iso(coldest),
            "range_c": round(t_max[hottest] - t_min[coldest], 1),
            "average_daily_swing_c": round(float(np.mean([t_max[d] - t_min[d] for d in days if d in t_max and d in t_min])), 1),
            "mean_anomaly_vs_normal_c": round(mean_anom, 2) if mean_anom is not None else None,
            "months_warmer_than_normal": warmer, "complete_months": len(complete_months),
        },
        "rainfall": {"total_mm": round(float(sum(rain.values())), 1),
                     "wettest_month": max(table, key=lambda m: m["rain_mm"])["month"],
                     "driest_complete_month": min((m for m in table if m["complete"]), key=lambda m: m["rain_mm"],
                                                  default=table[0])["month"]},
        "months": table,
        "source": "NASA POWER daily (MERRA-2 temperature, IMERG-corrected precipitation); normal 1991-2020",
        "note": "Recent conditions, not a long-term trend; trends use decades of NASA records.",
    }
