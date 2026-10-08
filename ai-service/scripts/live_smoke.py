"""Live check against the real OpenAI API (uses your key; a handful of small calls).

Run from the ai-service folder:  python scripts/live_smoke.py
Prints what the AI understood for the Pidgin examples from the project brief, so a human can eyeball it.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config, health, nlu  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles cannot print the Naira sign by default

CASES = [
    "I buy 100 broilers yesterday for 250 thousand naira",
    "I don buy 200 broiler yesterday for 300k",
    "I don sell 20 birds for 75k",
    "Three don kpai",
    "Dem no dey chop",
    "These goats dey cough",
    "I spent ₦70,000 on feed yesterday",
    "I buy 50 bags of feed yesterday",
    "Abeg check how much I don spend on feed this month",
    "Am I making profit?",
    "How many goats do I have?",
    "Good morning",
]

print(f"model: {config.OPENAI_MODEL} | key configured: {bool(config.OPENAI_API_KEY)}\n")
for text in CASES:
    r = nlu.extract(text, {"current_date": "2026-10-08"})
    e = r.entities
    bits = {k: v for k, v in e.model_dump().items() if v not in (None, [], "")}
    print(f"{text!r}\n   -> {r.intent} conf={r.confidence:.2f} lang={r.language} {bits}")

print("\n--- health ---")
h = health.HealthInput(
    symptoms="Some of the birds dey cough and dem no dey chop well",
    species="poultry", number_affected=15, total=500, mortality=0, onset="few-days", drinking="normal",
)
a = health.assess(h)
print(a.model_dump_json(indent=2))
