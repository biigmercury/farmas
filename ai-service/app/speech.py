"""Text to speech: read the AI's answers aloud, for farmers who cannot read or prefer to listen.

The voice models are strongest in English. For the Nigerian languages we pass speaking instructions so the voice
reads slowly and clearly, but quality can vary, especially for Fulani. The caller always keeps the text too.
"""
from __future__ import annotations

from app import ai_client, config

LANGUAGE_NAMES = {
    "english": "English",
    "pidgin": "Nigerian Pidgin",
    "yoruba": "Yoruba",
    "igbo": "Igbo",
    "hausa": "Hausa",
    "fulani": "Fulani (Fulfulde)",
}


def _instructions(language: str) -> str:
    name = LANGUAGE_NAMES.get(language, "English")
    return (
        f"Read this aloud in {name}, the way a friendly Nigerian farm advisor would. Speak slowly and clearly, with "
        "a warm tone. Say naira amounts and numbers the way a native speaker would. Do not add anything."
    )


def speak(text: str, language: str = "english", fmt: str = "mp3") -> bytes:
    """Raises ai_client.AiUnavailable if the speech service cannot be used."""
    clean = " ".join(text.split())[: config.TTS_MAX_CHARS]
    return ai_client.speak(text=clean, voice="alloy", instructions=_instructions(language), fmt="opus" if fmt == "opus" else "mp3")
