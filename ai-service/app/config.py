"""Settings for the AI service. Secrets come from environment files, never from code.

Search order (first value wins): real environment variables, ai-service/.env, then the repo-root .env.
The AI provider is OpenAI. Only OPENAI_* names are read, so an old key for another provider can never be
picked up by mistake.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

SERVICE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = SERVICE_DIR.parent

load_dotenv(SERVICE_DIR / ".env")
load_dotenv(ROOT_DIR / ".env")


def _get(name: str, default: str = "") -> str:
    return os.getenv(name, "").strip() or default


def _list(name: str, default: str) -> list[str]:
    return [m.strip() for m in _get(name, default).split(",") if m.strip()]


# "production" turns on the strict checks in main.py (internal key required, API docs page off).
APP_ENV = _get("AI_SERVICE_ENV", "development").lower()

OPENAI_API_KEY = _get("OPENAI_API_KEY")

# Main model for understanding messages and health assessment.
OPENAI_MODEL = _get("OPENAI_MODEL", "gpt-6-luna")
# Tried in order if the main model is overloaded or rate limited. Comma separated.
OPENAI_FALLBACK_MODELS = _list("OPENAI_FALLBACK_MODELS", "gpt-5.4-mini,gpt-4.1-mini")

# Speech to text (WhatsApp voice notes, in-app recordings).
OPENAI_STT_MODEL = _get("OPENAI_STT_MODEL", "gpt-4o-transcribe")
OPENAI_STT_FALLBACK_MODELS = _list("OPENAI_STT_FALLBACK_MODELS", "gpt-4o-mini-transcribe,whisper-1")

# If set, every request must send this in the X-Internal-Key header (the Node API does).
INTERNAL_KEY = _get("MODEL_SERVICE_INTERNAL_KEY")

# One call may take at most this long ...
REQUEST_TIMEOUT_S = int(_get("AI_TIMEOUT_S", "20"))
# ... and all retries, waits and fallbacks together may take at most this long. A farmer should get a clear
# "busy, try again" within about half a minute, never a long hang.
DEADLINE_S = int(_get("AI_DEADLINE_S", "30"))

MAX_AUDIO_BYTES = 16 * 1024 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024
