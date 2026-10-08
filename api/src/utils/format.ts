const NGN = new Intl.NumberFormat("en-NG", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function naira(amount: number | string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return "₦0";
  return `₦${NGN.format(value)}`;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s₦]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const AFFIRMATIVE_PATTERNS: RegExp[] = [
  /^y(es|eah|ep|a|es o|es sir|es please)?$/,
  /^(ok|okay|sure|correct|fine|go ahead|proceed|do am|do it|make e do)$/,
  /^save (it|am|this)( o+)?$/,
  /^(please )?confirm(ed| am)?( o+)?$/,
  /^na true$/,
  /^true$/,
  /^i agree$/,
  /^enter (it|am)$/,
  /^kuku save$/,
];

const NEGATIVE_PATTERNS: RegExp[] = [
  /^n(o|ah|ope|a)?$/,
  /^no( o+| sir| thanks| thank you)?$/,
  /^cancel( it| am)?$/,
  /^reject( it| am)?$/,
  /^discard( it| am)?$/,
  /^forget (it|am|this)$/,
  /^leave (it|am|am o)$/,
  /^abeg no$/,
  /^do not save$/,
  /^don t save$/,
];

export function isAffirmative(raw: string): boolean {
  const text = normalizeText(raw ?? "");
  if (!text) return false;
  return AFFIRMATIVE_PATTERNS.some((p) => p.test(text));
}

export function isNegative(raw: string): boolean {
  const text = normalizeText(raw ?? "");
  if (!text) return false;
  return NEGATIVE_PATTERNS.some((p) => p.test(text));
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
