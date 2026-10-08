"""Thin wrapper around the AI provider (OpenAI) so the rest of the service never touches the SDK directly.

Everything the service asks of the model goes through two functions:
  generate_structured(...)  -> a validated pydantic object (strict JSON schema)
  transcribe(...)           -> text from an audio recording

Tests replace these two functions, so no test needs a real key or network.

Failure handling, in one place:
  * an overall deadline (config.DEADLINE_S) so a farmer never waits long for an answer
  * short retries for temporary problems (overload, network drops)
  * fallback to other models when one is busy or rate limited
  * a clear, immediate stop when the account is out of credit (retrying cannot help)
"""
from __future__ import annotations

import base64
import re
import time
from typing import Callable, Optional, Sequence, Type, TypeVar

from pydantic import BaseModel

from app import config

T = TypeVar("T", bound=BaseModel)


class AiUnavailable(Exception):
    """The AI could not be used (no key, no credit, network problem, rate limit, or an unreadable reply)."""


def _reason(e: BaseException) -> str:
    """A short, safe description of why a call failed (no keys, no request bodies)."""
    msg = getattr(e, "message", None) or str(e)
    status = getattr(e, "status_code", None)
    return f"{type(e).__name__}{f' {status}' if status else ''}: {str(msg)[:200]}"


# HTTP statuses that usually clear up on their own: timeout, conflict, rate limit, overload, server hiccup.
_TRANSIENT = {408, 409, 429, 499, 500, 502, 503, 504}
_RETRY_PAUSES = (1.0, 2.5)  # seconds to wait before the 2nd and 3rd try on the same model
_MAX_RATE_WAIT_S = 20.0  # never make a farmer wait longer than this for a rate-limit window to reopen

_NETWORK_ERRORS = {
    "APIConnectionError", "APITimeoutError", "ReadTimeout", "ConnectTimeout", "WriteTimeout", "PoolTimeout",
    "TimeoutException", "TimeoutError", "ConnectError", "ReadError", "WriteError", "RemoteProtocolError",
    "NetworkError", "ProtocolError",
}


def _status(e: BaseException) -> Optional[int]:
    s = getattr(e, "status_code", None)
    if isinstance(s, int):
        return s
    c = getattr(e, "code", None)
    return c if isinstance(c, int) else None


def _is_out_of_credit(e: BaseException) -> bool:
    """OpenAI answers 429 both for 'slow down' and for 'your balance is empty'. Only the second is permanent."""
    code = str(getattr(e, "code", "") or "")
    return code == "insufficient_quota" or "insufficient_quota" in str(e)


def _is_transient(e: BaseException) -> bool:
    if _is_out_of_credit(e):
        return False
    if _status(e) in _TRANSIENT:
        return True
    seen = 0
    cur: Optional[BaseException] = e
    while cur is not None and seen < 5:  # look at the error and what caused it
        if type(cur).__name__ in _NETWORK_ERRORS:
            return True
        cur = cur.__cause__ or cur.__context__
        seen += 1
    return False


def _retry_after_seconds(e: BaseException) -> Optional[float]:
    """'Please try again in 1.2s' / 'in 850ms' in a rate-limit message. Returns seconds, or None."""
    m = re.search(r"(?:try again|retry) in ([0-9.]+)\s*(ms|s)\b", str(getattr(e, "message", None) or e), re.I)
    if not m:
        return None
    value = float(m.group(1))
    return value / 1000 if m.group(2).lower() == "ms" else value


