"""Per-visitor and daily limits for the endpoints that cost money (OpenAI) or quota (Earth Engine, geocoding).

In-memory sliding windows: enough for one Railway instance. Limits are set by environment variables so
they can be raised for a demo day without a code change.
"""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

HOUR = 3600
DAY = 86400


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


# (per visitor per hour, whole site per day)
LIMITS = {
    "agent": (_int("LIMIT_AGENT_PER_HOUR", 40), _int("LIMIT_AGENT_PER_DAY", 1500)),
    "voice": (_int("LIMIT_VOICE_PER_HOUR", 8), _int("LIMIT_VOICE_PER_DAY", 150)),
    "change": (_int("LIMIT_CHANGE_PER_HOUR", 30), _int("LIMIT_CHANGE_PER_DAY", 600)),
    "locate": (_int("LIMIT_LOCATE_PER_HOUR", 120), _int("LIMIT_LOCATE_PER_DAY", 5000)),
}

MESSAGES = {
    "agent": "You've asked the analyst a lot of questions in the last hour. Please wait a little and try again.",
    "voice": "You've started several voice sessions in the last hour. Please wait a little, or type your question.",
    "change": "Too many satellite change scans in the last hour. Please wait a little and try again.",
    "locate": "Too many place searches in the last hour. Please wait a little and try again.",
}
DAILY_MESSAGE = "Ground Truth has reached today's limit for this feature. It resets within 24 hours."

_lock = threading.Lock()
_visitor: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_site: dict[str, deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    # Railway (and most hosts) put the visitor's address first in X-Forwarded-For.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check(request: Request, kind: str) -> None:
    """Raise a 429 if this visitor or the whole site is over the limit for `kind`; otherwise count the call."""
    per_hour, per_day = LIMITS[kind]
    now = time.time()
    ip = client_ip(request)
    with _lock:
        v = _visitor[(kind, ip)]
        while v and now - v[0] > HOUR:
            v.popleft()
        s = _site[kind]
        while s and now - s[0] > DAY:
            s.popleft()
        if len(s) >= per_day:
            raise HTTPException(429, detail={"code": "daily_limit", "message": DAILY_MESSAGE})
        if len(v) >= per_hour:
            retry = int(HOUR - (now - v[0])) + 1
            raise HTTPException(429, detail={"code": "rate_limited", "message": MESSAGES[kind], "retry_after": retry})
        v.append(now)
        s.append(now)


def reset() -> None:
    """For tests."""
    with _lock:
        _visitor.clear()
        _site.clear()
