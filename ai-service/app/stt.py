"""Speech to text with OpenAI (WhatsApp voice notes and in-app recordings).

We pass a short hint with Pidgin vocabulary so words like "abeg", "dey", "kpai" and "wetin" are spelled the way a
farmer would write them, and numbers come out as digits. The transcript is the farmer's own words, never a
translation: the next step (intent extraction) works best on the original Pidgin.
"""
from __future__ import annotations

from app import ai_client

HINT = (
    "Voice message from a Nigerian livestock farmer, in Nigerian Pidgin, Nigerian English or Yoruba, Hausa or Igbo. "
    "Common words: abeg, dey, don, kpai, wetin, chop, na, dem, make. About broilers, goats, sheep, feed, naira, "
    "50k, 200 birds. Write numbers as digits."
)

# What the OpenAI transcription endpoint accepts. WhatsApp sends ogg (Opus); browsers record webm or mp4.
ALLOWED = {
    "audio/ogg": "ogg", "audio/opus": "ogg", "audio/webm": "webm", "video/webm": "webm",
    "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
}
CANONICAL = {"ogg": "audio/ogg", "webm": "audio/webm", "m4a": "audio/mp4", "mp3": "audio/mpeg", "wav": "audio/wav"}
BY_EXTENSION = {"ogg": "ogg", "opus": "ogg", "oga": "ogg", "webm": "webm", "mp3": "mp3", "wav": "wav", "m4a": "m4a", "mp4": "m4a"}


def normalize_mime(mime: str, filename: str = "") -> str:
    """Return a mime type we can send on, or "" if the file is not a supported audio type."""
    m = (mime or "").split(";")[0].strip().lower()
    ext = ALLOWED.get(m) or BY_EXTENSION.get(filename.lower().rsplit(".", 1)[-1] if "." in filename else "")
    return CANONICAL.get(ext, "") if ext else ""


def transcribe(data: bytes, mime: str) -> str:
    ext = next((e for e, m in CANONICAL.items() if m == mime), "ogg")
    text = ai_client.transcribe(data=data, filename=f"voice.{ext}", mime=mime, prompt=HINT)
    return "" if text.lower() in {"[unclear]", ""} else text