def _call_with_fallback(make_call: Callable[[str, float], object], models: Optional[Sequence[str]] = None):
    """Run make_call(model, timeout_seconds) over the models in order, with retries and an overall deadline."""
    models = list(models or [config.OPENAI_MODEL] + [m for m in config.OPENAI_FALLBACK_MODELS if m != config.OPENAI_MODEL])
    started = time.monotonic()

    def remaining() -> float:
        return config.DEADLINE_S - (time.monotonic() - started)

    last: Optional[BaseException] = None
    for sweep in range(2):
        waits: list[float] = []
        all_rate_limited = True
        for model in models:
            for attempt in range(len(_RETRY_PAUSES) + 1):
                if remaining() < 2:
                    raise last or TimeoutError("The AI did not answer in time.")
                try:
                    return make_call(model, min(float(config.REQUEST_TIMEOUT_S), remaining()))
                except Exception as e:  # noqa: BLE001 - re-raised below unless it is a temporary problem
                    last = e
                    if _is_out_of_credit(e):
                        raise AiUnavailable(
                            "The AI account is out of credit. Add credit to the OpenAI account and try again."
                        ) from e
                    if not _is_transient(e):
                        raise
                    if _status(e) == 429:
                        wait = _retry_after_seconds(e)
                        if wait is not None:
                            waits.append(wait)
                        break  # this model is rate limited: waiting here will not help, try the next one now
                    all_rate_limited = False
                    if attempt < len(_RETRY_PAUSES):
                        time.sleep(min(_RETRY_PAUSES[attempt], max(0.0, remaining() - 2)))
        soonest = min(waits) if waits else None
        if sweep == 0 and all_rate_limited and soonest is not None and soonest <= _MAX_RATE_WAIT_S and soonest + 0.5 < remaining() - 4:
            time.sleep(soonest + 0.5)  # the rate-limit window reopens soon: wait for it, then sweep again
            continue
        break
    assert last is not None
    raise last


_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not config.OPENAI_API_KEY:
        raise AiUnavailable("No OpenAI API key is configured (set OPENAI_API_KEY in .env).")
    try:
        from openai import OpenAI

        # max_retries=0: we do our own retries so the overall deadline is respected.
        _client = OpenAI(api_key=config.OPENAI_API_KEY, max_retries=0, timeout=float(config.REQUEST_TIMEOUT_S))
    except ImportError as e:
        raise AiUnavailable("The openai package is not installed.") from e
    return _client


def _supports_reasoning_effort(model: str) -> bool:
    """Only reasoning-style models accept `reasoning_effort`; older ones (gpt-4.x) reject it."""
    return model.startswith(("gpt-5", "gpt-6", "o1", "o3", "o4"))


def generate_structured(
    *,
    system: str,
    prompt: str,
    schema: Type[T],
    media: Optional[tuple[bytes, str]] = None,
    effort: str = "none",
    max_tokens: int = 800,
) -> T:
    """Ask the model for JSON that matches `schema`. Raises AiUnavailable on any failure.

    No temperature is sent: the newest models only allow their default. `effort` is the reasoning level
    ('none' for quick extraction, 'low' where care matters). max_tokens must leave room for reasoning.
    """
    client = _get_client()

    user_content: object = prompt
    if media is not None:
        data, mime = media
        url = f"data:{mime};base64,{base64.b64encode(data).decode()}"
        user_content = [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": url}}]

    def make(model: str, timeout: float):
        kwargs: dict = dict(
            model=model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user_content}],
            response_format=schema,
            max_completion_tokens=max_tokens,
        )
        if _supports_reasoning_effort(model):
            kwargs["reasoning_effort"] = effort
        return client.with_options(timeout=timeout).chat.completions.parse(**kwargs)

    try:
        completion = _call_with_fallback(make)
    except AiUnavailable:
        raise
    except Exception as e:  # network, auth, bad request, content filter ...
        raise AiUnavailable(f"The AI request failed ({_reason(e)})") from e

    message = completion.choices[0].message  # type: ignore[attr-defined]
    if getattr(message, "refusal", None):
        raise AiUnavailable("The AI declined to answer this request.")
    parsed = getattr(message, "parsed", None)
    if parsed is None:
        raise AiUnavailable("The AI returned a reply we could not read.")
    return parsed


def transcribe(*, data: bytes, filename: str, mime: str, prompt: str = "") -> str:
    """Speech to text. `prompt` can hint spelling and vocabulary (for example Pidgin words)."""
    client = _get_client()
    models = [config.OPENAI_STT_MODEL] + [m for m in config.OPENAI_STT_FALLBACK_MODELS if m != config.OPENAI_STT_MODEL]

    def make(model: str, timeout: float):
        kwargs: dict = dict(model=model, file=(filename, data, mime))
        if prompt:
            kwargs["prompt"] = prompt
        return client.with_options(timeout=timeout).audio.transcriptions.create(**kwargs)

    try:
        result = _call_with_fallback(make, models)
    except AiUnavailable:
        raise
    except Exception as e:
        raise AiUnavailable(f"The transcription request failed ({_reason(e)})") from e
    return (getattr(result, "text", "") or "").strip()
