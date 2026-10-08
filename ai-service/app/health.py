"""Livestock health risk assessment: grounded in the knowledge base, checked by hard safety rules.

Flow: farmer's description (+ optional photo) -> retrieve vet excerpts -> the AI fills a fixed JSON shape ->
a rule-based "safety floor" can only RAISE the risk, never lower it -> fixed disclaimer is attached.

This is decision support, not diagnosis. The prompt forbids definite diagnoses, drug doses and home recipes.
"""
from __future__ import annotations

import re
import sys
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app import ai_client, config

# Reuse the team's retriever (keyword search with a Pidgin dictionary). It lives in ai-service/knowledge.
if str(config.SERVICE_DIR) not in sys.path:
    sys.path.append(str(config.SERVICE_DIR))
try:
    from knowledge.retriever import retriever
except Exception:  # missing index must not take the whole service down
    retriever = None

DISCLAIMER = "FarmAs provides AI-assisted decision support and does not replace professional veterinary diagnosis."

Risk = Literal["LOW", "MEDIUM", "HIGH"]
_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}


class Assessment(BaseModel):
    risk_level: Risk
    observations: list[str] = Field(description="What the farmer reported, in plain words (max 5)")
    possible_concerns: list[str] = Field(description="POSSIBLE causes only, never definite (max 4)")
    recommended_actions: list[str] = Field(description="Safe first steps the farmer can take now (3 to 5)")
    requires_vet_escalation: bool
    disclaimer: str = DISCLAIMER


class HealthInput(BaseModel):
    symptoms: str
    species: Optional[str] = None
    number_affected: Optional[int] = None
    total: Optional[int] = None
    mortality: Optional[int] = None
    onset: Optional[str] = None
    drinking: Optional[str] = None
    vaccinated: Optional[str] = None


# ---------------------------------------------------------------------------------------------
# Safety floor: simple, explainable rules. The model may rate higher, never lower.

RED_FLAGS = re.compile(
    r"breath|gasp|wheez|bloody|blood|seiz|paraly|can'?t stand|collaps|swollen head|sudden|twist|foam|"
    r"dey die|plenty die|dem die|don kpai|nose dey bleed|green dropping",
    re.I,
)
# Diseases that must be reported if suspected. We only react if the farmer names one.
NOTIFIABLE = re.compile(
    r"newcastle|\bppr\b|african swine|\basf\b|foot.and.mouth|\bfmd\b|lumpy skin|avian (flu|influenza)|bird flu|anthrax", re.I
)


def safety_floor(h: HealthInput) -> tuple[Risk, bool]:
    """Return (minimum risk, vet escalation required)."""
    affected = h.number_affected or 0
    total = h.total or 0
    deaths = h.mortality or 0
    share = affected / total if total else 0.0

    points = 0
    if deaths > 0:
        points += 2
    if deaths >= 3:
        points += 1
    if share >= 0.1:
        points += 1
    if share >= 0.3:
        points += 1
    if not total and affected >= 5:
        points += 1
    if RED_FLAGS.search(h.symptoms):
        points += 2
    if h.drinking == "less":
        points += 1
    if h.onset == "today" and affected >= 3:
        points += 1

    risk: Risk = "HIGH" if points >= 4 else "MEDIUM" if points >= 2 else "LOW"
    escalate = risk == "HIGH"
    if NOTIFIABLE.search(h.symptoms):
        risk, escalate = "HIGH", True
    return risk, escalate


# ---------------------------------------------------------------------------------------------

SYSTEM = """You are FarmAs's livestock health assistant for African farmers. You give decision support, never a diagnosis.

Rules:
1. Never state a definite diagnosis. Use "possible", "could be", "based on what you told me".
2. Take disease facts, signs and control steps ONLY from the KNOWLEDGE EXCERPTS. If they do not cover the case, say so
   in a recommended action and advise a vet. Do not guess.
3. Only discuss the animal the farmer named. Never apply a disease from another species.
4. NO drug names, doses, amounts, volumes, or home-made mixtures unless they appear in the excerpts. Say the vet or
   agro-vet must give any dose.
5. For notifiable diseases (PPR, ASF, FMD, lumpy skin disease, Newcastle disease, avian influenza) or any serious case:
   isolate sick animals, stop moving or selling animals, and report to the state veterinary office.
6. Be conservative: when unsure between two risk levels, choose the higher one.
7. Plain, short sentences, readable on a phone. No markdown, no emojis.
8. If a photo is attached, mention only signs you can actually see, and say a photo cannot confirm a disease.
9. If the farmer writes Pidgin, write the text fields in simple Nigerian Pidgin; otherwise simple English.
10. observations = a plain restatement of what the farmer reported (max 5). possible_concerns = max 4.
    recommended_actions = 3 to 5 safe steps. requires_vet_escalation = true for HIGH risk or any notifiable disease."""


def _facts(h: HealthInput) -> str:
    rows = [
        ("Animal", h.species),
        ("Number sick", h.number_affected),
        ("Group size", h.total),
        ("Deaths", h.mortality),
        ("Started", h.onset),
        ("Drinking", h.drinking),
        ("Recently vaccinated", h.vaccinated),
    ]
    return "\n".join(f"- {k}: {v}" for k, v in rows if v not in (None, ""))


def _excerpts(h: HealthInput) -> str:
    if retriever is None:
        return "(no knowledge excerpts available)"
    query = f"{h.species or ''} {h.symptoms}".strip()
    hits = retriever.retrieve(query, top_k=3)
    if not hits:
        return "(no relevant excerpts found)"
    return "\n\n".join(f"[{x['source']} - {x['title']}]\n{x['content']}" for x in hits)


def assess(h: HealthInput, image: Optional[tuple[bytes, str]] = None) -> Assessment:
    """Raises ai_client.AiUnavailable if the AI cannot be used."""
    prompt = (
        f"FARMER'S DESCRIPTION:\n{h.symptoms.strip()}\n\nFACTS GIVEN:\n{_facts(h) or '- (none)'}\n\n"
        f"KNOWLEDGE EXCERPTS:\n{_excerpts(h)}"
    )
    result = ai_client.generate_structured(
        system=SYSTEM, prompt=prompt, schema=Assessment, media=image, effort="low", max_tokens=2000
    )

    floor_risk, floor_escalate = safety_floor(h)
    if _ORDER[floor_risk] > _ORDER[result.risk_level]:
        result.risk_level = floor_risk
    result.requires_vet_escalation = bool(
        result.requires_vet_escalation or floor_escalate or result.risk_level == "HIGH"
    )
    result.disclaimer = DISCLAIMER  # never let the model rewrite this
    result.observations = result.observations[:5]
    result.possible_concerns = result.possible_concerns[:4]
    result.recommended_actions = result.recommended_actions[:5]
    return result
