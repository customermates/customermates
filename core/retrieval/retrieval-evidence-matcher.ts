import type { LocaleCode, TextSearchConfig } from "@/i18n/locale-registry";
import type { FullTextUnit } from "./full-text-query";

import { stemmer as englishStemmer } from "@orama/stemmers/english";
import { stemmer as germanStemmer } from "@orama/stemmers/german";
import { stemmer as frenchStemmer } from "@orama/stemmers/french";
import { stemmer as italianStemmer } from "@orama/stemmers/italian";
import { stemmer as spanishStemmer } from "@orama/stemmers/spanish";
import { stopwords as englishStopwords } from "@orama/stopwords/english";
import { stopwords as germanStopwords } from "@orama/stopwords/german";
import { stopwords as frenchStopwords } from "@orama/stopwords/french";
import { stopwords as italianStopwords } from "@orama/stopwords/italian";
import { stopwords as spanishStopwords } from "@orama/stopwords/spanish";

import { DEFAULT_LOCALE, LOCALE_REGISTRY, REGISTERED_LOCALES } from "@/i18n/locale-registry";
import { fold } from "@/core/utils/search-text";
import { fullTextUnits, fullTextUnitTerms } from "./full-text-query";

const STEMMERS = {
  english: englishStemmer,
  german: germanStemmer,
  french: frenchStemmer,
  italian: italianStemmer,
  spanish: spanishStemmer,
} satisfies Record<TextSearchConfig, (word: string) => string>;

const STOPWORDS = {
  english: new Set(englishStopwords),
  german: new Set(germanStopwords),
  french: new Set(frenchStopwords),
  italian: new Set(italianStopwords),
  spanish: new Set(spanishStopwords),
} satisfies Record<TextSearchConfig, ReadonlySet<string>>;

const WORD = /[\p{L}\p{M}\p{N}_]+/gu;
const LETTERS = /^[\p{L}\p{M}]+$/u;
const MAX_CACHED_WORDS = 2_048;
const MAX_CACHED_TEXTS = 128;
const MAX_CACHED_TEXT_CHARS = 4_096;
const MAX_OFFSETS_PER_TERM = 32;

type EvidenceWord = { text: string; start: number };
type EvidenceText = {
  folded: string;
  offsets: number[];
  words: EvidenceWord[];
};
type EvidencePart = {
  literal: RegExp;
  stems: ReadonlyMap<TextSearchConfig, string>;
};

export type RetrievalEvidenceMatcher = {
  units: readonly FullTextUnit[];
  matches: (text: string) => boolean[];
  offsets: (text: string) => number[][];
};

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function createRetrievalEvidenceMatcher(query: string, locale?: LocaleCode): RetrievalEvidenceMatcher {
  const configs: readonly TextSearchConfig[] = [
    ...new Set(REGISTERED_LOCALES.map((code) => LOCALE_REGISTRY[code].textSearchConfig)),
  ];
  const stemCache = new Map<string, string>();
  const textCache = new Map<string, EvidenceText>();
  const stem = (word: string, config: TextSearchConfig): string => {
    const lowered = word.normalize("NFC").toLowerCase();
    const key = `${config}:${lowered}`;
    const cached = stemCache.get(key);
    if (cached !== undefined) return cached;
    const value = fold(STEMMERS[config](lowered));
    if (stemCache.size < MAX_CACHED_WORDS && lowered.length <= MAX_CACHED_TEXT_CHARS) stemCache.set(key, value);
    return value;
  };
  const analyze = (text: string): EvidenceText => {
    const cached = textCache.get(text);
    if (cached) return cached;
    const offsets: number[] = [];
    let rawOffset = 0;
    for (const point of text) {
      for (let index = 0; index < fold(point).length; index += 1) offsets.push(rawOffset);
      rawOffset += point.length;
    }
    const value = {
      folded: fold(text),
      offsets,
      words: [...text.matchAll(WORD)].map((match) => ({
        text: match[0],
        start: match.index,
      })),
    };
    if (textCache.size < MAX_CACHED_TEXTS && text.length <= MAX_CACHED_TEXT_CHARS) textCache.set(text, value);
    return value;
  };
  const original = fullTextUnits(query).filter((unit) => unit.substring || unit.text.length >= 3);
  const stopwords = STOPWORDS[LOCALE_REGISTRY[locale ?? DEFAULT_LOCALE].textSearchConfig];
  const selected = original.filter((unit) => unit.phrase || unit.substring || !stopwords.has(unit.text));
  const units = selected.length > 0 ? selected : original;
  const terms = units.map((unit) =>
    fullTextUnitTerms(unit).map((alternative) =>
      alternative.map(
        (part, index): EvidencePart => ({
          literal: new RegExp(
            unit.substring
              ? escapePattern(fold(part))
              : `(?<![\\p{L}\\p{M}\\p{N}_])${escapePattern(fold(part))}${
                  unit.prefix && index === alternative.length - 1 ? "" : "(?![\\p{L}\\p{M}\\p{N}_])"
                }`,
            "gu",
          ),
          stems: new Map(
            !unit.phrase && !unit.substring && LETTERS.test(part)
              ? configs.map((config) => [config, stem(part, config)])
              : [],
          ),
        }),
      ),
    ),
  );
  const partOffsets = (text: EvidenceText, part: EvidencePart): number[] => {
    const found = new Set<number>();
    part.literal.lastIndex = 0;
    for (const match of text.folded.matchAll(part.literal)) {
      found.add(text.offsets[match.index] ?? 0);
      if (found.size >= MAX_OFFSETS_PER_TERM) break;
    }
    if (part.stems.size > 0) {
      let matchedWords = 0;
      for (const word of text.words) {
        if (!LETTERS.test(word.text)) continue;
        if ([...part.stems].some(([config, value]) => value.length > 0 && stem(word.text, config) === value)) {
          found.add(word.start);
          matchedWords += 1;
        }
        if (matchedWords >= MAX_OFFSETS_PER_TERM) break;
      }
    }
    return [...found].sort((left, right) => left - right).slice(0, MAX_OFFSETS_PER_TERM);
  };
  const offsets = (value: string): number[][] => {
    const text = analyze(value);
    return terms.map((alternatives) => {
      const found = new Set<number>();
      for (const alternative of alternatives) {
        const parts = alternative.map((part) => partOffsets(text, part));
        if (parts.every((part) => part.length > 0)) for (const offset of parts.flat()) found.add(offset);
      }
      return [...found].sort((left, right) => left - right).slice(0, MAX_OFFSETS_PER_TERM);
    });
  };
  return {
    units,
    matches: (text) => offsets(text).map((found) => found.length > 0),
    offsets,
  };
}
