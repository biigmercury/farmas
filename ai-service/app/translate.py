"""Translate the assistant's own replies into the farmer's language (Yoruba, Igbo, Hausa, Fulani, Pidgin).

Only used on short replies the app has already worked out from the farmer's records, so no new facts are created
here: the prompt forbids changing numbers, money amounts, dates or names. Quality for Fulani is lower than for the
others, which is why those languages are shown with a "beta" tag in the app.
"""
from __future__ import annotations

from app import ai_client
from app.speech import LANGUAGE_NAMES

SYSTEM = """You translate short messages from a farm-record assistant into the language you are asked for. The readers
are Nigerian livestock farmers, many of whom do not read English well.

Rules:
1. Keep EVERY number, naira amount (₦), date, quantity and animal count exactly as written. Never round or change them.
2. Keep names of people, places and farms as they are.
3. Use simple everyday words a farmer would use. Short sentences.
4. Keep the structure: if the message asks "Should I save this? Reply yes or no", keep the words "yes" and "no" in
   English in quotes so the farmer can type them.
5. If a line is a list, keep it a list with the same dashes.
6. Output ONLY the translation. No notes, no explanations, no quotation marks around the whole text."""


def translate(text: str, language: str) -> str:
    """Raises ai_client.AiUnavailable if the AI cannot be used."""
    name = LANGUAGE_NAMES.get(language)
    if not name or language == "english" or not text.strip():
        return text
    return ai_client.generate_text(
        system=SYSTEM,
        messages=[{"role": "user", "content": f"Translate into {name}:\n\n{text.strip()}"}],
        effort="none",
        max_tokens=1200,
    )
