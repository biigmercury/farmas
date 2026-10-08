export function normalizePhone(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("234") && digits.length >= 13) return digits;
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 10)) {
    return `234${digits.slice(1)}`;
  }
  if (digits.length === 10) return `234${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

export function toDisplayPhone(normalized: string): string {
  return `+${normalized}`;
}
