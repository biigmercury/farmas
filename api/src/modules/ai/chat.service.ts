import { MlServiceError, mlClient, type ChatLanguage, type ChatTurn } from "../../config/mlClient";
import { prisma } from "../../config/prisma";
import { logger } from "../../utils/logger";
import { animalLabel, t, type Lang } from "../../utils/lang";
import { findNearbyVets, geocode, vetsAsText, type VetPlace } from "../vets/vets.service";

export interface ChatInput {
  farmId: string;
  userId: string;
  text: string;
  sessionId: string;
  language: ChatLanguage;
  history: ChatTurn[];
  /** The phone's location, if the farmer allowed it. */
  location?: { lat: number; lng: number };
  /** True when the farmer said no to sharing their location (we fall back to the farm's saved place). */
  locationDenied?: boolean;
}

export interface ChatResult {
  reply: string;
  vets?: VetPlace[];
  searchUrl?: string;
  /** The app should ask the phone for its location and send the same message again. */
  needsLocation?: boolean;
}

const VET_WORD = /\b(vets?|veterinar\w*|animal doctors?|clinics?|hospitals?|agro[- ]?vet)\b/i;
const NEAR_WORD = /\b(near\w*|close\w*|around|where|find|locate|any|dey|location|direction\w*|address|contact|call)\b/i;

/** "Where is the nearest vet?" yes. "My vet said to isolate them" no. */
export function isVetSearch(text: string): boolean {
  return VET_WORD.test(text) && NEAR_WORD.test(text);
}

function langOf(language: ChatLanguage, text: string): Lang {
  if (language === "pidgin") return "pidgin";
  if (language === "english") return "english";
  return /\b(abeg|dey|wetin|na|una|make i|dem|wahala|how far|where .* dey)\b/i.test(text) ? "pidgin" : "english";
}

async function farmSnapshot(farmId: string): Promise<Record<string, unknown>> {
  const [farm, stock] = await Promise.all([
    prisma.farm.findUnique({ where: { id: farmId }, select: { name: true, location: true } }),
    prisma.livestock.groupBy({
      by: ["type"],
      where: { farmId, status: "ACTIVE", quantity: { gt: 0 } },
      _sum: { quantity: true },
    }),
  ]);
  return {
    farm_name: farm?.name,
    location: farm?.location,
    animals: stock.map((row) => `${row._sum.quantity ?? 0} ${animalLabel(row.type)}`).join(", "),
  };
}

async function vetReply(input: ChatInput): Promise<ChatResult> {
  const lang = langOf(input.language, input.text);

  let coords = input.location;
  let usedFarmPlace = false;
  if (!coords && input.locationDenied) {
    const farm = await prisma.farm.findUnique({ where: { id: input.farmId }, select: { location: true } });
    const found = farm?.location ? await geocode(farm.location) : null;
    if (found) {
      coords = found;
      usedFarmPlace = true;
    }
  }

  if (!coords) {
    return {
      // Only ask the phone once: after a "no" the app must not ask again.
      needsLocation: !input.locationDenied,
      reply: input.locationDenied
        ? t(
            lang,
            "I could not work out where you are. Please set your farm's town or state in your farm details, then ask me again.",
            "I no fit know where you dey. Abeg put your farm town or state for your farm details, then ask me again."
          )
        : t(
            lang,
            "To find the nearest vet I need your location. Please tap Allow when your phone asks.",
            "To find the vet wey near you, I need your location. Abeg tap Allow when your phone ask you."
          ),
    };
  }

  const search = await findNearbyVets(coords.lat, coords.lng);
  const where = usedFarmPlace ? t(lang, "your farm's area", "your farm area") : t(lang, "you", "you");

  if (search.vets.length === 0) {
    return {
      vets: [],
      searchUrl: search.searchUrl,
      reply: search.lookupFailed
        ? t(
            lang,
            "I could not reach the map just now. Tap the Google Maps button to search for vets near you.",
            "I no fit reach the map now. Tap the Google Maps button make you search vet wey near you."
          )
        : t(
            lang,
            "I did not find a vet clinic in the map data near you. Tap the Google Maps button to search wider, or ask your local agro-vet shop.",
            "I no see vet clinic for the map near you. Tap the Google Maps button make you search wider, or ask your local agro-vet shop."
          ),
    };
  }

  // The farmer asked in words, so show a short text answer too. The app also draws these as tappable cards.
  const header = t(
    lang,
    `Here are the nearest vet clinics I found around ${where}:`,
    `Na these be the vet clinics wey near ${where}:`
  );
  const footer = t(
    lang,
    "Tap a clinic for directions. If animals are dying fast or struggling to breathe, call a vet now and report to your state veterinary office.",
    "Tap one clinic for directions. If animals dey die quick or dem dey struggle to breathe, call vet now and report am to your state veterinary office."
  );
  return {
    vets: search.vets,
    searchUrl: search.searchUrl,
    reply: `${header}\n${vetsAsText(search.vets)}\n\n${footer}`,
  };
}

/** Chatbot mode: answer a general question. Never writes farm records (only the conversation itself is saved). */
export async function processChat(input: ChatInput): Promise<ChatResult> {
  const text = input.text.trim();
  let result: ChatResult;

  try {
    if (isVetSearch(text)) {
      result = await vetReply(input);
    } else {
      const reply = await mlClient.chat({
        message: text,
        history: input.history,
        language: input.language,
        farm: await farmSnapshot(input.farmId),
      });
      result = { reply };
    }
  } catch (err) {
    if (err instanceof MlServiceError) {
      result = { reply: err.message };
    } else {
      throw err;
    }
  }

  // When we only asked for the location, the app sends the same message again with it: do not save it twice.
  if (!result.needsLocation) {
    try {
      await prisma.aiConversation.create({
        data: {
          userId: input.userId,
          farmId: input.farmId,
          sessionId: input.sessionId,
          channel: "APP",
          message: text,
          response: result.reply,
        },
      });
    } catch (err) {
      logger.error({ err, farmId: input.farmId }, "Failed to persist chat message");
    }
  }
  return result;
}
