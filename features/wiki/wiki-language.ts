import type { AppLocale } from "@/i18n/locale-registry";

import { francAll } from "franc-min";

import { APP_LOCALES, LOCALE_REGISTRY } from "@/i18n/locale-registry";

export const WIKI_LANGUAGE_SAMPLE_CHARACTERS = 6_000;
const MIN_LANGUAGE_LETTERS = 120;
const MIN_LANGUAGE_DISTANCE = 0.05;

function languageSample(markdown: string): string {
  return markdown
    .slice(0, WIKI_LANGUAGE_SAMPLE_CHARACTERS)
    .replace(/```[^]*?(?:```|$)/gu, " ")
    .replace(/~~~[^]*?(?:~~~|$)/gu, " ")
    .replace(/`[^`]*`/gu, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/https?:\/\/[^\s<>]+/gu, " ")
    .replace(/<[^>]*>/gu, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function detectedWikiLanguage(markdown: string): string | null {
  const text = languageSample(markdown);
  if ((text.match(/\p{L}/gu)?.length ?? 0) < MIN_LANGUAGE_LETTERS) return null;
  const [first, second] = francAll(text, { minLength: MIN_LANGUAGE_LETTERS });
  if (!first || first[0] === "und" || (second && first[1] - second[1] < MIN_LANGUAGE_DISTANCE)) return null;
  return first[0];
}

export function wikiLanguageMatches(markdown: string, locale: AppLocale): boolean {
  return detectedWikiLanguage(markdown) === LOCALE_REGISTRY[locale].iso6393;
}

export function wikiLanguageConflicts(markdown: string, locale: AppLocale): boolean {
  const detected = detectedWikiLanguage(markdown);
  return detected !== null && detected !== LOCALE_REGISTRY[locale].iso6393;
}

export function dominantWikiLanguage(samples: Iterable<string>): AppLocale | null {
  const counts = new Map<string, number>();

  for (const sample of samples) {
    const language = detectedWikiLanguage(sample);
    if (!language) continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return dominantWikiLanguageFromCounts(counts);
}

export function dominantWikiLanguageFromCounts(counts: ReadonlyMap<string, number>): AppLocale | null {
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  if (!ranked[0] || ranked[0][1] <= 0 || ranked[0][1] === ranked[1]?.[1]) return null;
  return APP_LOCALES.find((locale) => LOCALE_REGISTRY[locale].iso6393 === ranked[0][0]) ?? null;
}

export function wikiSourceLanguageMatches(
  source: { text: string; qaPairs: Array<{ question: string; answer: string }> },
  locale: AppLocale,
): boolean {
  if (!wikiLanguageMatches(source.text, locale)) return false;
  const parts = source.qaPairs.flatMap(({ question, answer }) => [question, answer]);
  return [...parts, parts.join("\n")].every((part) => !wikiLanguageConflicts(part, locale));
}
