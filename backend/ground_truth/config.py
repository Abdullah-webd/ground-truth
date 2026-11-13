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
AGENT_MODEL = os.getenv("AGENT_MODEL", "gpt-5.6-terra")
USER_AGENT = "GroundTruth/0.1 (NASA Space Apps 2026 project; local research tool)"

_ee_ready = False


def init_earth_engine() -> None:
    """Initialise Earth Engine once, using the user's local credentials."""
    global _ee_ready
    if _ee_ready:
        return
    import ee

    if not EE_PROJECT:
        raise RuntimeError("EE_PROJECT is not set in .env")
    ee.Initialize(project=EE_PROJECT)
    _ee_ready = True
