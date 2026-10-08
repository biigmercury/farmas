import type { LivestockType } from "@prisma/client";

/** The style the farmer wrote in. Replies mirror it: English for English, Pidgin for Pidgin. */
export type Lang = "english" | "pidgin";

export const DEFAULT_LANG: Lang = "english";

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
