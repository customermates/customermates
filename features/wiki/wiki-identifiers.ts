const IDENTIFIER_TOKEN = /\S+/gu;
const IDENTIFIER_MIN_LENGTH = 3;
const IDENTIFIER_MAX_TERMS = 8;

export function wikiIdentifierPattern(term: string): string {
  return `(^|[^0-9])${term}($|[^0-9])`;
}

export function wikiCompact(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function wikiIdentifierTerms(query: string): string[] {
  const tokens = (query.normalize("NFC").match(IDENTIFIER_TOKEN) ?? []).map((token) => ({
    raw: token,
    compact: wikiCompact(token),
    identifier: /\p{N}/u.test(token) || /[@#§]/u.test(token),
  }));
  const terms = new Set<string>();
  tokens.forEach((token, index) => {
    if (!token.identifier) return;
    if (/\p{L}/u.test(token.compact) || token.compact.length > IDENTIFIER_MIN_LENGTH) terms.add(token.compact);
    if (/^\p{N}+$/u.test(token.compact)) {
      const previous = tokens.slice(Math.max(0, index - 2), index).map((entry) => entry.compact);
      if (token.compact.length >= 2 && previous.length === 2) terms.add(`${previous.join("")}${token.compact}`);
      if (token.compact.length >= 2 && previous.length > 0) terms.add(`${previous.at(-1)}${token.compact}`);
      const next = tokens[index + 1]?.compact;
      const legal = token.raw.includes("§") || tokens[index - 1]?.raw === "§";
      if (legal && next && /^\p{L}+$/u.test(next)) terms.add(`${token.compact}${next}`);
    }
  });
  return [...terms].filter((term) => term.length >= IDENTIFIER_MIN_LENGTH).slice(0, IDENTIFIER_MAX_TERMS);
}
