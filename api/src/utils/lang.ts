import type { LivestockType } from "@prisma/client";

/** The style the farmer wrote in. Replies mirror it: English for English, Pidgin for Pidgin. */
export type Lang = "english" | "pidgin";

export const DEFAULT_LANG: Lang = "english";

/** Everything a farmer can read or hear. Our own sentences are written in English and Pidgin; the rest are translated. */
export type ReplyLang = Lang | "yoruba" | "igbo" | "hausa" | "fulani";

export const REPLY_LANGS: ReplyLang[] = ["english", "pidgin", "yoruba", "igbo", "hausa", "fulani"];

/** The version of our built-in sentences to start from: Pidgin stays Pidgin, everything else starts as English. */
export function baseLang(lang: ReplyLang): Lang {
  return lang === "pidgin" ? "pidgin" : "english";
}

/** True for the languages we translate into (Yoruba, Igbo, Hausa, Fulani). */
export function needsTranslation(lang: ReplyLang): lang is "yoruba" | "igbo" | "hausa" | "fulani" {
  return lang === "yoruba" || lang === "igbo" || lang === "hausa" || lang === "fulani";
}

/** The lowest NLU confidence we accept before proposing to record something. Stricter where understanding is weaker. */
export function minConfidence(lang: ReplyLang): number {
  return lang === "fulani" ? 0.8 : lang === "igbo" ? 0.7 : 0.6;
}

/** Pick the English or the Pidgin version of a sentence. */
export function t(lang: Lang, english: string, pidgin: string): string {
  return lang === "pidgin" ? pidgin : english;
}

const ANIMAL: Record<LivestockType, [string, string]> = {
  POULTRY: ["bird", "birds"],
  GOAT: ["goat", "goats"],
  SHEEP: ["sheep", "sheep"],
  CATTLE: ["cattle", "cattle"],
  PIG: ["pig", "pigs"],
  RABBIT: ["rabbit", "rabbits"],
  FISH: ["fish", "fish"],
};

/** "1 bird", "20 birds", "3 goats". Never "20 poultrys". */
export function animals(type: LivestockType | string | undefined, quantity: number): string {
  const entry = type ? ANIMAL[type as LivestockType] : undefined;
  const [one, many] = entry ?? ["animal", "animals"];
  return `${quantity} ${quantity === 1 ? one : many}`;
}

/** The animal word alone, for sentences like "Poultry: ...". */
export function animalLabel(type: LivestockType | string): string {
  const entry = ANIMAL[type as LivestockType];
  return entry ? entry[1] : String(type).toLowerCase();
}
