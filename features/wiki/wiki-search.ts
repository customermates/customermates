import { fold, slugifyHeading, stem } from "@/features/mcp-tools/docs-retrieval";

import { wikiCodePointBoundary } from "./wiki-page-chunk";
import { WIKI_EXCERPT_MAX_LENGTH, wikiPlainText } from "./wiki-content";

export const WIKI_FUZZY_SIMILARITY = 0.45;
export const WIKI_SEARCH_CONFIGS = ["simple", "english", "german", "spanish", "french", "italian"] as const;
const WIKI_OUTLINE_MAX_ENTRIES = 30;
const WIKI_SECTION_MAX_LENGTH = 160;
const WIKI_SNIPPET_MAX_HIGHLIGHTS = 10;

const WIKI_SUBSTRING_SEARCH_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const QUOTED_PHRASE = /["“”„«»]([^"“”„«»]*)["“”„«»]?/gu;
const QUERY_TOKEN = /[\p{L}\p{N}]+(?:[-_.'’][\p{L}\p{N}]+)*/gu;
const WORD = /[\p{L}\p{N}]+/gu;
const HEADING_LINE = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/u;
const FENCE_LINE = /^[ \t]{0,3}(?:```|~~~)/u;
const WIKI_SEARCH_MAX_UNITS = 32;
const FUZZY_MIN_LENGTH = 4;
const BM25_K1 = 1.2;
const BM25_B = 0.6;

const WIKI_QUERY_FILLER = new Set([
  "a",
  "about",
  "all",
  "also",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "fast",
  "find",
  "for",
  "from",
  "get",
  "gets",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "long",
  "many",
  "me",
  "much",
  "my",
  "need",
  "of",
  "on",
  "or",
  "our",
  "please",
  "say",
  "says",
  "should",
  "show",
  "so",
  "tell",
  "that",
  "the",
  "their",
  "them",
  "there",
  "these",
  "they",
  "this",
  "those",
  "to",
  "us",
  "want",
  "wants",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
  "auf",
  "bei",
  "bekommen",
  "bitte",
  "das",
  "dem",
  "den",
  "der",
  "des",
  "die",
  "ein",
  "eine",
  "einen",
  "es",
  "für",
  "gibt",
  "hat",
  "ich",
  "im",
  "ist",
  "kann",
  "mein",
  "meine",
  "mit",
  "oder",
  "sie",
  "sind",
  "sollte",
  "über",
  "und",
  "unser",
  "unsere",
  "viel",
  "von",
  "wann",
  "warum",
  "was",
  "welche",
  "wie",
  "wir",
  "wird",
  "wo",
  "zu",
  "cómo",
  "con",
  "cuál",
  "cuando",
  "de",
  "del",
  "dónde",
  "el",
  "en",
  "es",
  "la",
  "las",
  "los",
  "mi",
  "nuestro",
  "nuestra",
  "para",
  "por",
  "podría",
  "qué",
  "sobre",
  "son",
  "debería",
  "un",
  "una",
  "y",
  "avec",
  "comment",
  "dans",
  "des",
  "du",
  "est",
  "et",
  "le",
  "les",
  "notre",
  "nous",
  "où",
  "ou",
  "peut",
  "pour",
  "pourquoi",
  "pourrait",
  "quand",
  "quel",
  "quelle",
  "qui",
  "sont",
  "sur",
  "devrait",
  "votre",
  "chi",
  "come",
  "cosa",
  "della",
  "di",
  "dove",
  "dovrebbe",
  "gli",
  "il",
  "lo",
  "mio",
  "nostro",
  "perché",
  "potrebbe",
  "quale",
  "sono",
  "su",
  "uno",
]);

type WikiSearchUnit = { text: string; words: string[]; phrase: boolean };

export type WikiSearchQuery = {
  units: WikiSearchUnit[];
  prefix: string | null;
  substringTerms: string[];
  fuzzyTerms: Array<{ term: string; unit: number }>;
  title: string;
};

type WikiMarkdownSection = {
  level: number;
  path: string[];
  offset: number;
  end: number;
};

type WikiSearchMatch = {
  snippet: string;
  offset: number;
  section?: string;
  anchor?: string;
};

export type WikiOutlineEntry = { level: number; heading: string; offset: number };

function isSubstringScript(value: string): boolean {
  return WIKI_SUBSTRING_SEARCH_SCRIPT.test(value);
}

function boundedTerm(value: string): string {
  return Array.from(value).slice(0, 64).join("");
}

function substringSegments(term: string): string[] {
  const segmenter = new Intl.Segmenter("und", { granularity: "word" });
  const segments = [...segmenter.segment(term)]
    .filter(({ isWordLike }) => isWordLike)
    .map(({ segment }) => segment)
    .filter((segment) => segment !== term && isSubstringScript(segment));
  return [term, ...segments];
}

function selectUnits(units: WikiSearchUnit[]): WikiSearchUnit[] {
  const informative = units.filter((unit) => unit.phrase || Array.from(unit.text).length > 1);
  const signal = informative.filter((unit) => unit.phrase || !WIKI_QUERY_FILLER.has(unit.text));
  const candidates = signal.length > 0 ? signal : informative.length > 0 ? informative : units;
  if (candidates.length <= WIKI_SEARCH_MAX_UNITS) return candidates;

  const coverage = Array.from(
    { length: 16 },
    (_, index) => candidates[Math.round((index * (candidates.length - 1)) / 15)],
  ).filter((unit): unit is WikiSearchUnit => Boolean(unit));
  const distinctive = candidates
    .map((unit, index) => ({ unit, index, length: Array.from(unit.text).length }))
    .sort((left, right) => right.length - left.length || left.index - right.index)
    .map(({ unit }) => unit);
  return [...new Set([...coverage, ...distinctive])].slice(0, WIKI_SEARCH_MAX_UNITS);
}

export function parseWikiSearchQuery(query: string): WikiSearchQuery {
  const lowered = query.toLocaleLowerCase();
  const units: WikiSearchUnit[] = [];
  const seen = new Set<string>();
  const add = (unit: WikiSearchUnit) => {
    if (unit.text.length === 0 || seen.has(unit.text)) return;
    seen.add(unit.text);
    units.push(unit);
  };

  let lastToken: string | null = null;
  let cursor = 0;
  const unquoted: string[] = [];
  for (const match of lowered.matchAll(QUOTED_PHRASE)) {
    unquoted.push(lowered.slice(cursor, match.index));
    cursor = (match.index ?? 0) + match[0].length;
    const words = (match[1].match(QUERY_TOKEN) ?? []).map(boundedTerm);
    if (words.length > 1) add({ text: words.join(" "), words, phrase: true });
    else if (words.length === 1) add({ text: words[0], words, phrase: false });
  }
  unquoted.push(lowered.slice(cursor));
  const rest = unquoted.join(" ");
  for (const match of rest.matchAll(QUERY_TOKEN)) {
    const token = boundedTerm(match[0]);
    add({ text: token, words: token.match(WORD) ?? [token], phrase: false });
    lastToken = token;
  }

  const substringTerms = [
    ...new Set(
      units
        .flatMap((unit) => unit.words)
        .filter(isSubstringScript)
        .flatMap(substringSegments),
    ),
  ];
  const selected = selectUnits(units.filter((unit) => !unit.words.some(isSubstringScript)));
  const prefix =
    lastToken &&
    lowered.trimEnd().endsWith(lastToken) &&
    /^[\p{L}\p{N}]{2,}$/u.test(lastToken) &&
    !isSubstringScript(lastToken) &&
    selected.some((unit) => unit.text === lastToken)
      ? lastToken
      : null;
  const fuzzyTerms = selected.flatMap((unit, index) =>
    !unit.phrase &&
    unit.words.length === 1 &&
    Array.from(unit.text).length >= FUZZY_MIN_LENGTH &&
    !/\p{N}/u.test(unit.text)
      ? [{ term: unit.text, unit: index + 1 }]
      : [],
  );
  return {
    units: selected,
    prefix,
    substringTerms,
    fuzzyTerms,
    title: (lowered.match(QUERY_TOKEN) ?? []).join(" "),
  };
}

function boundedText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, wikiCodePointBoundary(value, maxLength - 1)).trimEnd()}…`;
}

function headingText(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/[*_`~]/gu, "")
    .replace(/\\(.)/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

export function wikiMarkdownSections(markdown: string): WikiMarkdownSection[] {
  const sections: WikiMarkdownSection[] = [];
  const stack: Array<{ level: number; heading: string }> = [];
  let current: WikiMarkdownSection = { level: 0, path: [], offset: 0, end: markdown.length };
  let offset = 0;
  let inFence = false;
  for (const line of markdown.split("\n")) {
    const heading = inFence ? null : HEADING_LINE.exec(line);
    if (FENCE_LINE.test(line)) inFence = !inFence;
    if (heading) {
      const level = heading[1].length;
      const text = headingText(heading[2]);
      if (offset > current.offset || current.level > 0) sections.push({ ...current, end: offset });
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, heading: text });
      current = { level, path: stack.map((entry) => entry.heading), offset, end: markdown.length };
    }
    offset += line.length + 1;
  }
  sections.push({ ...current, end: markdown.length });
  return sections.filter((section) => section.level > 0 || markdown.slice(section.offset, section.end).trim());
}

export function wikiOutline(markdown: string): WikiOutlineEntry[] {
  return wikiMarkdownSections(markdown)
    .filter((section) => section.level >= 1 && section.level <= 3)
    .slice(0, WIKI_OUTLINE_MAX_ENTRIES)
    .map((section) => ({
      level: section.level,
      heading: boundedText(section.path.at(-1) ?? "", WIKI_SECTION_MAX_LENGTH),
      offset: section.offset,
    }));
}

function foldedWords(text: string): string[] {
  return fold(text).match(WORD) ?? [];
}

function commonPrefixLength(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[index] === right[index]) index += 1;
  return index;
}

function trigrams(word: string): Set<string> {
  const padded = `  ${word} `;
  const grams = new Set<string>();
  for (let index = 0; index + 3 <= padded.length; index += 1) grams.add(padded.slice(index, index + 3));
  return grams;
}

function trigramSimilarity(left: string, right: string): number {
  const leftGrams = trigrams(left);
  const rightGrams = trigrams(right);
  let shared = 0;
  for (const gram of leftGrams) if (rightGrams.has(gram)) shared += 1;
  return shared / (leftGrams.size + rightGrams.size - shared);
}

export function wikiSortedLetters(word: string): string {
  return Array.from(word).sort().join("");
}

function isFuzzyMatch(queryWord: string, word: string): boolean {
  if (word[0] !== queryWord[0] || Math.abs(word.length - queryWord.length) > 2) return false;
  if (trigramSimilarity(queryWord, word) >= WIKI_FUZZY_SIMILARITY) return true;
  return (
    word.length === queryWord.length && word.length >= 5 && wikiSortedLetters(word) === wikiSortedLetters(queryWord)
  );
}

type ScoredSection = WikiMarkdownSection & { words: string[]; headingWords: string[]; folded: string };

function termVariants(queryWords: string[], vocabulary: Set<string>): Map<string, Set<string>> {
  const entries = [...vocabulary].map((word) => ({
    word,
    english: stem(word, "english"),
    german: stem(word, "german"),
  }));
  const variants = new Map<string, Set<string>>();
  for (const queryWord of queryWords) {
    const literal = /\p{N}/u.test(queryWord) || queryWord.length < 3;
    const english = stem(queryWord, "english");
    const german = stem(queryWord, "german");
    const matches = new Set(
      entries
        .filter(
          (entry) =>
            entry.word === queryWord ||
            (!literal &&
              entry.word.length >= 3 &&
              (entry.english === english ||
                entry.german === german ||
                commonPrefixLength(queryWord, entry.word) >=
                  Math.max(5, Math.max(queryWord.length, entry.word.length) - 3))),
        )
        .map((entry) => entry.word),
    );
    if (matches.size === 0 && queryWord.length >= FUZZY_MIN_LENGTH && !literal)
      for (const { word } of entries) if (isFuzzyMatch(queryWord, word)) matches.add(word);
    variants.set(queryWord, matches);
  }
  return variants;
}

function bestSection(
  markdown: string,
  query: WikiSearchQuery,
): { section: ScoredSection; variants: Map<string, Set<string>> } {
  const sections: ScoredSection[] = wikiMarkdownSections(markdown).map((section) => {
    const text = markdown.slice(section.offset, section.end);
    return {
      ...section,
      words: foldedWords(text),
      headingWords: foldedWords(section.path.join(" ")),
      folded: fold(text).replace(/\s+/gu, " "),
    };
  });
  const queryWords = [...new Set(query.units.flatMap((unit) => unit.words).map((word) => fold(word)))];
  const vocabulary = new Set(sections.flatMap((section) => [...section.words, ...section.headingWords]));
  const variants = termVariants(queryWords, vocabulary);
  const averageLength = sections.reduce((sum, section) => sum + section.words.length, 0) / sections.length || 1;
  const documentFrequency = (word: string) =>
    sections.filter((section) => section.words.some((token) => variants.get(word)?.has(token))).length;
  const idf = new Map(
    queryWords.map((word) => {
      const frequency = documentFrequency(word);
      return [word, Math.log(1 + (sections.length - frequency + 0.5) / (frequency + 0.5))];
    }),
  );

  let best = sections[0];
  let bestScore = 0;
  for (const section of sections) {
    let score = 0;
    let covered = 0;
    for (const word of queryWords) {
      const accepted = variants.get(word) ?? new Set<string>();
      const frequency = section.words.filter((token) => accepted.has(token)).length;
      const weight = idf.get(word) ?? 0;
      if (frequency > 0) {
        covered += 1;
        score +=
          (weight * frequency * (BM25_K1 + 1)) /
          (frequency + BM25_K1 * (1 - BM25_B + (BM25_B * section.words.length) / averageLength));
      }
      if (section.headingWords.some((token) => accepted.has(token))) score += weight;
    }
    for (const unit of query.units) {
      if (unit.phrase && section.folded.includes(fold(unit.text)))
        score += unit.words.reduce((sum, word) => sum + (idf.get(fold(word)) ?? 0), 0);
    }
    for (const term of query.substringTerms) if (section.folded.includes(term)) score += 1;
    score *= 1 + covered / Math.max(1, queryWords.length);
    if (score > bestScore) {
      best = section;
      bestScore = score;
    }
  }
  return { section: best, variants };
}

function highlightedSnippet(text: string, isMatch: (word: string) => boolean, substringTerms: string[]): string {
  const compact = text.replace(/\s+/gu, " ").trim();
  const positions: Array<{ start: number; end: number; key: string }> = [];
  for (const match of compact.matchAll(WORD)) {
    const folded = fold(match[0]);
    if (isMatch(folded))
      positions.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, key: folded });
  }
  const lowered = compact.toLocaleLowerCase();
  for (const term of substringTerms) {
    const index = lowered.indexOf(term);
    if (index >= 0) positions.push({ start: index, end: index + term.length, key: term });
  }
  positions.sort((left, right) => left.start - right.start);

  let anchor = positions[0]?.start ?? 0;
  let bestDistinct = 0;
  for (const position of positions) {
    const windowEnd = position.start + WIKI_EXCERPT_MAX_LENGTH - 40;
    const distinct = new Set(
      positions.filter((other) => other.start >= position.start && other.end <= windowEnd).map((other) => other.key),
    ).size;
    if (distinct > bestDistinct) {
      bestDistinct = distinct;
      anchor = position.start;
    }
  }

  const rawStart = positions.length === 0 ? 0 : Math.max(0, anchor - 60);
  const space = rawStart > 0 ? compact.indexOf(" ", rawStart - 1) : -1;
  const start = space >= 0 && space < anchor ? space + 1 : wikiCodePointBoundary(compact, rawStart);
  const prefix = start > 0 ? "…" : "";
  const suffix = compact.length - start > WIKI_EXCERPT_MAX_LENGTH - prefix.length ? "…" : "";
  const rawEnd = Math.min(compact.length, start + WIKI_EXCERPT_MAX_LENGTH - prefix.length - suffix.length);
  const lastSpace = rawEnd < compact.length ? compact.lastIndexOf(" ", rawEnd) : -1;
  const end = lastSpace > start + WIKI_EXCERPT_MAX_LENGTH / 2 ? lastSpace : wikiCodePointBoundary(compact, rawEnd);
  let snippet = "";
  let cursor = start;
  let highlights = 0;
  for (const position of positions) {
    if (position.start < cursor || position.end > end || highlights >= WIKI_SNIPPET_MAX_HIGHLIGHTS) continue;
    highlights += 1;
    snippet += `${compact.slice(cursor, position.start)}**${compact.slice(position.start, position.end)}**`;
    cursor = position.end;
  }
  return `${prefix}${snippet}${compact.slice(cursor, end)}${suffix}`;
}

export function wikiSearchMatch(markdown: string, query: WikiSearchQuery): WikiSearchMatch {
  if (!markdown.trim()) return { snippet: "", offset: 0 };
  const { section, variants } = bestSection(markdown, query);
  const accepted = new Set([...variants.values()].flatMap((words) => [...words]));
  const body = markdown.slice(section.offset, section.end);
  const bodyWithoutHeading = section.level > 0 ? body.slice(body.indexOf("\n") + 1) : body;
  const plain = wikiPlainText(bodyWithoutHeading) || section.path.at(-1) || "";
  const snippet = highlightedSnippet(plain, (word) => accepted.has(word), query.substringTerms);
  if (section.level === 0) return { snippet, offset: section.offset };
  return {
    snippet,
    offset: section.offset,
    section: boundedText(section.path.join(" > "), WIKI_SECTION_MAX_LENGTH),
    anchor: slugifyHeading(section.path.at(-1) ?? ""),
  };
}

export function wikiSectionOffsetIn(sourceMarkdown: string, sourceOffset: number, targetMarkdown: string): number {
  if (sourceOffset === 0) return 0;
  const index = wikiMarkdownSections(sourceMarkdown).findIndex((section) => section.offset === sourceOffset);
  const target = index >= 0 ? wikiMarkdownSections(targetMarkdown)[index] : undefined;
  return target?.offset ?? 0;
}
