export type DocsRetrievalLocale = string;

export type DocsSection = {
  slug: string;
  source: string;
  pageTitle: string;
  anchor: string;
  headingPath: string[];
  text: string;
  order: number;
};

export type DocsSectionHit = {
  section: DocsSection;
  score: number;
};

const DIACRITICS: Record<string, string> = {
  ä: "a",
  ö: "o",
  ü: "u",
  ß: "ss",
  é: "e",
  è: "e",
  ê: "e",
  à: "a",
  â: "a",
  ç: "c",
  ñ: "n",
  ì: "i",
  ò: "o",
  ù: "u",
  ó: "o",
  í: "i",
  ú: "u",
  á: "a",
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "could",
  "customermates",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "please",
  "should",
  "show",
  "tell",
  "that",
  "the",
  "their",
  "there",
  "this",
  "through",
  "to",
  "walk",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "you",
  "your",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einen",
  "einem",
  "einer",
  "und",
  "oder",
  "ich",
  "wie",
  "was",
  "wo",
  "wann",
  "mit",
  "von",
  "zu",
  "zum",
  "zur",
  "im",
  "in",
  "ist",
  "sind",
  "kann",
  "kannst",
  "mein",
  "meine",
  "meinen",
  "meinem",
  "sie",
  "ihr",
  "ihre",
  "ihren",
  "bitte",
  "mir",
  "mich",
  "es",
  "auf",
  "für",
  "fur",
  "an",
  "bei",
  "nicht",
  "ob",
  "welche",
  "welcher",
  "welches",
  "man",
  "wird",
  "werden",
  "muss",
  "soll",
  "sollte",
  "gibt",
]);

const SYNONYM_GROUPS: string[][] = [
  ["stage", "status", "singleselect", "pipeline", "phase", "stufe"],
  ["message", "messaging", "nachricht", "nachrichten"],
  ["retry", "retries", "redeliver", "resend", "wiederholung", "erneut"],
  ["whatsapp", "telegram", "instagram", "channel", "kanal", "konto", "account", "connected"],
  ["webhook", "webhooks", "hook"],
  ["column", "columns", "field", "fields", "feld", "felder", "spalte", "spalten", "custom"],
  ["deal", "deals", "opportunity", "opportunitat"],
  ["contact", "contacts", "person", "kontakt", "kontakte"],
  ["organization", "organizations", "company", "companies", "organisation", "unternehmen", "firma"],
  ["task", "tasks", "todo", "aufgabe", "aufgaben"],
  ["service", "services", "product", "produkt", "leistung"],
  [
    "credit",
    "credits",
    "guthaben",
    "price",
    "pricing",
    "preis",
    "plan",
    "plans",
    "tarif",
    "subscription",
    "abo",
    "cost",
    "kosten",
  ],
  ["trial", "testphase", "probe", "probezeit"],
  ["currency", "wahrung"],
  ["theme", "dark", "appearance", "darstellung", "erscheinungsbild"],
  ["routine", "routines", "automation", "automate", "routinen"],
  [
    "schedule",
    "scheduled",
    "zeitplan",
    "cron",
    "planen",
    "recurring",
    "wiederkehrend",
    "monday",
    "montag",
    "weekly",
    "daily",
    "wochentlich",
    "taglich",
  ],
  ["board", "kanban"],
  ["drawer", "panel", "seitenleiste"],
  ["key", "keys", "apikey", "schlussel"],
  ["filter", "filters", "operator", "operators", "filtern"],
  ["signature", "hmac", "verify", "signatur", "verifizieren", "verification"],
  ["delete", "remove", "loschen", "entfernen", "deletion"],
  ["import", "csv", "excel", "spreadsheet", "upload", "importieren"],
  ["export", "download", "exportieren"],
  ["invite", "invitation", "einladen", "einladung", "member", "mitglied", "teammitglied", "team"],
  [
    "approval",
    "approve",
    "approvals",
    "confirm",
    "confirmation",
    "freigabe",
    "bestatigen",
    "bestatigung",
    "asks",
    "ask",
    "fragt",
    "genehmigung",
  ],
  ["avatar", "profile", "picture", "photo", "profil", "profilbild"],
  ["tour", "walkthrough", "guide", "fuhrung", "tours"],
  ["search", "suche", "suchen", "find"],
  ["due", "deadline", "fallig", "falligkeit"],
  ["weighted", "forecast", "gewichtet", "prognose"],
  ["email", "mail", "inbox", "posteingang"],
  ["rotate", "rotation", "rotieren"],
  ["revoke", "widerrufen", "invalidate"],
  ["limit", "limits", "rate", "ratenlimit", "throttle"],
  ["audit", "log", "logging", "protokoll"],
  ["self", "hosted", "selfhost", "docker", "compose", "onpremise"],
  ["assistant", "mate", "assistent", "ki", "ai"],
  ["widget", "widgets", "dashboard", "chart", "kpi"],
  ["note", "notes", "notiz", "notizen"],
  ["relation", "relations", "relationship", "relationships", "link", "links", "verknupfung", "beziehung"],
  ["view", "views", "saved", "ansicht", "ansichten", "gespeichert"],
  ["onboarding", "wizard", "einrichtung"],
  ["permission", "permissions", "role", "roles", "rolle", "rollen", "rechte"],
  ["n8n", "zapier", "make", "automation"],
  ["tenant", "tenancy", "mandant", "mandanten", "mandantentrennung", "isolation", "trennung"],
  ["endpoint", "url", "adresse"],
  ["backup", "backups", "sicherung", "restore", "wiederherstellen"],
  ["step", "steps", "schritt", "schritte", "wizard"],
  ["run", "runs", "history", "lauf", "laufe", "verlauf"],
];

