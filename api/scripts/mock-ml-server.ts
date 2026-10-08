import express from "express";
import multer from "multer";

const PORT = Number(process.env.MOCK_ML_PORT ?? 8001);

const app = express();
app.use(express.json());
const formParser = multer().any();

type Intent =
  | "CREATE_EXPENSE"
  | "CREATE_SALE"
  | "CREATE_LIVESTOCK"
  | "CREATE_FEED_RECORD"
  | "CREATE_HEALTH_RECORD"
  | "QUERY_EXPENSES"
  | "QUERY_SALES"
  | "QUERY_PROFIT"
  | "QUERY_LIVESTOCK"
  | "UNKNOWN";

interface Entities {
  category?: string;
  livestock_type?: string;
  quantity?: number;
  amount?: number;
  date?: string;
  description?: string;
  symptoms?: string[];
}

const LIVESTOCK_PATTERN =
  /\b(broiler|broilers|chicken|layer|layers|poultry|bird|birds|fowl|goat|goats|sheep|ram|rams|cattle|cow|cows|pig|pigs|rabbit|rabbits)\b/i;

function livestockTypeFor(word: string): string | undefined {
  const w = word.toLowerCase();
  if (/broiler|chicken|layer|poultry|bird|fowl/.test(w)) return "POULTRY";
  if (/goat/.test(w)) return "GOAT";
  if (/sheep|ram/.test(w)) return "SHEEP";
  if (/cow|cattle/.test(w)) return "CATTLE";
  if (/pig/.test(w)) return "PIG";
  if (/rabbit/.test(w)) return "RABBIT";
  return undefined;
}

function parseAmount(text: string): number | undefined {
  const naira = text.match(/₦\s*([\d,]+(?:\.\d+)?)/);
  if (naira) return Number(naira[1].replace(/,/g, ""));

  const suffixed = text.match(/([\d,]+(?:\.\d+)?)\s*(k|m)\b/i);
  if (suffixed) {
    const base = Number(suffixed[1].replace(/,/g, ""));
    const multiplier = suffixed[2].toLowerCase() === "k" ? 1_000 : 1_000_000;
    return base * multiplier;
  }

  const forMatch = text.match(/\bfor\s+([\d,]+)\b/i);
  if (forMatch) {
    const value = Number(forMatch[1].replace(/,/g, ""));
    if (value >= 100) return value;
  }

  const worth = text.match(/\b(?:worth|cost|paid|spend(?:t)?|spent)\s+([\d,]+)\b/i);
  if (worth) return Number(worth[1].replace(/,/g, ""));

  const bigNumber = text.match(/\b([\d]{4,}(?:,\d{3})+)\b/);
  if (bigNumber) return Number(bigNumber[1].replace(/,/g, ""));

  return undefined;
}

function parseQuantity(text: string): { quantity?: number; type?: string } {
  const match = text.match(/(\d+)\s*(?:of\s+)?([a-z]+)/i);
  if (match) {
    const qty = Number(match[1]);
    const type = livestockTypeFor(match[2] ?? "");
    if (type && qty > 0) return { quantity: qty, type };
  }

  const animalFirst = text.match(/(\d+)?\s*(broilers?|chickens?|layers?|goats?|sheep|rams?|pigs?|rabbits?|birds?|cattle|cows?)/i);
  if (animalFirst) {
    const qty = animalFirst[1] ? Number(animalFirst[1]) : undefined;
    const type = livestockTypeFor(animalFirst[2] ?? "");
    if (type) return { quantity: qty, type };
  }

  const bare = text.match(/\b(\d{1,4})\b/);
  if (bare) return { quantity: Number(bare[1]) };
  return {};
}

function parseDate(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("yesterday")) return new Date(Date.now() - 86_400_000).toISOString();
  if (lower.includes("today") || lower.includes("this morning")) return new Date().toISOString();
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  return undefined;
}

function parseCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/feed|fatten/.test(lower)) return "FEED";
  if (/medicine|drug|antibiotic|vitamin|veterinary/.test(lower)) return "MEDICATION";
  if (/vaccine|vaccination|booster/.test(lower)) return "VACCINATION";
  if (/transport|fuel|dispatch/.test(lower)) return "TRANSPORT";
  if (/labour|worker|staff|salary|hire/.test(lower)) return "LABOUR";
  if (/electricity|generator|utility|water/.test(lower)) return "UTILITIES";
  if (/repair|maintenance/.test(lower)) return "REPAIR";
  if (/tax|levy/.test(lower)) return "TAX";
  return "OTHER";
}

function parseFeedDescription(text: string): string | undefined {
  const match = text.match(/\b(starter|grower|finisher|layer|broiler|pellet|maize|soybean|brand)?\s*feed\b/i);
  if (!match) return undefined;
  const parts = [match[1], "feed"].filter(Boolean);
  return parts.join(" ").trim();
}

