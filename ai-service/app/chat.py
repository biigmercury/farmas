"""Chatbot mode: answer a farmer's general questions (animal care, feeding, disease, farm business, where to find a vet).

Unlike the agent (nlu.py), this never creates or changes records. It answers in words, grounded in the team's
knowledge base for animal-health facts, and follows the language the farmer picked.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from app import ai_client
from app.health import DISCLAIMER, retriever

Language = Literal["auto", "english", "pidgin"]


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=2000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default_factory=list, max_length=12)
    language: Language = "auto"
    farm: Optional[dict] = None
    # Plain-text list of vet clinics the app already looked up (the AI may only mention these).
    vets_text: str = Field(default="", max_length=2000)


class ChatOut(BaseModel):
    reply: str


SYSTEM = """You are FarmAs AI, a friendly livestock assistant for African farmers (mostly Nigerian small and medium farms).
In this chat you only ANSWER questions. You cannot save, change or delete anything on the farm.

Rules:
1. Be practical and short: plain sentences a farmer can read on a phone. No markdown headings, no emojis. A short
   list of steps is fine.
2. Animal health facts (diseases, signs, prevention) must come from the KNOWLEDGE EXCERPTS. If they do not cover the
   question, say what you do know in general terms and advise seeing a vet. Do not invent facts.
3. Never give a definite diagnosis. Use "could be" and "possible". NO drug names, doses or home-made mixtures unless they
   appear in the excerpts; say the vet or agro-vet must give any dose.
4. For sudden deaths, many sick animals, or suspected notifiable diseases (PPR, ASF, FMD, lumpy skin disease,
   Newcastle disease, bird flu, anthrax): isolate sick animals, stop moving or selling animals, call a vet and report to
   the state veterinary office.
5. When the farmer asks about their own farm (their animals, money), use FARM CONTEXT only. If it is not there, say
   they can ask the Agent mode (the other tab) to look it up. Never invent farm numbers.
6. Questions that have nothing to do with farming: say politely that you help with farming and give one example.
7. If the farmer asks where a vet is, VET_RESULTS tells you what the app found. Mention only vets from VET_RESULTS.
8. If the farmer is talking about sick animals, end with one short line reminding them that you give guidance, not a
   diagnosis, and a vet should confirm.
"""

LANGUAGE_RULE = {
    "english": "Reply in simple English.",
    "pidgin": "Reply in simple Nigerian Pidgin (for example: 'Your goat dey cough? Make you...'), easy to read.",
    "auto": "Reply in the same language style the farmer used: Nigerian Pidgin if they wrote Pidgin, otherwise simple English.",
}


def _excerpts(question: str) -> str:
    if retriever is None:
        return "(no knowledge excerpts available)"
    try:
        hits = retriever.retrieve(question, top_k=3)
    except Exception:  # a broken index must not stop the chat
        return "(no knowledge excerpts available)"
    if not hits:
        return "(no relevant excerpts found)"
    return "\n\n".join(f"[{x['source']} - {x['title']}]\n{x['content']}" for x in hits)


def answer(body: ChatIn) -> ChatOut:
    """Raises ai_client.AiUnavailable if the AI cannot be used."""
    farm = body.farm or {}
    farm_lines = "\n".join(f"- {k}: {v}" for k, v in farm.items() if v not in (None, "", [], {}))
    context = (
        f"{LANGUAGE_RULE[body.language]}\n\n"
        f"FARM CONTEXT:\n{farm_lines or '- (not provided)'}\n\n"
        f"VET_RESULTS:\n{body.vets_text or '- (none looked up)'}\n\n"
        f"KNOWLEDGE EXCERPTS:\n{_excerpts(body.message)}"
    )
    messages = [{"role": t.role, "content": t.content} for t in body.history[-10:]]
    messages.append({"role": "user", "content": f"{context}\n\nFARMER'S QUESTION:\n{body.message.strip()}"})
    reply = ai_client.generate_text(system=SYSTEM, messages=messages, effort="low", max_tokens=1200)
    return ChatOut(reply=reply)


__all__ = ["ChatIn", "ChatOut", "answer", "DISCLAIMER"]