import { docsStemmerFor, type DocsStemmer } from "@/i18n/locale-registry";

export type { DocsStemmer } from "@/i18n/locale-registry";

type SuffixRule = { suffix: string; minLength: number; replacement?: string; unless?: string };

const ENGLISH_PLURAL_RULES: SuffixRule[] = [
  { suffix: "ing", minLength: 6 },
  { suffix: "ies", minLength: 5, replacement: "y" },
  { suffix: "ed", minLength: 5 },
  { suffix: "es", minLength: 5, unless: "ses" },
  { suffix: "s", minLength: 4, unless: "ss" },
];

const ENGLISH_DERIVATION_RULES: SuffixRule[] = [{ suffix: "tion", minLength: 6, replacement: "t" }];

const GERMAN_INFLECTION_RULES: SuffixRule[] = [
  { suffix: "ungen", minLength: 8 },
  { suffix: "ung", minLength: 7 },
  { suffix: "en", minLength: 6 },
  { suffix: "er", minLength: 6 },
  { suffix: "e", minLength: 5 },
  { suffix: "s", minLength: 5 },
];

const GERMAN_TRAILING_RULES: SuffixRule[] = [{ suffix: "n", minLength: 5 }];

function hasSuffix(word: string, suffix: string): boolean {
  return word.length >= suffix.length && word.slice(-suffix.length) === suffix;
}

function applyFirstRule(word: string, rules: readonly SuffixRule[]): string {
  for (const rule of rules) {
    if (word.length < rule.minLength || !hasSuffix(word, rule.suffix)) continue;
    if (rule.unless && hasSuffix(word, rule.unless)) continue;
    return `${word.slice(0, -rule.suffix.length)}${rule.replacement ?? ""}`;
  }
  return word;
}

function stemEnglish(token: string): string {
  return applyFirstRule(applyFirstRule(token, ENGLISH_PLURAL_RULES), ENGLISH_DERIVATION_RULES);
}

function stemGerman(token: string): string {
  return applyFirstRule(applyFirstRule(token, GERMAN_INFLECTION_RULES), GERMAN_TRAILING_RULES);
}

export function stem(token: string, stemmer: DocsStemmer = "english"): string {
  return stemmer === "german" ? stemGerman(stemEnglish(token)) : stemEnglish(token);
}

