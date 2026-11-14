"""The Ground Truth analyst: an OpenAI tool-calling loop over our data services.

One agent, a handful of read-only tools, hard limits per turn. Tool results are compact JSON for
the model; UI commands (fly the camera, show layers, open objects) are streamed to the browser as
they happen. Every number the analyst states should come from a tool result; a post-turn check
flags any that don't.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field

from openai import APIError, APIStatusError, OpenAI

from . import store
from .change import ChangeError, EarthEngineUnavailable, detect_change
from .config import AGENT_MODEL, CACHE, OPENAI_API_KEY
from .fires import fires
from .geo import PlaceNotFound, locate
from .nowcast import UpstreamError, now_vs_normal, recent_history

log = logging.getLogger("agent")

FALLBACK_MODEL = "gpt-5.5"
MAX_TOOL_CALLS = 8
MAX_ROUNDS = 6
MAX_CHANGE_CALLS = 2
TURN_SECONDS = 90
MAX_OUTPUT_TOKENS = 4000
VARIABLES = list(store.VARIABLE_IDS)

INSTRUCTIONS = """You are Ground Truth, an Earth-change analyst on a 3D globe used by NASA Space Apps judges and scientists.

How you work:
- Always use tools to get data. Never answer from memory. Every number you state must come from a tool result in this conversation.
- For "what changed around <place>": locate_place, then detect_change (default 2018 to 2024 unless the user gives years), then trend_at_point for the 2-3 NASA variables most relevant to what changed (for example built-up or bare ground: temperature and vegetation; water changes: water and rainfall).
- For "where is <variable> changing" or "show me <variable>": set_view for that variable, then trend_in_region or find_divergence if a region or contrast is asked for.
- For "opposite trends" or "divergence": find_divergence.
- For "right now" or "this month": now_vs_normal. For a recent period of 1 to 60 months ("the last two years", "since last summer", "temperature range this year"; "this year" means every month since January, so pass the number of months since 1 January, at least 1): recent_history, which gives daily NASA records summarised by month, the hottest day, the coldest night and comparisons with normal. For anything longer, use the trend tools. When you answer about a recent period, also call trend_at_point for temperature (and rainfall if rain is asked about) at the same place, so you can set the recent numbers against the long-term record ("the last two years ran 0.8 °C above normal, in line with a significant warming of 0.3 °C per decade since 1980"). Do not lecture about short periods: answer the question asked. Mention that a few months or years are too short to test a trend only if the user treats them as a trend, at most once per conversation, in one short clause. For fires: live_events.
- Use locate_place before any tool that needs coordinates for a named place.
- Match the tool to the size of the place. For a country, region, ice sheet, desert, basin or continent (for example Greenland, northern India, the Sahel, the Amazon, the Arctic), use trend_in_region with the place's bounding box; a single point at its centre can show the opposite of the regional trend. Use trend_at_point only for a city, a site, or a point the user clicked.

