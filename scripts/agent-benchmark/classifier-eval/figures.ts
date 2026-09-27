const MAX_FIGURES = 40;
const NUMBER =
  /(?<![\p{L}\p{N}_\-/.:#])[-+−]?\d[\d,.' ]*\d(?![\p{N}])|(?<![\p{L}\p{N}_\-/.:#])[-+−]?\d(?![\p{L}\p{N}.,:])/gu;

export function canonicalFigure(raw: string): string | null {
  const trimmed = raw.replace(/\s+$/, "").replace(/^[+]/, "").replace("−", "-");
  const grouped = /^-?\d{1,3}(?:[,.' ]\d{3})+$/.test(trimmed);
  const decimalComma = /^-?\d+,\d{1,2}$/.test(trimmed);
  const plain = /^-?\d+(?:\.\d+)?$/.test(trimmed);
  if (grouped) return trimmed.replace(/[,.' ]/g, "");
  if (decimalComma) return trimmed.replace(",", ".");
  if (plain) return trimmed;
  return null;
}

export function extractFigures(answer: string, prompt: string): string[] {
  const promptFigures = new Set(
    [...prompt.matchAll(NUMBER)]
      .map((m) => canonicalFigure(m[0]))
      .filter(Boolean),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of answer.split("\n")) {
    const body = line.replace(/^\s*(?:[-*]\s+)?\d{1,2}[.)]\s+/, "");
    for (const match of body.matchAll(NUMBER)) {
      const raw = match[0].trim();
      const canonical = canonicalFigure(raw);
      if (!canonical) continue;
      if (/^0\d/.test(raw)) continue;
      if (/^(19|20)\d{2}$/.test(canonical)) continue;
      if (promptFigures.has(canonical) || seen.has(canonical)) continue;
      seen.add(canonical);
      out.push(raw);
    }
  }
  return out.slice(0, MAX_FIGURES);
}
