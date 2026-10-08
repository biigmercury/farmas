"""Turn a farmer's message (English / Nigerian English / Pidgin) into a structured farm action.

The Node API calls POST /nlu/extract and decides what to do with the result. This module only extracts:
it never writes records and never answers questions, so a wrong guess cannot change farm data by itself
(the API always asks the farmer to confirm before saving).
"""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app import ai_client

Intent = Literal[
    "CREATE_EXPENSE",
    "CREATE_SALE",
    "CREATE_LIVESTOCK",
    "CREATE_FEED_RECORD",
    "CREATE_HEALTH_RECORD",
    "QUERY_EXPENSES",
    "QUERY_SALES",
    "QUERY_PROFIT",
    "QUERY_LIVESTOCK",
    "UNKNOWN",
]

LivestockType = Literal["POULTRY", "GOAT", "SHEEP", "CATTLE", "PIG", "RABBIT", "FISH"]


class Entities(BaseModel):
    category: Optional[str] = Field(None, description="Expense category, upper case, e.g. FEED")
    livestock_type: Optional[LivestockType] = None
    quantity: Optional[float] = Field(None, description="Number of animals, or units of feed")
    amount: Optional[float] = Field(None, description="Money in Naira as a plain number")
    date: Optional[str] = Field(None, description="YYYY-MM-DD, or null if not mentioned")
    description: Optional[str] = None
    symptoms: list[str] = Field(default_factory=list)
    deaths: Optional[float] = Field(None, description="How many animals died, if stated")


class NluResult(BaseModel):
    intent: Intent
    confidence: float = Field(description="0 to 1. Low when the message is vague or could mean two things.")
    language: Literal["english", "pidgin"] = Field(description="The language style the farmer wrote in")
    entities: Entities


SYSTEM = """You read messages from African livestock farmers (mostly Nigerian) and extract what they want to do.
They write English, Nigerian English or Nigerian Pidgin. Do NOT translate: understand the meaning and intent.

Return the intent and entities. Rules:
- NEVER invent numbers. If the farmer did not say an amount, quantity or date, leave it null.
- Money is Naira. "300k" = 300000, "2 million" = 2000000, "₦70,000" = 70000, "50 thousand" = 50000.
- Dates: use the CURRENT_DATE given. "today" = that date, "yesterday" = one day before, "last week" = 7 days before.
  Output YYYY-MM-DD. If no date is mentioned, date = null.
- livestock_type: broilers, layers, chicks, birds, fowl, turkey -> POULTRY; goat -> GOAT; sheep, ram, ewe -> SHEEP;
  cow, cattle, bull -> CATTLE; pig, sow, piglet -> PIG; rabbit -> RABBIT; catfish, tilapia, fish -> FISH.
  If the farmer did not name an animal, null.
- language: "pidgin" if the message uses Pidgin words (dey, don, wetin, abeg, kpai, chop, na, no be, sabi...), else "english".

Intents:
- CREATE_LIVESTOCK: the farmer BOUGHT or received new animals. quantity = number of animals, amount = total cost,
  description = breed/batch name if given.
- CREATE_SALE: the farmer SOLD animals. quantity, amount (total received), livestock_type, description = buyer name if given.
- CREATE_EXPENSE: money spent that is NOT buying animals and has no feed quantity. category is one of FEED, MEDICATION,
  VACCINATION, LABOUR, TRANSPORT, UTILITIES, REPAIR, OTHER. amount required. description = what it was for.
- CREATE_FEED_RECORD: feed bought or given WITH a quantity (bags, kg). quantity = units, amount = cost if given,
  description = feed type (starter, grower, layer mash...). If only money is stated, use CREATE_EXPENSE with category FEED.
- CREATE_HEALTH_RECORD: sickness, symptoms, or deaths. symptoms = short plain phrases ("coughing", "not eating",
  "watery droppings"). quantity = how many animals are affected (if stated). deaths = how many died (if stated).
  "don kpai", "dem die", "dead" mean died.
- QUERY_EXPENSES: asks how much was spent. QUERY_SALES: asks how much was sold/earned from sales.
  QUERY_PROFIT: asks about profit or loss. QUERY_LIVESTOCK: asks how many animals or what is on the farm.
- UNKNOWN: greetings, thanks, unrelated chat, or anything you cannot confidently map. Give confidence below 0.5.

confidence: 0.9+ when clear; 0.6-0.8 when you had to assume something; below 0.5 when unsure.
One message = one intent. If it mixes two, pick the main one and lower the confidence a little.

Examples (message -> intent; key entities):
"I buy 100 broilers yesterday for 250 thousand naira" -> CREATE_LIVESTOCK; quantity 100, POULTRY, amount 250000, date yesterday
"I don sell 20 birds for 75k" -> CREATE_SALE; quantity 20, POULTRY, amount 75000; pidgin
"Three don kpai" -> CREATE_HEALTH_RECORD; deaths 3, symptoms ["deaths"]; pidgin
"Dem no dey chop" -> CREATE_HEALTH_RECORD; symptoms ["not eating"]; pidgin
"These goats dey cough" -> CREATE_HEALTH_RECORD; GOAT, symptoms ["coughing"]; pidgin
"I spent ₦70,000 on feed yesterday" -> CREATE_EXPENSE; category FEED, amount 70000, date yesterday
"I buy 50 bags of feed yesterday" -> CREATE_FEED_RECORD; quantity 50, description "feed"; pidgin
"Abeg check how much I don spend on feed this month" -> QUERY_EXPENSES; category FEED; pidgin
"Am I making profit?" -> QUERY_PROFIT
"How many goats do I have?" -> QUERY_LIVESTOCK; GOAT
"Good morning" -> UNKNOWN
"""


def extract(text: str, context: Optional[dict] = None) -> NluResult:
    """Understand one farmer message. Raises ai_client.AiUnavailable if the AI cannot be used."""
    today = (context or {}).get("current_date") or date.today().isoformat()
    today = str(today)[:10]
    farm = ""
    if context:
        batches = context.get("batches") or []
        livestock = context.get("livestock") or []
        if batches or livestock:
            farm = (
                "\nFARM CONTEXT (use only to resolve words like 'these birds'; never to invent numbers):\n"
                f"batches: {batches[:10]}\nlivestock: {livestock[:10]}\n"
            )
    prompt = f"CURRENT_DATE: {today}{farm}\nFARMER MESSAGE: {text.strip()}"
    return ai_client.generate_structured(system=SYSTEM, prompt=prompt, schema=NluResult, effort="none", max_tokens=600)
