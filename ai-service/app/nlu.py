"""Turn a farmer's message (English / Nigerian English / Pidgin) into a structured farm action.

The Node API calls POST /nlu/extract and decides what to do with the result. This module only extracts:
it never writes records and never answers questions, so a wrong guess cannot change farm data by itself
(the API always asks the farmer to confirm before saving).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app import ai_client

Intent = Literal[
    "CREATE_EXPENSE",
    "CREATE_SALE",
    "CREATE_LIVESTOCK",
    "CREATE_FEED_RECORD",
    "CREATE_HEALTH_RECORD",
    "REMOVE_LIVESTOCK",
    "CREATE_REMINDER",
    "QUERY_HISTORY",
    "SEARCH_CONVERSATIONS",
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
    reason: Optional[Literal["LOST", "CONSUMED"]] = Field(
        None, description="Only for REMOVE_LIVESTOCK: LOST (stolen, missing, given away) or CONSUMED (eaten, slaughtered for the home)"
    )
    # Reminders
    remind_at: Optional[str] = Field(None, description="CREATE_REMINDER: when to remind, local Nigeria time, YYYY-MM-DDTHH:MM")
    reminder_title: Optional[str] = Field(None, description="CREATE_REMINDER: the short thing to do, e.g. 'Vaccinate goats'")
    reminder_kind: Optional[Literal["VACCINATION", "GENERAL"]] = None
    # Looking back at what happened
    history_topic: Optional[Literal["SALES", "EXPENSES", "DEATHS", "HEALTH", "ANIMALS", "TASKS", "ALL"]] = Field(
        None, description="QUERY_HISTORY: what the farmer wants to look back at"
    )
    period_start: Optional[str] = Field(None, description="QUERY_HISTORY / SEARCH_CONVERSATIONS: first day, YYYY-MM-DD")
    period_end: Optional[str] = Field(None, description="QUERY_HISTORY / SEARCH_CONVERSATIONS: last day, YYYY-MM-DD")
    search_terms: list[str] = Field(
        default_factory=list, description="SEARCH_CONVERSATIONS: the important words to look for, lower case"
    )


class NluResult(BaseModel):
    intent: Intent
    confidence: float = Field(description="0 to 1. Low when the message is vague or could mean two things.")
    language: Literal["english", "pidgin", "yoruba", "igbo", "hausa", "fulani"] = Field(
        description="The language the farmer wrote in"
    )
    entities: Entities


SYSTEM = """You read messages from African livestock farmers (mostly Nigerian) and extract what they want to do.
They write English, Nigerian English, Nigerian Pidgin, Yoruba, Igbo, Hausa or Fulani (Fulfulde), often mixed with
English words. Do NOT translate: understand the meaning and intent in whatever language it is written.

Return the intent and entities. Rules:
- NEVER invent numbers. If the farmer did not say an amount, quantity or date, leave it null.
- Money is Naira. "300k" = 300000, "2 million" = 2000000, "₦70,000" = 70000, "50 thousand" = 50000.
- Dates: use the CURRENT_DATE given. "today" = that date, "yesterday" = one day before, "last week" = 7 days before.
  Output YYYY-MM-DD. If no date is mentioned, date = null.
- livestock_type: broilers, layers, chicks, birds, fowl, turkey -> POULTRY; goat -> GOAT; sheep, ram, ewe -> SHEEP;
  cow, cattle, bull -> CATTLE; pig, sow, piglet -> PIG; rabbit -> RABBIT; catfish, tilapia, fish -> FISH.
  If the farmer did not name an animal, null.
  Words in the local languages (use these to fill livestock_type):
  Hausa: kaza = chicken (POULTRY), awaki = goats, tumaki = sheep, shanu or saniya = cattle, alade = pig, zomo = rabbit,
  kifi = fish. Yoruba: adìẹ = chicken (POULTRY), ewúrẹ́ = goat, àgùntàn = sheep, màlúù = cattle, ẹlẹ́dẹ̀ = pig,
  ehoro = rabbit, ẹja = fish. Igbo: ọkụkọ = chicken (POULTRY), ewu = goat, atụrụ = sheep, ehi = cattle, ezi = pig,
  azụ = fish. In these languages "sold" means CREATE_SALE (Hausa: na sayar; Yoruba: mo tà; Igbo: ere m) and "bought"
  means CREATE_LIVESTOCK (Hausa: na saya; Yoruba: mo rà; Igbo: azụrụ m / zụrụ m).
  If you are not sure what a Fulani message means, give a LOW confidence (below 0.5) instead of guessing.