How you write:
- Your readers are beginners: school students and members of the public. Write like a good science teacher talking to a curious 14-year-old. Plain words, short sentences, at most 120 words unless asked for more. Lead with the answer.
- Use everyday names: "temperature", "plant greenness" (not NDVI), "rainfall", "water stored in the ground" (not TWS or mascons). No jargon such as p-value, Mann-Kendall, Theil-Sen, FDR, anomaly or embeddings unless the user uses it first.
- For a trend, say the direction, how much it changed over the whole period (total_change_over_period, with units and years), and how sure we are using chance_it_is_luck ("the chance this is just luck is about 1 in 200"). Call a change "proven" or "real" only when significant is true; otherwise say it is "not proven yet" because the year-to-year ups and downs are bigger than the change.
- Give a sense of scale when it helps (a layer of water 836 mm deep, 1.2 °C warmer than in 1980), and one sentence on what it means for people there, without claiming a cause.
- If the user asks for technical detail (p-values, rates per decade, methods), give it exactly.
- Change detection (AlphaEarth embeddings, Google DeepMind) finds where the land surface changed and what it became. Trend significance comes from NASA records (GISTEMP, MODIS, GPM IMERG, GRACE). Do not call AlphaEarth NASA data.
- Never claim a cause. You may say what changed and where; explaining why needs further analysis.
- If a tool returns an error, explain it simply and suggest what to try instead.
- You are the whole product. Never tell the user to find another dataset, tool, service or API key. If a question is outside what the tools can measure, say so in one sentence and answer the closest question the tools can."""


def _schema(properties: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": properties, "required": required or list(properties),
            "additionalProperties": False}


NUM = {"type": "number"}
VAR = {"type": "string", "enum": VARIABLES}
BBOX = {"type": "array", "items": {"type": "number"}, "minItems": 4, "maxItems": 4,
        "description": "west, south, east, north in degrees"}

TOOLS = [
    {"type": "function", "name": "locate_place", "strict": True,
     "description": "Find a named place. Returns its coordinates and bounding box. Flies the globe there.",
     "parameters": _schema({"name": {"type": "string", "description": "Place name, with country if ambiguous"}})},
    {"type": "function", "name": "detect_change", "strict": True,
     "description": "Find where the land surface changed between two years (2017-2025) around a point, using "
                    "AlphaEarth satellite embeddings, and what each changed area became (Dynamic World land cover). "
                    "Covers a square of about 44 km around the point. Shows hotspots on the globe.",
     "parameters": _schema({"lat": NUM, "lon": NUM, "year_a": {"type": "integer"}, "year_b": {"type": "integer"}})},
    {"type": "function", "name": "trend_at_point", "strict": True,
     "description": "Long-term NASA trend at a point for one variable: rate per decade, p-value adjusted for testing "
                    "the whole map, significance, period. Variables: temperature (GISTEMP, 1980-2025), vegetation "
                    "(MODIS NDVI, 2001-2025), rainfall (GPM IMERG, 2001-2024), water (GRACE land water storage, 2003-2023).",
     "parameters": _schema({"lat": NUM, "lon": NUM, "variable": VAR})},
    {"type": "function", "name": "trend_in_region", "strict": True,
     "description": "Trend of the regional average of a variable inside a bounding box, plus the share of the region "
                    "with significant increases and decreases.",
     "parameters": _schema({"bbox": BBOX, "variable": VAR})},
    {"type": "function", "name": "find_divergence", "strict": True,
     "description": "Find pairs of regions where the same variable trends significantly in opposite directions. "
                    "Optionally limit to a bounding box (pass null for global).",
     "parameters": _schema({"variable": VAR, "bbox": {"anyOf": [BBOX, {"type": "null"}]}})},
    {"type": "function", "name": "now_vs_normal", "strict": True,
     "description": "The last 30 days of temperature and rainfall at a point compared with the 1991-2020 normal "
                    "(NASA POWER). Pair with trend_at_point for the long-term picture.",
     "parameters": _schema({"lat": NUM, "lon": NUM})},
    {"type": "function", "name": "recent_history", "strict": True,
     "description": "Daily NASA POWER temperature and rainfall at a point for the last 1-60 months, summarised by "
                    "month: mean, hottest day, coldest night, rainfall, and each month compared with the 1991-2020 "
                    "normal. Use for questions about recent periods such as the last two years.",
     "parameters": _schema({"lat": NUM, "lon": NUM, "months": {"type": "integer", "minimum": 1, "maximum": 60}})},
    {"type": "function", "name": "live_events", "strict": True,
     "description": "Active fires detected by NASA FIRMS (VIIRS) in the last 24 hours inside a bounding box.",
     "parameters": _schema({"bbox": BBOX})},
    {"type": "function", "name": "set_view", "strict": True,
     "description": "Change what the globe shows: a variable's significance map ('trend') or a single year "
                    "('year', with the year). Pass null for year in trend view.",
     "parameters": _schema({"variable": VAR, "view": {"type": "string", "enum": ["trend", "year"]},
                            "year": {"anyOf": [{"type": "integer"}, {"type": "null"}]}})},
]

STATUS = {
    "locate_place": "Finding {name}",
    "detect_change": "Scanning satellite embeddings, {year_a} to {year_b}",
    "trend_at_point": "Testing the {variable} trend",
    "trend_in_region": "Testing the regional {variable} trend",
    "find_divergence": "Looking for opposite {variable} trends",
    "now_vs_normal": "Comparing the last 30 days with normal",
    "recent_history": "Reading {months} months of daily NASA records",
    "live_events": "Checking live fires",
    "set_view": "Switching the map",
}


class ToolError(Exception):
    """A tool failed in a way the model should hear about."""


@dataclass
class TurnState:
    ui: list[dict] = field(default_factory=list)
    change_calls: int = 0
    numbers: set[float] = field(default_factory=set)


def _box_around(lat: float, lon: float, km: float = 22.0) -> tuple[float, float, float, float]:
    import math

    d_lat = km / 110.57
    d_lon = km / (111.32 * max(0.2, math.cos(math.radians(lat))))
    return (lon - d_lon, lat - d_lat, lon + d_lon, lat + d_lat)


def _trim_series(d: dict) -> dict:
    out = {k: v for k, v in d.items() if k not in ("values", "years", "trend_line", "method", "source")}
    vals = [v for v in d.get("values", []) if v is not None]
    if vals:
        out["first_value"], out["last_value"] = round(vals[0], 4), round(vals[-1], 4)
    return out


def _run_tool(name: str, args: dict, st: TurnState) -> dict:
    """Execute one tool. Returns the compact result for the model; appends UI commands to st.ui."""
    try:
        if name == "locate_place":
            p = locate(args["name"])
            st.ui.append({"action": "place", "place": p})
            return {"name": p["name"], "lat": round(p["lat"], 4), "lon": round(p["lon"], 4), "bbox": p["bbox"]}

        if name == "detect_change":
            if st.change_calls >= MAX_CHANGE_CALLS:
                raise ToolError(f"at most {MAX_CHANGE_CALLS} change scans per question")
            st.change_calls += 1
            r = detect_change(_box_around(args["lat"], args["lon"]), args["year_a"], args["year_b"])
            st.ui.append({"action": "change", "change": r})
            return {
                "years": [r["year_a"], r["year_b"]], "share_of_area_strongly_changed": round(r["share_strong_change"], 4),
                "hotspots": [{k: h[k] for k in ("id", "lat", "lon", "area_km2", "score", "transition")}
                             for h in r["hotspots"][:10]],
                "note": "AlphaEarth embeddings (Google DeepMind) + Dynamic World labels; not a NASA dataset.",
            }

        if name == "trend_at_point":
            r = store.point(args["variable"], args["lat"], args["lon"])
            st.ui.append({"action": "point", "variable": args["variable"], "lat": args["lat"], "lon": args["lon"]})
            return _with_plain(_trim_series(r))

        if name == "trend_in_region":
            r = store.region(args["variable"], tuple(args["bbox"]))
            st.ui.append({"action": "region", "variable": args["variable"], "bbox": r["bbox"]})
            return _with_plain(_trim_series(r))

        if name == "find_divergence":
            bbox = tuple(args["bbox"]) if args.get("bbox") else None
            r = store.divergence(args["variable"], bbox, 3)
            st.ui.append({"action": "divergence", "divergence": r})
            return {"variable": r["variable"], "units": r["units"], "period": r["period"],
                    "pairs": [{"increasing": {k: p["increasing"][k] for k in ("slope_per_decade", "lat", "lon", "area_km2")},
                               "decreasing": {k: p["decreasing"][k] for k in ("slope_per_decade", "lat", "lon", "area_km2")},
                               "distance_km": p["distance_km"]} for p in r["pairs"]]}

        if name == "now_vs_normal":
            r = now_vs_normal(args["lat"], args["lon"])
            return {k: r[k] for k in ("window", "normal_period", "temperature", "rainfall", "summary") if k in r}

        if name == "recent_history":
            r = recent_history(args["lat"], args["lon"], args["months"])
            st.ui.append({"action": "point", "variable": "temperature", "lat": args["lat"], "lon": args["lon"]})
            months = r["months"]
            if len(months) > 24:  # keep the model's context small: quarterly summary beyond two years
                months = months[-24:]
            return {**{k: r[k] for k in ("period", "days", "normal_period", "temperature", "rainfall", "note")},
                    "months": months}

        if name == "live_events":
            r = fires(tuple(args["bbox"]), limit=5)
            st.ui.append({"action": "fires", "bbox": list(args["bbox"])})
            return {"count": r["count"], "strongest": r["fires"], "source": r["source"], "note": r["note"]}

        if name == "set_view":
            st.ui.append({"action": "view", "variable": args["variable"], "view": args["view"], "year": args.get("year")})
            return {"ok": True}

        raise ToolError(f"unknown tool {name}")
    except (ToolError, ChangeError, EarthEngineUnavailable, store.OutOfRange, store.NotFound, PlaceNotFound, UpstreamError, ValueError) as exc:
        return {"error": str(exc)}
    except Exception as exc:  # Earth Engine and network failures
        log.exception("tool %s failed", name)
        return {"error": f"data service failed: {str(exc)[:200]}"}


def _sig3(x: float) -> float:
    return float(f"{x:.3g}")


def _with_plain(r: dict) -> dict:
    """Add the same everyday-language figures the case file shows: total change over the record and
    the chance the pattern is luck ("about 1 in 200"), so the analyst can explain without jargon."""
    p = r.get("q") if r.get("q") is not None else r.get("p")
    slope = r.get("slope_per_decade")
    if slope is not None and r.get("period"):
        years = r["period"][1] - r["period"][0]
        r["total_change_over_period"] = _sig3(slope / 10 * years)
    if p is not None:
        if p < 0.001:
            r["chance_it_is_luck"], r["luck_one_in"] = "less than 1 in 1000", 1000
        elif p < 0.1:
            n = round(1 / p)
            n = round(n, -1) if n >= 100 else n
            r["chance_it_is_luck"], r["luck_one_in"] = f"about 1 in {n}", n
        else:
            r["chance_it_is_luck"] = f"about {max(1, min(9, round(p * 10)))} in 10"
    return r


def _collect_numbers(obj, out: set[float]) -> None:
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        out.add(float(obj))
    elif isinstance(obj, dict):
        for v in obj.values():
            _collect_numbers(v, out)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _collect_numbers(v, out)
    elif isinstance(obj, str):
        for m in re.findall(r"-?\d+(?:\.\d+)?", obj):
            out.add(float(m))


NUMBER_IN_TEXT = re.compile(r"(?<![\w.])[-−+]?\d+(?:[.,]\d+)*(?:\.\d+)?")


def _close(v: float, k: float, rounding: float = 0.0051) -> bool:
    """v matches k within 2 %, or is k correctly rounded to the precision v was written with."""
    return abs(abs(v) - abs(k)) <= max(0.02 * abs(k), rounding)


def unverified_numbers(text: str, known: set[float]) -> list[str]:
    """Numbers in the answer that no tool result supports.

    Accepted: a tool number (to 2 % or rounding), the same number as a percentage or in thousands or
    millions, and the ratio of two tool numbers (e.g. "3.1 times faster"). Years and small whole
    numbers are skipped. Anything else is flagged.
    """
    ks = [k for k in known if k != 0]
    flagged = []
    for tok in NUMBER_IN_TEXT.findall(text):
        raw = tok.replace("−", "-").replace(",", "")
        try:
            v = float(raw)
        except ValueError:
            continue
        if 1900 <= abs(v) <= 2100 or abs(v) <= 10 and v == int(v):
            continue
        decimals = len(raw.split(".")[1]) if "." in raw else 0
        r = 0.5 * 10 ** -decimals + 1e-9  # half a unit in the last written digit
        direct = any(_close(v, k, r) or _close(v, k * 100, r) or _close(v, k / 1e3, r) or _close(v, k / 1e6, r)
                     for k in ks)
        ratio = not direct and any(_close(v, a / b, r) for a in ks for b in ks if a is not b and abs(b) > 1e-9)
        if not (direct or ratio):
            flagged.append(tok)
    return flagged


@dataclass
class Session:
    previous_response_id: str | None = None
    numbers: set[float] = field(default_factory=set)  # every tool number seen in this conversation
    lock: threading.Lock = field(default_factory=threading.Lock)
    last_used: float = field(default_factory=time.time)


_sessions: dict[str, Session] = {}
_sessions_lock = threading.Lock()


def _session(session_id: str) -> Session:
    with _sessions_lock:
        now = time.time()
        for k in [k for k, s in _sessions.items() if now - s.last_used > 3600]:
            del _sessions[k]
        s = _sessions.setdefault(session_id, Session())
        s.last_used = now
        return s


def _trace(record: dict) -> None:
    path = CACHE / "traces.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a") as f:
        f.write(json.dumps(record, default=str) + "\n")


def run_turn(session_id: str, text: str, client_factory: Callable[[], OpenAI] | None = None,
             include_results: bool = False) -> Iterator[dict]:
    """Run one user turn. Yields events: status, ui, text, tool, error, done.

    `include_results` adds each tool's full result to its `tool` event (for evals; not sent to browsers).
    """
    text = text.strip()[:2000]
    if not text:
        yield {"type": "error", "message": "Ask a question first."}
        return
    if not OPENAI_API_KEY and client_factory is None:
        yield {"type": "error", "message": "The analyst is unavailable: add OPENAI_API_KEY to .env and restart the server."}
        return
    sess = _session(session_id)
    if not sess.lock.acquire(blocking=False):
        yield {"type": "error", "message": "Still working on your previous question."}
        return
    client = (client_factory or (lambda: OpenAI(timeout=60, max_retries=2)))()
    turn_id = uuid.uuid4().hex[:10]
    t0 = time.perf_counter()
    st = TurnState()
    tool_log: list[dict] = []
    answer = ""
    usage = {"input_tokens": 0, "output_tokens": 0}
    model = AGENT_MODEL
    try:
        pending_input: list | str = [{"role": "user", "content": text}]
        previous = sess.previous_response_id
        calls = 0
        for _ in range(MAX_ROUNDS):
            if time.perf_counter() - t0 > TURN_SECONDS:
                yield {"type": "error", "message": "That took too long; try a narrower question."}
                break
            function_calls = []
            response_id = None
            try:
                stream = client.responses.create(
                    model=model, instructions=INSTRUCTIONS, input=pending_input, tools=TOOLS,
                    previous_response_id=previous, reasoning={"effort": "low"},
                    max_output_tokens=MAX_OUTPUT_TOKENS, parallel_tool_calls=True, stream=True,
                    store=True,
                )
            except APIStatusError as exc:
                if previous and exc.status_code in (400, 404):
                    previous = None  # stale conversation id: start a fresh thread with this question
                    sess.previous_response_id = None
                    continue
                if model != FALLBACK_MODEL and (exc.status_code == 404 or exc.status_code >= 500):
                    log.warning("model %s failed (%s); falling back to %s", model, exc.status_code, FALLBACK_MODEL)
                    model = FALLBACK_MODEL
                    continue
                raise
            for event in stream:
                et = event.type
                if et == "response.output_text.delta":
                    answer += event.delta
                    yield {"type": "text", "delta": event.delta}
                elif et == "response.output_item.done" and event.item.type == "function_call":
                    function_calls.append(event.item)
                elif et == "response.completed":
                    response_id = event.response.id
                    if event.response.usage:
                        usage["input_tokens"] += event.response.usage.input_tokens
                        usage["output_tokens"] += event.response.usage.output_tokens
                elif et in ("response.failed", "error"):
                    raise RuntimeError(getattr(getattr(event, "response", None), "error", None) or "model error")
            previous = response_id
            sess.previous_response_id = response_id
            if not function_calls:
                break
            outputs = []
            for fc in function_calls:
                calls += 1
                try:
                    args = json.loads(fc.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                if calls > MAX_TOOL_CALLS:
                    result = {"error": f"tool budget of {MAX_TOOL_CALLS} calls reached; answer with what you have"}
                else:
                    label = STATUS.get(fc.name, fc.name)
                    try:
                        label = label.format(**{k: v for k, v in args.items() if v is not None})
                    except (KeyError, IndexError):
                        pass
                    yield {"type": "status", "id": fc.call_id, "text": label}
                    t_tool = time.perf_counter()
                    st.ui.clear()
                    result = _run_tool(fc.name, args, st)
                    for cmd in st.ui:
                        yield {"type": "ui", **cmd}
                    tool_log.append({"name": fc.name, "args": args, "ms": round((time.perf_counter() - t_tool) * 1000),
                                     "error": result.get("error")})
                    tool_event = {"type": "tool", "id": fc.call_id, "name": fc.name, "ok": "error" not in result,
                                  "error": result.get("error")}
                    if include_results:
                        tool_event.update(args=args, result=result)
                    yield tool_event
                _collect_numbers(result, st.numbers)
                _collect_numbers(args, st.numbers)
                outputs.append({"type": "function_call_output", "call_id": fc.call_id, "output": json.dumps(result)})
            pending_input = outputs
        _collect_numbers(text, st.numbers)
        sess.numbers |= st.numbers
        flagged = unverified_numbers(answer, sess.numbers)
        if flagged:
            log.warning("turn %s: numbers not found in tool results: %s", turn_id, flagged)
        yield {"type": "done", "turn": turn_id, "unverified_numbers": flagged, "tool_calls": len(tool_log),
               "seconds": round(time.perf_counter() - t0, 1), "usage": usage, "model": model}
        _trace({"turn": turn_id, "session": session_id, "question": text, "answer": answer, "tools": tool_log,
                "unverified_numbers": flagged, "usage": usage, "model": model,
                "seconds": round(time.perf_counter() - t0, 2), "at": time.strftime("%Y-%m-%dT%H:%M:%S")})
    except (APIError, RuntimeError) as exc:
        log.exception("agent turn failed")
        yield {"type": "error", "message": f"The analyst could not answer: {str(exc)[:200]}"}
        _trace({"turn": turn_id, "question": text, "error": str(exc), "tools": tool_log})
    finally:
        sess.lock.release()
