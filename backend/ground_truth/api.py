"""HTTP API for the web app.  Run: uvicorn ground_truth.api:app --host 127.0.0.1 --port 8765"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import checks, store
from .change import ChangeError, detect_change
from .config import DERIVED, FIRMS_MAP_KEY, OPENAI_API_KEY
from .fires import fires
from .geo import PlaceNotFound, locate
from .nowcast import UpstreamError, now_vs_normal

log = logging.getLogger("api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="Ground Truth API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5179", "http://127.0.0.1:5179", "http://localhost:4179", "http://127.0.0.1:4179"],
                   allow_methods=["GET", "POST"], allow_headers=["*"])
DERIVED.mkdir(parents=True, exist_ok=True)
app.mount("/static/derived", StaticFiles(directory=DERIVED), name="derived")

Variable = Annotated[str, Query(description="temperature | vegetation | rainfall | water")]
Lat = Annotated[float, Query(ge=-90, le=90)]
Lon = Annotated[float, Query(ge=-180, le=180)]


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


@app.exception_handler(HTTPException)
async def _http_error(_: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": detail})


@app.middleware("http")
async def _log_requests(request: Request, call_next):
    rid = uuid.uuid4().hex[:8]
    t0 = time.perf_counter()
    response = await call_next(request)
    log.info("%s %s %s %d %.0fms", rid, request.method, request.url.path, response.status_code,
             (time.perf_counter() - t0) * 1000)
    response.headers["X-Request-Id"] = rid
    return response


def _parse_bbox(bbox: str | None) -> tuple[float, float, float, float] | None:
    if bbox is None:
        return None
    try:
        parts = tuple(float(v) for v in bbox.split(","))
    except ValueError:
        parts = ()
    if len(parts) != 4:
        raise _error(400, "bad_bbox", "bbox must be four numbers: west,south,east,north")
    return parts  # type: ignore[return-value]


def _call(fn, *args, **kwargs):
    """Run a service call and translate its errors into HTTP errors."""
    try:
        return fn(*args, **kwargs)
    except store.NotFound as exc:
        raise _error(404, "not_found", str(exc)) from exc
    except PlaceNotFound as exc:
        raise _error(404, "place_not_found", str(exc)) from exc
    except (store.OutOfRange, ChangeError, ValueError) as exc:
        raise _error(400, "bad_request", str(exc)) from exc
    except UpstreamError as exc:
        raise _error(502, "upstream_failed", str(exc)) from exc
    except Exception as exc:  # Earth Engine and other unexpected failures
        msg = str(exc)
        if "timed out" in msg.lower() or "deadline" in msg.lower():
            raise _error(504, "upstream_timeout", "Earth Engine took too long; try a smaller area") from exc
        log.exception("unexpected error")
        raise _error(502, "upstream_failed", f"data service error: {msg[:200]}") from exc


@app.get("/api/health")
def health():
    built = [v["id"] for v in store.available()]
    return {"status": "ok", "variables_built": built, "firms_key": bool(FIRMS_MAP_KEY),
            "agent_key": bool(OPENAI_API_KEY)}


@app.get("/api/variables")
def variables():
    return {"variables": store.available()}


@app.get("/api/trend/point")
def trend_point(variable: Variable, lat: Lat, lon: Lon):
    return _call(store.point, variable, lat, lon)


@app.get("/api/trend/region")
def trend_region(variable: Variable, bbox: str):
    return _call(store.region, variable, _parse_bbox(bbox))


@app.get("/api/divergence")
def divergence(variable: Variable, bbox: str | None = None, limit: Annotated[int, Query(ge=1, le=12)] = 3):
    return _call(store.divergence, variable, _parse_bbox(bbox), limit)


@app.get("/api/divergence/cluster.png")
def divergence_cluster(variable: Variable, cluster: str, color: str | None = None):
    png = _call(store.cluster_png, variable, cluster, color)
    return Response(png, media_type="image/png", headers={"Cache-Control": "max-age=86400"})


@app.get("/api/change")
def change(bbox: str, year_a: Annotated[int, Query(ge=2017, le=2025)] = 2018,
           year_b: Annotated[int, Query(ge=2017, le=2025)] = 2024):
    return _call(detect_change, _parse_bbox(bbox), year_a, year_b)


@app.get("/api/now")
def now(lat: Lat, lon: Lon):
    return _call(now_vs_normal, lat, lon)


@app.get("/api/fires")
def live_fires(bbox: str | None = None, limit: Annotated[int | None, Query(ge=1, le=20000)] = None):
    return _call(fires, _parse_bbox(bbox), limit)


@app.get("/api/locate")
def place(q: Annotated[str, Query(min_length=1, max_length=200)]):
    return _call(locate, q)


@app.get("/api/checks")
def science_checks():
    return _call(checks.all_checks)