- language: "pidgin" if the message uses Pidgin words (dey, don, wetin, abeg, kpai, chop, na, no be, sabi...);
  "yoruba", "igbo", "hausa" or "fulani" if the message is mainly written in that language; else "english".
  Animals, numbers and money in those languages map to the same fields as in English.

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
- REMOVE_LIVESTOCK: animals left the farm WITHOUT a sale and did NOT die: stolen, missing, given away, eaten or slaughtered
  for the home. quantity, livestock_type, reason = LOST or CONSUMED (null if not clear). Deaths are CREATE_HEALTH_RECORD.
  A sale is CREATE_SALE.
- CREATE_REMINDER: the farmer wants to be reminded, or wants something scheduled ("remind me to vaccinate my goats on
  Friday", "set a vaccination for the broilers on 25 October at 8am", "remind me tomorrow to buy feed").
  reminder_title = the short thing to do. remind_at = when, local Nigeria time as YYYY-MM-DDTHH:MM. If a date is given
  but no time, use 08:00. If no date or day is given at all, leave remind_at null. reminder_kind = VACCINATION when it is
  about vaccines or injections for animals, otherwise GENERAL. livestock_type if an animal is named.
- QUERY_HISTORY: the farmer asks what HAPPENED on the farm in the past: deaths, sick animals, animals bought, sold or
  lost, vaccinations, tasks, "when did I last ...", or any money question about a period that is not simply one month.
  history_topic = SALES, EXPENSES, DEATHS, HEALTH, ANIMALS, TASKS or ALL. period_start and period_end = the first and
  last day asked about (YYYY-MM-DD), null if no period was mentioned. livestock_type if an animal is named.
- SEARCH_CONVERSATIONS: the farmer asks what THEY SAID or what the AI told them before ("what did I tell you about the
  sick goats last week?", "remind me what you said about feed"). search_terms = the 1 to 4 most important words in
  lower case; period_start / period_end if a time is mentioned.
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
"Dem don thief 5 goats" -> REMOVE_LIVESTOCK; quantity 5, GOAT, reason LOST; pidgin
"We slaughtered 2 sheep for the naming ceremony" -> REMOVE_LIVESTOCK; quantity 2, SHEEP, reason CONSUMED
"3 goats died" -> CREATE_HEALTH_RECORD; deaths 3, GOAT, symptoms ["deaths"]
"Remind me to vaccinate my goats on Friday" -> CREATE_REMINDER; reminder_title "Vaccinate goats", reminder_kind VACCINATION, GOAT, remind_at = the next Friday 08:00
"How many birds died in September?" -> QUERY_HISTORY; history_topic DEATHS, POULTRY, period_start/period_end = September
"When did I last vaccinate?" -> QUERY_HISTORY; history_topic TASKS
"What did I tell you about the sick goats last week?" -> SEARCH_CONVERSATIONS; search_terms ["sick", "goats"]
"Good morning" -> UNKNOWN
"""


def extract(text: str, context: Optional[dict] = None) -> NluResult:
    """Understand one farmer message. Raises ai_client.AiUnavailable if the AI cannot be used."""
    now_raw = (context or {}).get("current_date")
    today = str(now_raw or date.today().isoformat())[:10]
    try:
        utc = datetime.fromisoformat(str(now_raw).replace("Z", "+00:00")) if now_raw else datetime.now(timezone.utc)
        if utc.tzinfo is None:
            utc = utc.replace(tzinfo=timezone.utc)
        local = utc.astimezone(timezone(timedelta(hours=1)))  # Nigeria is UTC+1 all year
        today = local.strftime("%Y-%m-%d")
        local_now = local.strftime("%Y-%m-%d %H:%M, %A")
    except ValueError:
        local_now = today
    farm = ""
    if context:
        batches = context.get("batches") or []
        livestock = context.get("livestock") or []
        if batches or livestock:
            farm = (
                "\nFARM CONTEXT (use only to resolve words like 'these birds'; never to invent numbers):\n"
                f"batches: {batches[:10]}\nlivestock: {livestock[:10]}\n"
            )
    recent = ""
    history = (context or {}).get("history") or []
    if history:
        lines = [f"{h.get('role', 'user')}: {str(h.get('content', ''))[:300]}" for h in history[-6:] if isinstance(h, dict)]
        recent = (
            "\nRECENT CONVERSATION (only to understand follow-ups like 'and the other 5?'; "
            "the FARMER MESSAGE is what to extract):\n" + "\n".join(lines) + "\n"
        )
    prompt = f"CURRENT_DATE: {today}\nNOW IN NIGERIA: {local_now}{farm}{recent}\nFARMER MESSAGE: {text.strip()}"
    return ai_client.generate_structured(system=SYSTEM, prompt=prompt, schema=NluResult, effort="none", max_tokens=600)
