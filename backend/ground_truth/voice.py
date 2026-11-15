"""Live voice with the OpenAI Realtime API (gpt-realtime-2.1 over WebRTC).

The browser never sees the real API key: the backend mints a short-lived client secret with the
full session config (instructions, voice, tools). The browser talks to OpenAI directly over WebRTC
and sends each tool call back here, where it runs through the same data tools as the text analyst.
"""

from __future__ import annotations

import os

from openai import OpenAI

from .agent import INSTRUCTIONS, STATUS, TOOLS, TurnState, _collect_numbers, _run_tool, unverified_numbers
from .config import OPENAI_API_KEY

VOICE_MODEL = os.getenv("VOICE_MODEL", "gpt-realtime-2.1")
VOICE = os.getenv("VOICE_NAME", "marin")  # OpenAI recommends marin or cedar for quality
TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe"
SECRET_SECONDS = 600

VOICE_INSTRUCTIONS = INSTRUCTIONS + """

You are speaking out loud, live, over a 3D globe the listener can see. Introduce yourself as Aisha only if asked who you are.
- Speak the labels naturally: say "this is a confirmed trend", "this isn't confirmed yet", "satellites observed", and for causes "one possible explanation, which we haven't tested, is…". Don't read out asterisks.
- Speak naturally and briefly: at most about 60 words per answer, then stop.
- Round numbers to two or three significant figures when you speak them (say "about 0.25 degrees per decade").
- Do not read coordinates, IDs or bounding boxes aloud. The globe already shows where.
- Before a slow scan (detect_change), say one short line such as "Checking the NASA records now."
- If you did not catch the question, ask the listener to repeat it.
- For questions about a recent period ("the last two years"), call recent_history; never say the data is unavailable without trying it."""


class VoiceUnavailable(RuntimeError):
    pass


def realtime_tools() -> list[dict]:
    """The text analyst's tools, in Realtime format (no `strict` flag)."""
    return [{k: v for k, v in t.items() if k != "strict"} for t in TOOLS]


def session_config() -> dict:
    return {
        "type": "realtime",
        "model": VOICE_MODEL,
        "instructions": VOICE_INSTRUCTIONS,
        "output_modalities": ["audio"],
        "audio": {
            "input": {
                "transcription": {"model": TRANSCRIBE_MODEL, "language": "en"},
                "turn_detection": {"type": "semantic_vad", "eagerness": "auto",
                                   "create_response": True, "interrupt_response": True},
                "noise_reduction": {"type": "near_field"},
            },
            "output": {"voice": VOICE},
        },
        "tools": realtime_tools(),
        "tool_choice": "auto",
    }


def mint_client_secret() -> dict:
    if not OPENAI_API_KEY:
        raise VoiceUnavailable("Voice needs OPENAI_API_KEY in .env")
    client = OpenAI(timeout=20, max_retries=1)
    secret = client.realtime.client_secrets.create(
        expires_after={"anchor": "created_at", "seconds": SECRET_SECONDS},
        session=session_config(),
    )
    return {"value": secret.value, "expires_at": secret.expires_at, "model": VOICE_MODEL, "voice": VOICE}


def run_voice_tool(name: str, args: dict) -> dict:
    st = TurnState()
    result = _run_tool(name, args, st)
    label = STATUS.get(name, name)
    try:
        label = label.format(**{k: v for k, v in args.items() if v is not None})
    except (KeyError, IndexError):
        pass
    return {"result": result, "ui": st.ui, "label": label, "evidence": st.evidence}


def check_numbers(text: str, results: list) -> list[str]:
    known: set[float] = set()
    _collect_numbers(results, known)
    return unverified_numbers(text, known)


def count_checked(text: str, flagged: list[str]) -> int:
    from .agent import count_checked_numbers

    return count_checked_numbers(text, flagged)