export function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äöüßéèêàâçñìòùóíúá]/g, (char) => DIACRITICS[char] ?? char)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function tokenize(text: string, stemmer: DocsStemmer = "english"): string[] {
  const tokens: string[] = [];
  for (const match of fold(text).matchAll(/[a-z0-9]+/g)) {
    const raw = match[0];
    if (raw.length < 2 || STOP_WORDS.has(raw)) continue;
    tokens.push(stem(raw, stemmer));
  }
  return tokens;
}

export function docsStemmerForLocale(locale: unknown): DocsStemmer {
  return docsStemmerFor(locale);
}

const SYNONYM_INDEXES = new Map<string, Map<string, Set<string>>>();

function synonymIndex(stemmer: DocsStemmer): Map<string, Set<string>> {
  const cached = SYNONYM_INDEXES.get(stemmer);
  if (cached) return cached;
  const index = new Map<string, Set<string>>();
  for (const group of SYNONYM_GROUPS) {
    const stemmed = new Set(group.map((term) => stem(fold(term), stemmer)));
    for (const term of stemmed) {
      const existing = index.get(term) ?? new Set<string>();
      for (const other of stemmed) existing.add(other);
      index.set(term, existing);
    }
  }
  SYNONYM_INDEXES.set(stemmer, index);
  return index;
}

export function expandQueryTokens(
  tokens: readonly string[],
  stemmer: DocsStemmer = "english",
): { primary: string[]; synonyms: string[] } {
  const primary = [...new Set(tokens)];
  const synonyms = new Set<string>();
  const index = synonymIndex(stemmer);
  for (const token of primary)
    for (const other of index.get(token) ?? []) if (!primary.includes(other)) synonyms.add(other);
  return { primary, synonyms: [...synonyms] };
}

