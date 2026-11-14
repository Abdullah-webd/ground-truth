"""Paths and settings, read once from the project's .env file."""

from __future__ import annotations

import os
import pathlib

from dotenv import load_dotenv

ROOT = pathlib.Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

DATA = ROOT / "data"
RAW = DATA / "raw"
CACHE = DATA / "cache"
DERIVED = DATA / "derived"

EE_PROJECT = os.getenv("EE_PROJECT", "")
FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
# Cesium ion access token: a browser token by design (restrict it to your origin in the ion dashboard).
CESIUM_ION_TOKEN = os.getenv("CESIUM_ION_TOKEN", "")
AGENT_MODEL = os.getenv("AGENT_MODEL", "gpt-5.6-terra")
USER_AGENT = "GroundTruth/0.1 (NASA Space Apps 2026 project; local research tool)"

_ee_ready = False
_ee_status: dict = {"at": 0.0, "value": "unknown"}


def _install_ee_credentials() -> None:
    """On a server there is no `earthengine authenticate`: the same login file can be supplied as the
    EE_CREDENTIALS environment variable (its JSON contents). Written where the Earth Engine library looks."""
    raw = os.getenv("EE_CREDENTIALS", "").strip()
    if not raw:
        return
    path = pathlib.Path.home() / ".config" / "earthengine" / "credentials"
    if path.exists() and path.read_text().strip() == raw:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(raw)
    path.chmod(0o600)


def init_earth_engine() -> None:
    """Initialise Earth Engine once, using local credentials (or EE_CREDENTIALS on a server)."""
    global _ee_ready
    if _ee_ready:
        return
    import ee

    if not EE_PROJECT:
        raise RuntimeError("EE_PROJECT is not set in .env")
    _install_ee_credentials()
    ee.Initialize(project=EE_PROJECT)
    _ee_ready = True


def earth_engine_status(max_age: float = 600.0) -> str:
    """'ok' or 'signed_out', checked with a tiny real request at most every 10 minutes."""
    import time

    if time.time() - _ee_status["at"] < max_age:
        return _ee_status["value"]
    try:
        init_earth_engine()
        import ee

        ee.Number(1).getInfo()
        value = "ok"
    except Exception as exc:  # noqa: BLE001 - a status check must report, never raise
        msg = str(exc).lower()
        value = "signed_out" if ("authorize" in msg or "reauth" in msg or "credential" in msg) else "unreachable"
    _ee_status.update(at=time.time(), value=value)
    return value