function classify(text: string): Intent {
  const t = text.toLowerCase();

  if (/\bprofit|net (income|gain)|how much.*\b(make|gain)\b/.test(t)) return "QUERY_PROFIT";
  if (/\bhow much\b.*\b(spend|spent|cost|expenses?)\b|\bexpenses?\b.*(month|week|so far)/.test(t))
    return "QUERY_EXPENSES";
  if (/\bhow much\b.*\b(sell|sold)\b|\bsales\b.*(month|week|so far)/.test(t)) return "QUERY_SALES";
  if (/\bhow many\b|\bcount\b|\binventory\b|\bstock\b|\blivestock\b|\banimals?\b.*(get|have)/.test(t))
    return "QUERY_LIVESTOCK";

  if (/\b(sick|cough|symptom|diarrh|not eating|no dey eat|don kpai|died|dead|mortalit|droop|limp|swollen|fever|discharge|pox)\b/.test(t))
    return "CREATE_HEALTH_RECORD";

  if (
    /\b(buy|bought|purchase|purchased|got|received|carty)\b[\s\S]{0,40}\b(broiler|chicken|layer|bird|goat|sheep|cattle|cow|pig|rabbit)\b/.test(
      t
    )
  )
    return "CREATE_LIVESTOCK";

  if (/\b(give|gave|fed|feeding|sprinkle)\b[\s\S]{0,30}\bfeed\b/.test(t)) return "CREATE_FEED_RECORD";
  if (/\bfeed\b[\s\S]{0,20}\b(bag|bags|kg|sack|sacks)\b/.test(t) && /\b(buy|bought|got)\b/.test(t))
    return "CREATE_EXPENSE";
  if (/\bfeed\b[\s\S]{0,25}\b(bag|bags|kg|sack|sacks)\b/.test(t)) return "CREATE_FEED_RECORD";

  if (/\b(sell|sold|don sell|marketed)\b/.test(t)) return "CREATE_SALE";
  if (/\b(spend|spent|paid|pay|bought|buy|cost|expense|expenses|purchase|waste|settle)\b/.test(t))
    return "CREATE_EXPENSE";

  return "UNKNOWN";
}

app.post("/nlu/extract", (req, res) => {
  const text = String(req.body?.text ?? "");
  const intent = classify(text);

  const entities: Entities = {};
  const quantityInfo = parseQuantity(text);
  const amount = parseAmount(text);

  if (quantityInfo.quantity !== undefined) entities.quantity = quantityInfo.quantity;
  if (quantityInfo.type) entities.livestock_type = quantityInfo.type;
  if (amount !== undefined && intent !== "QUERY_EXPENSES") entities.amount = amount;

  const date = parseDate(text);
  if (date) entities.date = date;

  if (intent === "CREATE_EXPENSE") entities.category = parseCategory(text);
  if (intent === "CREATE_FEED_RECORD") {
    const feedType = parseFeedDescription(text);
    if (feedType) entities.description = feedType;
    entities.category = "FEED";
  }
  if (intent === "CREATE_HEALTH_RECORD") {
    entities.symptoms = [text.trim()];
    if (entities.quantity === undefined) delete entities.quantity;
  }
  if (intent === "CREATE_SALE") {
    const buyer = text.match(/\bto\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (buyer) entities.description = buyer[1];
  }

  const confidence = intent === "UNKNOWN" ? 0.25 : 0.92;

  res.json({ intent, confidence, entities });
});

app.post("/stt/transcribe", formParser, (_req, res) => {
  res.json({ transcription: "I spend 50000 on feed today" });
});

app.post("/health/assess", formParser, (req, res) => {
  const symptoms = String(req.body?.symptoms ?? "");
  const severe = /kpai|die|dead|mortalit|sudden/.test(symptoms.toLowerCase());
  const moderate = /cough|sick|not eating|no dey eat|droop|diarrh/.test(symptoms.toLowerCase());

  const risk = severe ? "HIGH" : moderate ? "MEDIUM" : "LOW";

  res.json({
    risk_level: risk,
    observations: [
      "Symptoms received and checked against common West African poultry and livestock conditions.",
      severe ? "Mortality signal detected in the reported text." : "No mortality signal detected.",
    ],
    possible_concerns: severe
      ? ["Newcastle disease", "Acute bacterial infection", "Toxicity"]
      : moderate
        ? ["Respiratory infection", "Heat stress", "Early infection"]
        : ["No significant concern detected"],
    recommended_actions: severe
      ? ["Contact your veterinarian immediately", "Isolate affected animals", "Disinfect housing"]
      : ["Monitor feed and water intake", "Keep housing clean", "Re-assess in 24 hours"],
    requires_vet_escalation: severe,
    disclaimer:
      "FarmAs provides AI-assisted decision support and does not replace professional veterinary diagnosis.",
  });
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "mock-ml" });
});

app.listen(PORT, () => {
  console.log(`Mock ML service dey listen on http://localhost:${PORT}`);
});