export function slugifyHeading(heading: string): string {
  return fold(heading)
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PAIRED_COMPONENTS = /<\/?(Steps|Faq|Tabs|Tab|Callout|Note|Warning|Tip)(\s[^>]*)?>[ \t]*/g;

export function unwrapDocsComponents(markdown: string, expandSnippet: (tool: string) => string): string {
  return markdown
    .replace(/<Step\s+title="([^"]*)"\s*>/g, (_, title: string) => `\n**${title}**\n`)
    .replace(/<FaqItem\s+question="([^"]*)"\s*>/g, (_, question: string) => `\n### ${question}\n`)
    .replace(/<\/(Step|FaqItem)>/g, "\n")
    .replace(
      /<McpInstallSnippet\s+tool="([a-zA-Z]+)"\s*\/>/g,
      (_, tool: string) => `\`\`\`\n${expandSnippet(tool)}\n\`\`\``,
    )
    .replace(/^<[A-Z][A-Za-z]*(\s[^>]*)?\/>[ \t]*$/gm, "")
    .replace(/^\{\/\*[\s\S]*?\*\/\}[ \t]*$/gm, "")
    .replace(PAIRED_COMPONENTS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitSections(args: {
  slug: string;
  source: string;
  pageTitle: string;
  markdown: string;
}): DocsSection[] {
  const lines = args.markdown.split("\n");
  const sections: DocsSection[] = [];
  let path: string[] = [];
  let buffer: string[] = [];
  let anchor = "";
  let inFence = false;
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text.length > 0 || path.length > 0) {
      sections.push({
        slug: args.slug,
        source: args.source,
        pageTitle: args.pageTitle,
        anchor,
        headingPath: [...path],
        text,
        order: sections.length,
      });
    }
    buffer = [];
  };
  for (const line of lines) {
    if (line.startsWith("```")) inFence = !inFence;
    const heading = inFence ? null : /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      const depth = Math.max(0, heading[1].length - 2);
      const title = heading[2].replace(/\s*(?:\{#[^}]+\}|\[#[^\]]+\])\s*$/, "");
      path = [...path.slice(0, depth), title];
      anchor = /(?:\{#([^}]+)\}|\[#([^\]]+)\])\s*$/.exec(heading[2])?.slice(1).find(Boolean) ?? slugifyHeading(title);
      continue;
    }
    buffer.push(line);
  }
  flush();
  const kept = sections.filter((section) => section.text.length > 0 || section.headingPath.length > 0);
  return kept.map((section) => {
    if (section.headingPath.length !== 1 || section.text.length >= ROLLUP_OWN_TEXT_CHARS) return section;
    const children = kept.filter(
      (candidate) => candidate.headingPath.length > 1 && candidate.headingPath[0] === section.headingPath[0],
    );
    if (children.length === 0) return section;
    const rolled = children.map((child) => `### ${child.headingPath.at(-1)}\n${child.text}`.trim()).join("\n\n");
    return { ...section, text: [section.text, rolled].filter(Boolean).join("\n\n") };
  });
}

const ROLLUP_OWN_TEXT_CHARS = 200;

type IndexedSection = DocsSection & {
  linkTokens: string[];
  bodyTokens: string[];
  headingTokens: string[];
  ownHeadingTokens: string[];
  titleTokens: string[];
  bodyLength: number;
  foldedText: string;
  foldedHeading: string;
};

type IndexedPage = { key: string; tokens: string[]; length: number };

export type DocsSectionIndex = {
  stemmer: DocsStemmer;
  sections: IndexedSection[];
  documentFrequency: Map<string, number>;
  averageBodyLength: number;
  pages: Map<string, IndexedPage>;
  pageFrequency: Map<string, number>;
  averagePageLength: number;
};

const LINK_LINE_LABEL = /^\*\*Link:\*\*(.*?)(?:\*\*Mate:\*\*|$)/gm;

export function buildSectionIndex(
  sections: readonly DocsSection[],
  stemmer: DocsStemmer = "english",
): DocsSectionIndex {
  const indexed: IndexedSection[] = sections.map((section) => {
    const headingText = [section.pageTitle, ...section.headingPath].join(" ");
    return {
      ...section,
      linkTokens: [...section.text.matchAll(LINK_LINE_LABEL)].flatMap((match) => tokenize(match[1], stemmer)),
      bodyTokens: tokenize(section.text, stemmer),
      headingTokens: tokenize(section.headingPath.join(" "), stemmer),
      ownHeadingTokens: tokenize(section.headingPath.join(" "), stemmer),
      titleTokens: tokenize(section.pageTitle, stemmer),
      bodyLength: 0,
      foldedText: fold(section.text),
      foldedHeading: fold(headingText),
    };
  });
  const documentFrequency = new Map<string, number>();
  const pages = new Map<string, IndexedPage>();
  let totalLength = 0;
  for (const section of indexed) {
    section.bodyLength = section.bodyTokens.length + section.headingTokens.length;
    totalLength += section.bodyLength;
    for (const token of new Set([...section.bodyTokens, ...section.headingTokens]))
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    const key = `${section.source}:${section.slug}`;
    const page = pages.get(key) ?? { key, tokens: [], length: 0 };
    page.tokens.push(...section.bodyTokens, ...section.headingTokens);
    page.length = page.tokens.length;
    pages.set(key, page);
  }
  const pageFrequency = new Map<string, number>();
  let totalPageLength = 0;
  for (const page of pages.values()) {
    totalPageLength += page.length;
    for (const token of new Set(page.tokens)) pageFrequency.set(token, (pageFrequency.get(token) ?? 0) + 1);
  }
  return {
    stemmer,
    sections: indexed,
    documentFrequency,
    averageBodyLength: indexed.length ? totalLength / indexed.length : 1,
    pages,
    pageFrequency,
    averagePageLength: pages.size ? totalPageLength / pages.size : 1,
  };
}

const K1 = 1.2;

const PAGE_ADDRESS_WORDS = "url urls page pages seite seiten route routes adresse";

export type DocsRetrievalWeights = {
  sectionB: number;
  synonym: number;
  title: number;
  titleOverlap: number;
  headingCoverage: number;
  rarestHeading: number;
  bodyCoverage: number;
  bodyBm25: number;
  secondSection: number;
  untitledFactor: number;
  lengthDamping: number;
};

export const DEFAULT_DOCS_RETRIEVAL_WEIGHTS: DocsRetrievalWeights = {
  sectionB: 0.5,
  synonym: 0.3,
  title: 2,
  titleOverlap: 0.5,
  headingCoverage: 3,
  rarestHeading: 0,
  bodyCoverage: 1.5,
  bodyBm25: 0.4,
  secondSection: 0,
  untitledFactor: 0.85,
  lengthDamping: 0.3,
};

function termFrequency(tokens: readonly string[], term: string): number {
  let count = 0;
  for (const token of tokens) if (token === term) count += 1;
  return count;
}

function idf(total: number, matching: number): number {
  return Math.log(1 + (total - matching + 0.5) / (matching + 0.5));
}

function bm25(frequency: number, idfValue: number, length: number, averageLength: number, b: number): number {
  if (frequency === 0) return 0;
  return (idfValue * (frequency * (K1 + 1))) / (frequency + K1 * (1 - b + (b * length) / averageLength));
}

type QueryTerms = {
  primary: string[];
  synonyms: string[];
  idfByTerm: Map<string, number>;
  queryIdf: number;
  rarest: string | null;
  pageNames: string[];
};

function queryTermsFor(index: DocsSectionIndex, query: string): QueryTerms {
  const { primary, synonyms } = expandQueryTokens(tokenize(query, index.stemmer), index.stemmer);
  const idfByTerm = new Map<string, number>();
  for (const term of [...primary, ...synonyms])
    idfByTerm.set(term, idf(index.sections.length, index.documentFrequency.get(term) ?? 0));
  const queryIdf = primary.reduce((sum, term) => sum + (idfByTerm.get(term) ?? 0), 0);
  const rarest =
    [...primary].sort((left, right) => (idfByTerm.get(right) ?? 0) - (idfByTerm.get(left) ?? 0))[0] ?? null;
  const addressTerms = tokenize(PAGE_ADDRESS_WORDS, index.stemmer);
  const named = primary.filter((term) => !addressTerms.includes(term));
  const pageNames = named.length > 0 && named.length < primary.length ? named : [];
  return { primary, synonyms, idfByTerm, queryIdf, rarest, pageNames };
}

function coverage(
  tokens: readonly string[],
  terms: QueryTerms,
  weights: DocsRetrievalWeights,
  discounted: readonly string[] = [],
): number {
  if (terms.primary.length === 0) return 0;
  let matched = 0;
  let total = 0;
  for (const term of terms.primary) {
    const weight = (terms.idfByTerm.get(term) ?? 0) * (discounted.includes(term) ? weights.titleOverlap : 1);
    total += weight;
    if (tokens.includes(term)) matched += weight;
    else if (terms.synonyms.some((synonym) => tokens.includes(synonym))) matched += weight * weights.synonym;
  }
  return total > 0 ? Math.min(1, matched / total) : 0;
}

function phraseBonus(query: string, foldedHeading: string, foldedText: string): number {
  const phrase = fold(query)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!phrase.includes(" ")) return 0;
  if (foldedHeading.includes(phrase)) return 3;
  return foldedText.includes(phrase) ? 1.5 : 0;
}

export type DocsSectionExplanation = {
  headingCoverage: number;
  bodyCoverage: number;
  rarestInHeading: boolean;
  body: number;
  phrase: number;
  queryIdf: number;
  total: number;
};

function bodyBm25(
  index: DocsSectionIndex,
  section: IndexedSection,
  terms: QueryTerms,
  weights: DocsRetrievalWeights,
): number {
  let body = 0;
  for (const term of terms.primary) {
    body += bm25(
      termFrequency(section.bodyTokens, term) + termFrequency(section.headingTokens, term),
      terms.idfByTerm.get(term) ?? 0,
      section.bodyLength,
      index.averageBodyLength,
      weights.sectionB,
    );
  }
  for (const term of terms.synonyms) {
    body +=
      weights.synonym *
      bm25(
        termFrequency(section.bodyTokens, term),
        terms.idfByTerm.get(term) ?? 0,
        section.bodyLength,
        index.averageBodyLength,
        weights.sectionB,
      );
  }
  return body;
}

export function explainSection(
  index: DocsSectionIndex,
  section: IndexedSection,
  query: string,
  weights: DocsRetrievalWeights = DEFAULT_DOCS_RETRIEVAL_WEIGHTS,
): DocsSectionExplanation {
  const terms = queryTermsFor(index, query);
  if (terms.primary.length === 0) {
    return {
      headingCoverage: 0,
      bodyCoverage: 0,
      rarestInHeading: false,
      body: 0,
      phrase: 0,
      queryIdf: 0,
      total: 0,
    };
  }
  const linkCoverage =
    terms.pageNames.length > 0 ? coverage(section.linkTokens, { ...terms, primary: terms.pageNames }, weights) : 0;
  const headingCoverage = Math.max(
    coverage(section.ownHeadingTokens, terms, weights, section.titleTokens),
    linkCoverage,
  );
  const lengthFactor = Math.min(1, index.averageBodyLength / Math.max(1, section.bodyLength)) ** weights.lengthDamping;
  const bodyCoverage = coverage(section.bodyTokens, terms, weights, section.titleTokens) * lengthFactor;
  const rarestInHeading =
    terms.rarest !== null &&
    !section.titleTokens.includes(terms.rarest) &&
    section.ownHeadingTokens.includes(terms.rarest);
  const body = bodyBm25(index, section, terms, weights);
  const phrase = phraseBonus(query, section.foldedHeading, section.foldedText);
  let total =
    terms.queryIdf *
      (weights.headingCoverage * headingCoverage +
        weights.bodyCoverage * bodyCoverage +
        (rarestInHeading ? weights.rarestHeading : 0)) +
    weights.bodyBm25 * body +
    phrase;
  if (section.headingPath.length === 0) total *= weights.untitledFactor;
  return {
    headingCoverage,
    bodyCoverage,
    rarestInHeading,
    body,
    phrase,
    queryIdf: terms.queryIdf,
    total,
  };
}

export function scoreSection(
  index: DocsSectionIndex,
  section: IndexedSection,
  query: string,
  weights: DocsRetrievalWeights = DEFAULT_DOCS_RETRIEVAL_WEIGHTS,
): number {
  return explainSection(index, section, query, weights).total;
}

export function scorePage(
  index: DocsSectionIndex,
  pageKey: string,
  query: string,
  weights: DocsRetrievalWeights = DEFAULT_DOCS_RETRIEVAL_WEIGHTS,
): number {
  const terms = queryTermsFor(index, query);
  if (terms.primary.length === 0) return 0;
  const own = index.sections.filter((section) => `${section.source}:${section.slug}` === pageKey);
  if (own.length === 0) return 0;
  const scores = own.map((section) => scoreSection(index, section, query, weights)).sort((left, right) => right - left);
  const best = scores[0] ?? 0;
  if (best <= 0) return 0;
  return (
    best +
    weights.secondSection * (scores[1] ?? 0) +
    weights.title * terms.queryIdf * coverage(own[0].titleTokens, terms, weights)
  );
}

export function searchSections(
  index: DocsSectionIndex,
  query: string,
  limit = 8,
  weights: DocsRetrievalWeights = DEFAULT_DOCS_RETRIEVAL_WEIGHTS,
): DocsSectionHit[] {
  const pageScores = [...index.pages.keys()]
    .map((key) => ({ key, score: scorePage(index, key, query, weights) }))
    .filter((page) => page.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
  const hits: DocsSectionHit[] = [];
  for (const page of pageScores) {
    const best = index.sections
      .filter((section) => `${section.source}:${section.slug}` === page.key)
      .map((section) => ({ section, score: scoreSection(index, section, query, weights) }))
      .sort((left, right) => right.score - left.score || left.section.order - right.section.order)[0];
    if (best) hits.push({ section: best.section, score: page.score });
  }
  return hits;
}

export function rankPages(
  hits: readonly DocsSectionHit[],
): { slug: string; source: string; score: number; best: DocsSectionHit }[] {
  return [...hits]
    .sort((left, right) => right.score - left.score)
    .map((hit) => ({ slug: hit.section.slug, source: hit.section.source, score: hit.score, best: hit }));
}

const EXCERPT_LEADING_LINES = 1;

const LINK_LINE = /^\*\*Link:\*\*/;

export function sectionExcerpt(
  section: DocsSection,
  query: string,
  maxChars: number,
  stemmer: DocsStemmer = "english",
  keepLinkLines = false,
): string {
  const heading = section.headingPath.length
    ? `${"#".repeat(Math.min(3, section.headingPath.length + 1))} ${section.headingPath.at(-1)}`
    : "";
  const body = section.text;
  if (heading.length + body.length + 1 <= maxChars) return [heading, body].filter(Boolean).join("\n");
  const lines = body.split("\n");
  const terms = expandQueryTokens(tokenize(query, stemmer), stemmer);
  let bestLine = 0;
  let bestScore = -1;
  const structural = (index: number) =>
    /^\|\s*-/.test(lines[index] ?? "") ||
    (lines[index]?.startsWith("|") === true && /^\|\s*-/.test(lines[index + 1] ?? ""));
  lines.forEach((line, index) => {
    if (structural(index) || (keepLinkLines && LINK_LINE.test(line))) return;
    const tokens = tokenize(line, stemmer);
    let score = 0;
    for (const term of terms.primary) if (tokens.includes(term)) score += 1;
    for (const term of terms.synonyms) if (tokens.includes(term)) score += 0.3;
    if (score > bestScore) {
      bestScore = score;
      bestLine = index;
    }
  });
  let start = bestLine;
  let budget = maxChars - heading.length - 1;
  const tableHeader: string[] = [];
  if (lines[bestLine]?.startsWith("|")) {
    let cursor = bestLine;
    while (cursor > 0 && lines[cursor - 1].startsWith("|")) cursor -= 1;
    if (cursor < bestLine && /^\|\s*-/.test(lines[cursor + 1] ?? ""))
      tableHeader.push(lines[cursor], lines[cursor + 1]);
  }
  for (const line of tableHeader) budget -= line.length + 1;
  const linkLines = keepLinkLines ? lines.filter((line, index) => index !== bestLine && LINK_LINE.test(line)) : [];
  const linkLength = linkLines.reduce((total, line) => total + line.length + 1, 0);
  const keptLinks = linkLines.length > 0 && linkLength < budget ? linkLines : [];
  if (keptLinks.length) budget -= linkLength;
  const picked: string[] = [];
  let end = bestLine;
  while (end < lines.length) {
    if (keptLinks.includes(lines[end])) {
      end += 1;
      continue;
    }
    if (budget - lines[end].length - 1 < 0) {
      if (picked.length === 0 && budget > 2) {
        picked.push(`${lines[end].slice(0, budget - 2)}…`);
        budget = 0;
        end += 1;
      }
      break;
    }
    picked.push(lines[end]);
    budget -= lines[end].length + 1;
    end += 1;
  }
  for (let context = 0; context < EXCERPT_LEADING_LINES && start > 0; context += 1) {
    const previous = lines[start - 1];
    if (budget - previous.length - 1 < 0 || tableHeader.includes(previous) || keptLinks.includes(previous)) break;
    start -= 1;
    picked.unshift(lines[start]);
    budget -= lines[start].length + 1;
  }
  const excerpt = [...tableHeader.filter((line) => !picked.includes(line)), ...picked].join("\n");
  return [heading, start > 0 ? "…" : "", excerpt, end < lines.length ? "…" : "", ...keptLinks]
    .filter(Boolean)
    .join("\n");
}
