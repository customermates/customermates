export type CreatePaletteSearchable = {
  title: string;
  description?: string;
  keywords?: readonly string[];
};

const MIN_TOKEN_LENGTH = 3;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

function words(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function createPaletteTokens(query: string): string[] {
  return [...new Set(words(query).filter((word) => word.length >= MIN_TOKEN_LENGTH))];
}

function matches(haystack: string[], token: string): boolean {
  return haystack.some((word) => word.startsWith(token));
}

export function filterCreateTemplates<T extends CreatePaletteSearchable>(templates: readonly T[], query: string): T[] {
  const tokens = createPaletteTokens(query);
  if (tokens.length === 0) return [...templates];
  return templates
    .map((template, index) => {
      const title = words(template.title);
      const rest = words([template.description ?? "", ...(template.keywords ?? [])].join(" "));
      const score = tokens.reduce(
        (total, token) => total + (matches(title, token) ? 2 : matches(rest, token) ? 1 : 0),
        0,
      );
      return { template, index, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.template);
}
