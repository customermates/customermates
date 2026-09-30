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
  "aus",
  "sich",
  "uber",
  "hat",
  "haben",
  "habe",
  "auch",
  "noch",
  "wenn",
  "dann",
  "als",
  "um",
  "bis",
  "durch",
  "dieser",
  "diese",
  "dieses",
  "diesem",
  "diesen",
  "meiner",
  "meines",
  "dein",
  "deine",
  "deinen",
  "deinem",
  "deiner",
  "unser",
  "unsere",
  "wir",
  "du",
  "er",
  "darf",
  "durfen",
  "konnen",
  "mussen",
  "sollen",
  "mochte",
  "wurde",
  "war",
  "seine",
  "seinen",
  "seinem",
  "seiner",
  "between",
  "zwischen",
  "much",
  "many",
  "viel",
  "viele",
  "during",
  "dass",
  "dafur",
]);

const SYNONYM_GROUPS: string[][] = [
  ["stage", "status", "singleselect", "pipeline", "phase", "stufe"],
  ["message", "messaging", "nachricht", "nachrichten"],
  ["retry", "retries", "redeliver", "resend", "wiederholung", "erneut"],
  ["whatsapp", "telegram", "instagram", "linkedin", "gmail", "outlook", "channel", "kanal", "konto", "account"],
  ["webhook", "webhooks", "hook"],
  ["delivery", "deliveries", "zustellung", "zustellungen"],
  ["column", "columns", "field", "fields", "feld", "felder", "spalte", "spalten", "custom", "benutzerdefiniert"],
  ["deal", "deals", "opportunity", "opportunitat"],
  ["contact", "contacts", "person", "kontakt", "kontakte"],
  ["organization", "organizations", "company", "companies", "organisation", "unternehmen", "firma"],
  ["task", "tasks", "todo", "aufgabe", "aufgaben"],
  ["service", "services", "product", "produkt", "leistung"],
  ["credit", "credits", "guthaben"],
  ["price", "prices", "pricing", "preis", "preise", "cost", "costs", "kosten", "kostet"],
  ["plan", "plans", "tarif", "tarife", "subscription", "abo"],
  ["trial", "testphase", "probe", "probezeit"],
  ["currency", "wahrung"],
  ["theme", "dark", "appearance", "darstellung", "erscheinungsbild"],
  [
    "routine",
    "routines",
    "automation",
    "automate",
    "automatic",
    "automatically",
    "routinen",
    "automatisch",
    "automatisiert",
    "automatisierung",
  ],
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
  ["key", "keys", "apikey"],
  ["filter", "filters", "operator", "operators", "filtern"],
  ["signature", "hmac", "verify", "signatur", "verifizieren", "verification"],
  ["delete", "remove", "loschen", "entfernen", "deletion"],
  ["import", "csv", "excel", "spreadsheet", "upload", "importieren"],
  ["export", "download", "exportieren"],
  [
    "invite",
    "invitation",
    "einladen",
    "einladung",
    "member",
    "mitglied",
    "teammitglied",
    "team",
    "teammate",
    "teammates",
  ],
  [
    "user",
    "users",
    "member",
    "members",
    "teammate",
    "teammates",
    "nutzer",
    "benutzer",
    "mitglied",
    "mitglieder",
    "teammitglied",
  ],
  ["share", "shared", "sharing", "teilen", "geteilt", "teilt"],
  ["billing", "subscription", "subscriptions", "abonnement", "abo", "abrechnung"],
  [
    "pay",
    "paid",
    "payment",
    "payments",
    "bill",
    "billed",
    "billing",
    "zahlen",
    "bezahlen",
    "zahlung",
    "abrechnen",
    "abgerechnet",
  ],
  [
    "end",
    "ends",
    "ended",
    "expire",
    "expires",
    "expired",
    "expiry",
    "expiration",
    "enden",
    "endet",
    "ablaufen",
    "ablauft",
    "abgelaufen",
  ],
  ["restrict", "restricts", "restricted", "restriction", "beschranken"],
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
    "genehmigen",
  ],
  ["avatar", "picture", "photo", "profilbild"],
  ["tour", "walkthrough", "guide", "fuhrung", "tours"],
  ["search", "suche", "suchen", "find"],
  ["due", "deadline", "fallig", "falligkeit"],
  ["weighted", "forecast", "gewichtet", "prognose"],
  ["email", "mail", "inbox", "posteingang", "mailbox", "postfach"],
  ["rotate", "rotation", "rotieren"],
  ["revoke", "widerrufen", "invalidate"],
  ["limit", "limits", "rate", "ratenlimit", "throttle"],
  ["audit", "log", "logging", "protokoll", "changelog", "anderungsverlauf", "anderungsprotokoll"],
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
  ["conversation", "conversations", "thread", "threads", "konversation", "konversationen"],
];

const NARROWING_SYNONYMS: readonly [string[], string[]][] = [
  [
    ["message", "messages", "nachricht", "nachrichten", "unterhaltung", "unterhaltungen"],
    ["conversation", "conversations", "konversation", "konversationen"],
  ],
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
  { suffix: "tionen", minLength: 8, replacement: "t" },
  { suffix: "ungen", minLength: 8 },
  { suffix: "ung", minLength: 7 },
  { suffix: "en", minLength: 6 },
  { suffix: "er", minLength: 6 },
  { suffix: "e", minLength: 5 },
  { suffix: "s", minLength: 5 },
];

const GERMAN_TRAILING_RULES: SuffixRule[] = [
  { suffix: "n", minLength: 5 },
  { suffix: "s", minLength: 5, unless: "ss" },
];

const GERMAN_LOANWORD_RULES: SuffixRule[] = ENGLISH_PLURAL_RULES.map((rule) =>
  rule.suffix === "ed" ? { ...rule, unless: "ied" } : rule,
);

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

function stemGermanLoanword(token: string): string {
  return applyFirstRule(applyFirstRule(token, GERMAN_LOANWORD_RULES), ENGLISH_DERIVATION_RULES);
}

export function stem(token: string, stemmer: DocsStemmer = "english"): string {
  return stemmer === "german" ? stemGerman(stemGermanLoanword(token)) : stemEnglish(token);
}

export function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äöüßéèêàâçñìòùóíúá]/g, (char) => DIACRITICS[char] ?? char)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const EQUIVALENT_WORDS: readonly string[][] = [
  [
    "anlegen",
    "anlege",
    "anlegt",
    "angelegt",
    "erstellen",
    "erstelle",
    "erstellt",
    "erstellte",
    "erstellten",
    "einrichten",
    "eingerichtet",
    "hinzufugen",
    "hinzufuge",
    "hinzufugt",
    "hinzugefugt",
    "erzeugen",
    "erzeuge",
    "erzeugt",
  ],
  ["key", "schlussel", "schlussels", "schlusseln"],
  [
    "beschranken",
    "beschrankt",
    "beschrankte",
    "beschrankten",
    "beschrankung",
    "einschranken",
    "eingeschrankt",
    "eingeschrankte",
    "eingeschrankten",
    "einschrankung",
    "schrankt",
    "schranken",
  ],
  ["kosten", "kostet"],
  ["billed", "charged"],
  ["ablaufen", "ablauft", "abgelaufen"],
];

const PHRASE_EQUIVALENTS: readonly [RegExp, string | Record<DocsStemmer, string>][] = [
  [/\b(whatsapp|telegram|instagram|linkedin) chats?\b/g, { english: "$1 conversation", german: "$1 konversation" }],
  [/\b(?:lege|legst|legt|legen)((?: (?!fest\b)[a-z0-9]+){0,10}?) an\b/g, "anlegen$1"],
  [/\b(?:richte|richtest|richtet|richten)((?: (?!sich\b)[a-z0-9]+){0,10}?) ein\b/g, "einrichten$1"],
  [/\b(?:fuge|fugst|fugt|fugen)((?: [a-z0-9]+){0,10}?) hinzu\b/g, "hinzufugen$1"],
  [/\b(?:automatisch lauft|lauft automatisch)\b/g, "automatisch"],
  [/\b(?:set|sets|setting) up (a|an|new)\b/g, "create $1"],
  [/\b(?:lauft|laufen)((?: [a-z0-9]+){0,6}?) ab\b/g, "ablaufen$1"],
  [/\be (mails?)\b/g, { english: "e$1", german: "e $1" }],
  [/\bmcp servers?\b/g, "mcp"],
  [/\bcustom fields?\b/g, "custom column"],
  [/\bbenutzerdefinierte[mnrs]? (?:feld|felder|feldern)\b/g, "custom column"],
  [/\bselfhost(?:ed|ing)?\b/g, "self host"],
  [/\bon\s*prem(?:ise|ises)?\b/g, "self host"],
  [/\b(?:own|private|dedicated)\s+(?:servers?|infrastructure|hardware|machines?|vps)\b/g, "self host"],
  [/\bon\s+(?:a|my|our|your)\s+(?:linux\s+|virtual\s+)?(?:servers?|vps)\b/g, "self host"],
  [/\beigene[mnrs]?\s+(?:servern?|infrastruktur|hardware)\b/g, "self host"],
  [/\bauf\s+(?:einem|meinem|unserem|ihrem)\s+server\b/g, "self host"],
  [/\bselbst\s+(?:hosten|gehostet|betreiben|betrieben|installieren|installiert)\b/g, "self host"],
];

const GERMAN_PAGE_COMPOUND = /^([a-z]{3,})(seiten?)$/;

function normalizedWords(text: string, stemmer: DocsStemmer): string[] {
  let folded = fold(text).replace(/[^a-z0-9]+/g, " ");
  for (const [pattern, replacement] of PHRASE_EQUIVALENTS)
    folded = folded.replace(pattern, typeof replacement === "string" ? replacement : replacement[stemmer]);
  const words = folded.split(" ").filter((word) => word.length > 0);
  if (stemmer !== "german") return words;
  return words.flatMap((word) => GERMAN_PAGE_COMPOUND.exec(word)?.slice(1) ?? [word]);
}

const CANONICAL_WORDS = new Map(EQUIVALENT_WORDS.flatMap(([first, ...rest]) => rest.map((word) => [word, first])));

function term(word: string, stemmer: DocsStemmer): string {
  return stem(CANONICAL_WORDS.get(word) ?? word, stemmer);
}

export function tokenize(text: string, stemmer: DocsStemmer = "english"): string[] {
  const tokens: string[] = [];
  for (const raw of normalizedWords(text, stemmer)) {
    if (raw.length < 2 || STOP_WORDS.has(raw)) continue;
    tokens.push(term(raw, stemmer));
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
  const terms = (words: readonly string[]) => new Set(words.map((word) => term(fold(word), stemmer)));
  for (const group of SYNONYM_GROUPS) {
    const stemmed = terms(group);
    for (const term of stemmed) {
      const existing = index.get(term) ?? new Set<string>();
      for (const other of stemmed) existing.add(other);
      index.set(term, existing);
    }
  }
  for (const [words, wider] of NARROWING_SYNONYMS) {
    const answers = terms(wider);
    for (const term of terms(words)) {
      const existing = index.get(term) ?? new Set<string>([term]);
      for (const other of answers) existing.add(other);
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
  linkNames: LinkPageName[];
  bodyTokens: string[];
  proseTokens: string[];
  headingTokens: string[];
  ownHeadingTokens: string[];
  lastHeadingTokens: string[];
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

type LinkPageName = { tokens: string[]; kind: "introduced" | "named" | "route" };

function linkPageNames(label: string, stemmer: DocsStemmer): LinkPageName[] {
  const lead = tokenize(label.split("`")[0].replace(/\*\*/g, " "), stemmer);
  const introduced = lead.includes("link");
  const names: LinkPageName[] = [
    { tokens: lead, kind: introduced ? "introduced" : "named" },
    ...[...label.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => ({
      tokens: tokenize(match[1], stemmer),
      kind: introduced ? ("introduced" as const) : ("named" as const),
    })),
  ];
  for (const [, route] of label.matchAll(/`(\/[^`\s?]*)[^`]*`/g)) {
    const segments = route.split("/").filter((segment) => segment.length > 0 && !segment.startsWith("<"));
    const kind = introduced ? ("introduced" as const) : ("route" as const);
    names.push(
      { tokens: tokenize(segments.join(" "), stemmer), kind },
      { tokens: tokenize(segments.at(-1) ?? "", stemmer), kind },
    );
  }
  return names.filter((name) => name.tokens.length > 0);
}

export function buildSectionIndex(
  sections: readonly DocsSection[],
  stemmer: DocsStemmer = "english",
): DocsSectionIndex {
  const indexed: IndexedSection[] = sections.map((section) => {
    const headingText = [section.pageTitle, ...section.headingPath].join(" ");
    return {
      ...section,
      linkNames: [...section.text.matchAll(LINK_LINE_LABEL)].flatMap((match) => linkPageNames(match[1], stemmer)),
      bodyTokens: tokenize(section.text, stemmer),
      proseTokens: tokenize(section.text.replace(LINK_LINE_LABEL, " "), stemmer),
      headingTokens: tokenize(section.headingPath.join(" "), stemmer),
      ownHeadingTokens: tokenize(section.headingPath.join(" "), stemmer),
      lastHeadingTokens: tokenize(section.headingPath.at(-1) ?? "", stemmer),
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

const PAGE_ADDRESS_WORDS = "url urls page pages seite seiten route routes adresse link links";

const PAGE_KIND_WORDS = "list lists liste listen listenseite screen tab";

const LOCATION_VERBS =
  "find finde finden locate open offne offnen go gehe navigate navigiere give gib get see sehe reach erreiche";

const ATTRIBUTE_ADDRESS = /[\p{L}\d]+-(?:urls?|adressen?|address(?:es)?)\b/giu;

const ADDRESS_NOUNS = new Set(["url", "urls", "route", "routes", "page", "pages", "seite", "seiten", "adresse"]);

const ATTRIBUTE_ADDRESS_NOUNS = new Set(["url", "urls", "adresse"]);

const INDEFINITE_ARTICLES = new Set(["a", "an", "ein", "eine", "einer", "eines", "einem", "einen"]);

const PAGE_NOUN_COMPOUND = /(?:seite|seiten|liste|listen)$/;

const RECORD_TYPE_WORDS: readonly [string, RegExp][] = [
  ["contact", /^(?:contacts?|kontakt\w*)$/],
  ["organization", /^(?:organi[sz]ations?|organisation\w*)$/],
  ["deal", /^deals?$/],
  ["service", /^(?:services?|dienstleistung\w*)$/],
  ["task", /^(?:tasks?|aufgabe\w*)$/],
];

const LOCATION_QUESTION =
  /\bwhere\s+(?:s|is|are)\b|\bwhere\s+(?:can|do|would|could|should)\s+(?:i|we|you)\s+(?:find|see|open|reach|locate)\b|\b(?:go|navigate|take me|get)\s+to\b|\bwo\s+(?:ist|sind|finde|finden|sehe|sehen|steht|stehen|liegt|liegen)\b|\bwohin\b|\bgehe?\s+(?:zu|zur|zum)\b|\bnavigiere\b/;

const LINK_NOUN =
  /\blinks?\s+(?:to|for|of|zu|zur|zum|fur|auf)\b|\b(?:the|a|direct|die|der|den|dem|einen|einem)\s+links?\b|\blinks?\W*$/;

const RELATION_LINK =
  /\blinks?\s+(?:between|zwischen|from|von)\b|\blinks?\s+(?:to|for|zu|fur|auf)\s+(?:a|an|ein|eine|einer|einen|einem)\b/;

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
  pageLink: number;
  namedLink: number;
  routeLink: number;
  inheritedHeading: number;
  inheritedTopic: number;
  tokenPhrase: number;
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
  pageLink: 2,
  namedLink: 0.75,
  routeLink: 0.5,
  inheritedHeading: 0.7,
  inheritedTopic: 0.8,
  tokenPhrase: 1.5,
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
  synonymsOf: Map<string, string[]>;
  idfByTerm: Map<string, number>;
  queryIdf: number;
  rarest: string | null;
  pageNames: string[];
  addressTerms: string[];
  concepts: string[];
  asked: string[];
};

function isPageNoun(word: string): boolean {
  return PAGE_WORDS.has(word) || PAGE_NOUN_COMPOUND.test(word);
}

const PAGE_WORDS = new Set(
  `${PAGE_ADDRESS_WORDS} ${PAGE_KIND_WORDS}`.split(" ").filter((word) => word !== "link" && word !== "links"),
);

const NAVIGATION_WORDS = new Set(LOCATION_VERBS.split(" "));

function pageAddressNoun(word: string, index: number, words: readonly string[]): boolean {
  if (!ADDRESS_NOUNS.has(word)) return false;
  if (!ATTRIBUTE_ADDRESS_NOUNS.has(word)) return true;
  const before = words[index - 1];
  const compound =
    before !== undefined && !STOP_WORDS.has(before) && !NAVIGATION_WORDS.has(before) && !isPageNoun(before);
  const after = words[index + 1] === "of" || words[index + 1] === "von" ? words[index + 2] : words[index + 1];
  return !compound && !INDEFINITE_ARTICLES.has(after ?? "");
}

function relationLink(folded: string, words: readonly string[]): boolean {
  if (RELATION_LINK.test(folded)) return true;
  const types = new Set(
    words.flatMap((word) => RECORD_TYPE_WORDS.filter(([, pattern]) => pattern.test(word)).map(([type]) => type)),
  );
  return types.size >= 2 && !words.some(isPageNoun);
}

type QueryConcept = {
  when: (folded: string, content: readonly string[], stemmer: DocsStemmer) => boolean;
  add: Record<DocsStemmer, string>;
};

const PRICE_WORDS =
  "cost price pricing priced expensive cheap cheaper fee pay paid kosten preis teuer gunstig gebuhr zahlen zahle bezahlen";

const PRICE_CONTEXT_WORDS = [
  "per pro user seat month monthly year yearly annual annually",
  "nutzer nutzerplatz platz monat monatlich jahr jahrlich hoch",
  "plan tarif starter business enterprise crm workspace team euro eur cloud version",
  "license lizenz subscription abo abonnement software app we our us",
].join(" ");

const PRICE_AMOUNT_QUESTION = /\bhow much\b|\bwie (?:viel|hoch)\b/;

const STEMMED_WORD_SETS = new Map<string, Set<string>>();

function stemmedWords(words: string, stemmer: DocsStemmer): Set<string> {
  const key = `${stemmer}:${words}`;
  const cached = STEMMED_WORD_SETS.get(key);
  if (cached) return cached;
  const set = new Set(tokenize(words, stemmer));
  STEMMED_WORD_SETS.set(key, set);
  return set;
}

const BILLING_VERB =
  /\b(?:pay|pays|paid|paying|billed|charged|zahle|zahlen|bezahle|bezahlen|berechnet|abgerechnet|verrechnet)\b/;

const SEAT_WORD = /\b(?:users?|members?|seats?|teammates?|nutzer\w*|benutzer\w*|mitglied\w*|platz\w*)\b/;

const OWN_RECORDS_ONLY =
  /\bonly\b(?: \w+){0,4} (?:their|his|her|my|your|our) own\b|\bonly\b(?: \w+){0,4} assigned\b|\bnur (?:\w+ ){0,2}(?:eigene[nmrs]?|zugewiesene[nmrs]?)\b/;

const RESTRICT_WORD = /\b(?:restrict\w*|beschrank\w*|einschrank\w*|eingeschrank\w*)\b/;

const VISIBILITY_WORD =
  /\b(?:roles?|rolle\w*|access|zugriff\w*|rights?|rechte\w*|see|sees|sehen|sieht|records?|datensatz\w*)\b/;

const CREDENTIAL_WORD = /\b(?:api|keys?|tokens?|webhooks?)\b/;

const MESSAGING_PROVIDER = /\b(?:linkedin|whatsapp|telegram|instagram|gmail|outlook)\b/;

const MESSAGE_WORD =
  /\b(?:messages?|chats?|dms?|conversations?|threads?|emails?|mails?|nachrichten?|unterhaltungen?|konversationen?)\b/;

const CHANNEL_SETUP_OR_RATE =
  /\b(?:connect\w*|verbind\w*|limits?|rate|folders?|ordner|daily|hourly|taglich|stundlich)\b|\b(?:per|pro) (?:day|hour|week|minute|tag|stunde|woche)\b/;

const CONNECT_WORD = /\bconnect\w*/;

const EMAIL_WORD = /\b(?:emails?|mailbox\w*|inbox\w*|imap)\b/;

const CHANNEL_STATUS_LABEL = /\b(?:reconnect needed|erneute verbindung notig)\b/;

const CHANNEL_TROUBLE =
  /\b(?:reconnect\w*|permission issues?|berechtigungsproblem\w*|error|fehler|stopped|gestoppt|disconnected|getrennt)\b|\b(?:stopped|not|isn t|nicht mehr) (?:sync\w*|synchronis\w*)\b/;

const CHANNEL_NOUN = /\b(?:channels?|kanal|kanale|kanals)\b/;

const ASSISTANT_WORD = /\b(?:mate|assistant|assistent\w*)\b/;

const TOOL_LIST_QUESTION =
  /\b(?:which|what|welche) (?:\w+ )?tools\b.*\b(?:mcp|server|provides?|provided|offers?|offered|exposes?|exposed|available|exist|bietet|gibt|verfugbar)\b|\b(?:list|all|alle|liste) (?:of |der )?(?:the )?(?:mcp )?tools\b|\bwhat can (?:the )?(?:mcp(?: server)?|server) do\b|\bwas kann (?:der )?(?:mcp(?: server)?|server)\b/;

const SORT_WORD = /\bsort(?:s|ed|ing)?\b|\bsortier\w*/;

const SORT_CRITERION = /\b(?:by|nach|alphabetic\w*|alphabetisch\w*|ascending|descending|aufsteigend|absteigend)\b/;

const NOT_A_LIST_SORT =
  /\b(?:api|mcp|rest|tools?|inbox|posteingang|e ?mails?|threads?|conversations?|konversation\w*|search\w*|such\w*|results?|ergebnis\w*|widgets?|dashboard\w*|timelines?|activit\w*|aktivitat\w*)\b/;

function productPriceQuestion(folded: string, content: readonly string[], stemmer: DocsStemmer): boolean {
  const price = stemmedWords(PRICE_WORDS, stemmer);
  const context = stemmedWords(PRICE_CONTEXT_WORDS, stemmer);
  const words = content.filter((word) => word.length > 1 && !/^\d+$/.test(word)).map((word) => term(word, stemmer));
  return (
    (words.some((word) => price.has(word)) || PRICE_AMOUNT_QUESTION.test(folded)) &&
    words.every((word) => price.has(word) || context.has(word))
  );
}

const QUERY_CONCEPTS: readonly QueryConcept[] = [
  { when: productPriceQuestion, add: { english: "plan price", german: "tarif preis" } },
  {
    when: (folded, content, stemmer) =>
      BILLING_VERB.test(folded) && SEAT_WORD.test(folded) && !productPriceQuestion(folded, content, stemmer),
    add: { english: "seat", german: "nutzerplatz" },
  },
  {
    when: (folded) =>
      OWN_RECORDS_ONLY.test(folded) ||
      (RESTRICT_WORD.test(folded) && VISIBILITY_WORD.test(folded) && !CREDENTIAL_WORD.test(folded)),
    add: { english: "restrict assigned role", german: "beschranken zugewiesen rolle" },
  },
  {
    when: (folded) =>
      MESSAGING_PROVIDER.test(folded) && MESSAGE_WORD.test(folded) && !CHANNEL_SETUP_OR_RATE.test(folded),
    add: { english: "inbox", german: "posteingang" },
  },
  {
    when: (folded) => CONNECT_WORD.test(folded) && EMAIL_WORD.test(folded),
    add: { english: "channel", german: "kanal" },
  },
  {
    when: (folded) =>
      CHANNEL_STATUS_LABEL.test(folded) ||
      ((MESSAGING_PROVIDER.test(folded) || CHANNEL_NOUN.test(folded)) &&
        CHANNEL_TROUBLE.test(folded) &&
        !CHANNEL_SETUP_OR_RATE.test(folded)),
    add: { english: "reactivate status", german: "reaktivieren status" },
  },
  {
    when: (folded) => TOOL_LIST_QUESTION.test(folded) && !ASSISTANT_WORD.test(folded),
    add: { english: "tool catalog", german: "tool katalog" },
  },
  {
    when: (folded) => SORT_WORD.test(folded) && SORT_CRITERION.test(folded) && !NOT_A_LIST_SORT.test(folded),
    add: { english: "ascending", german: "aufsteigend" },
  },
  {
    when: (folded) => /\bfilter\w*/.test(folded) && /\bcustom column\b/.test(folded),
    add: { english: "operator", german: "operator" },
  },
];

const CREATE_WORDS = "create add anlegen";

const NEW_WORDS = "new neu neue neuen neuer neues neuem";

export function queryIntent(
  query: string,
  stemmer: DocsStemmer = "english",
): { tokens: string[]; concepts: string[]; address: boolean; pageNames: string[]; addressTerms: string[] } {
  const words = normalizedWords(query.replace(ATTRIBUTE_ADDRESS, " "), stemmer);
  const folded = words.join(" ");
  const relation = LINK_NOUN.test(folded) && relationLink(folded, words);
  const pageLink = LINK_NOUN.test(folded) && !relation;
  const address = words.some(pageAddressNoun) || pageLink || (!relation && LOCATION_QUESTION.test(folded));
  const dropped = address ? tokenize(`${LOCATION_VERBS} ${pageLink ? "link links" : ""}`, stemmer) : [];
  const unique = [...new Set(tokenize(query, stemmer))];
  const creates = unique.some((token) => stemmedWords(CREATE_WORDS, stemmer).has(token));
  const asked = unique.filter(
    (token) => !dropped.includes(token) && !(creates && stemmedWords(NEW_WORDS, stemmer).has(token)),
  );
  const content = words.filter((word) => !STOP_WORDS.has(word));
  const concepts = QUERY_CONCEPTS.filter((concept) => concept.when(folded, content, stemmer))
    .flatMap((concept) => tokenize(concept.add[stemmer], stemmer))
    .filter((token, position, all) => !asked.includes(token) && all.indexOf(token) === position);
  const tokens = [...asked, ...concepts];
  const addressTerms = tokenize(`${PAGE_ADDRESS_WORDS} ${PAGE_KIND_WORDS}`, stemmer);
  const named = [...new Set(asked)].filter((token) => !addressTerms.includes(token));
  return { tokens, concepts, address, pageNames: address ? named : [], addressTerms };
}

function queryTermsFor(index: DocsSectionIndex, query: string): QueryTerms {
  const intent = queryIntent(query, index.stemmer);
  const { primary, synonyms } = expandQueryTokens(intent.tokens, index.stemmer);
  const idfByTerm = new Map<string, number>();
  for (const term of [...primary, ...synonyms])
    idfByTerm.set(term, idf(index.sections.length, index.documentFrequency.get(term) ?? 0));
  const askedIdf = Math.max(
    0,
    ...primary.filter((term) => !intent.concepts.includes(term)).map((term) => idfByTerm.get(term) ?? 0),
  );
  for (const term of intent.concepts) idfByTerm.set(term, Math.max(idfByTerm.get(term) ?? 0, askedIdf));
  const queryIdf = primary.reduce((sum, term) => sum + (idfByTerm.get(term) ?? 0), 0);
  const rarest =
    [...primary].sort((left, right) => (idfByTerm.get(right) ?? 0) - (idfByTerm.get(left) ?? 0))[0] ?? null;
  const related = synonymIndex(index.stemmer);
  const synonymsOf = new Map(
    primary.map((term) => [term, [...(related.get(term) ?? [])].filter((other) => other !== term)]),
  );
  return {
    primary,
    synonyms,
    synonymsOf,
    idfByTerm,
    queryIdf,
    rarest,
    pageNames: intent.pageNames,
    addressTerms: intent.addressTerms,
    concepts: intent.concepts,
    asked: intent.tokens.filter((token) => !intent.concepts.includes(token)),
  };
}

function linkCoverage(section: IndexedSection, terms: QueryTerms, weights: DocsRetrievalWeights): number {
  if (terms.pageNames.length === 0) return 0;
  const allowed = new Set([...terms.pageNames, ...terms.addressTerms, ...terms.synonyms]);
  const strength = new Map<string, number>();
  for (const name of section.linkNames) {
    if (!name.tokens.every((token) => allowed.has(token))) continue;
    const value = name.kind === "introduced" ? 1 : name.kind === "named" ? weights.namedLink : weights.routeLink;
    for (const token of name.tokens) strength.set(token, Math.max(strength.get(token) ?? 0, value));
  }
  let matched = 0;
  let total = 0;
  for (const term of terms.pageNames) {
    const weight = terms.idfByTerm.get(term) ?? 0;
    const viaSynonym =
      Math.max(0, ...(terms.synonymsOf.get(term) ?? []).map((synonym) => strength.get(synonym) ?? 0)) * weights.synonym;
    total += weight;
    matched += weight * Math.max(strength.get(term) ?? 0, viaSynonym);
  }
  return total > 0 ? matched / total : 0;
}

function coverage(
  tokens: readonly string[],
  terms: QueryTerms,
  weights: DocsRetrievalWeights,
  discounted: readonly string[] = [],
  perTerm = false,
): number {
  if (terms.primary.length === 0) return 0;
  let matched = 0;
  let total = 0;
  for (const term of terms.primary) {
    const weight = (terms.idfByTerm.get(term) ?? 0) * (discounted.includes(term) ? weights.titleOverlap : 1);
    total += weight;
    if (tokens.includes(term)) matched += weight;
    else if (
      (perTerm ? (terms.synonymsOf.get(term) ?? []) : terms.synonyms).some((synonym) => tokens.includes(synonym))
    )
      matched += weight * weights.synonym;
  }
  return total > 0 ? Math.min(1, matched / total) : 0;
}

function containsSequence(tokens: readonly string[], sequence: readonly string[]): boolean {
  if (sequence.length < 2) return false;
  for (let start = 0; start + sequence.length <= tokens.length; start += 1)
    if (sequence.every((token, offset) => tokens[start + offset] === token)) return true;
  return false;
}

function tokenPhraseBonus(asked: readonly string[], section: IndexedSection, weights: DocsRetrievalWeights): number {
  if (containsSequence(section.ownHeadingTokens, asked)) return weights.tokenPhrase;
  return containsSequence(section.proseTokens, asked) ? weights.tokenPhrase / 2 : 0;
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
  const pageLink = linkCoverage(section, terms, weights);
  const shared = section.titleTokens.filter((token) => !terms.concepts.includes(token));
  const pathCoverage = coverage(section.ownHeadingTokens, terms, weights, shared);
  const inherited = terms.pageNames.length > 0 ? weights.inheritedHeading : weights.inheritedTopic;
  const ownCoverage = Math.max(coverage(section.lastHeadingTokens, terms, weights, shared), inherited * pathCoverage);
  const headingCoverage = Math.max(ownCoverage, pageLink);
  const lengthFactor = Math.min(1, index.averageBodyLength / Math.max(1, section.bodyLength)) ** weights.lengthDamping;
  const bodyCoverage = coverage(section.bodyTokens, terms, weights, shared) * lengthFactor;
  const rarestInHeading =
    terms.rarest !== null &&
    !section.titleTokens.includes(terms.rarest) &&
    section.ownHeadingTokens.includes(terms.rarest);
  const body = bodyBm25(index, section, terms, weights);
  const phrase = Math.max(
    phraseBonus(query, section.foldedHeading, section.foldedText),
    tokenPhraseBonus(terms.asked, section, weights),
  );
  let total =
    terms.queryIdf *
      (weights.headingCoverage * headingCoverage +
        weights.bodyCoverage * bodyCoverage +
        (rarestInHeading ? weights.rarestHeading : 0) +
        weights.pageLink * pageLink) +
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
  const exactTool = query.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}\b/)?.[0];
  const toolHeadingBonus =
    exactTool &&
    own.some(
      (section) => section.headingPath.at(-1)?.includes(exactTool) || section.text.includes(`#### \`${exactTool}\``),
    )
      ? 100
      : 0;
  const title = terms.pageNames.length > 0 ? 0 : weights.title;
  return (
    best +
    toolHeadingBonus +
    weights.secondSection * (scores[1] ?? 0) +
    title * terms.queryIdf * coverage(own[0].titleTokens, terms, weights, [], true)
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

const LINK_LINE = /^\*\*Link:\*\*/;

const TITLE_LINE = /^\*\*[^*]+\*\*$/;

const TABLE_SEPARATOR = /^\|\s*:?-/;

const SUBHEADING_LINE = /^#{2,6}\s/;

const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[\p{Lu}*`"„(\[])/u;

const ABBREVIATION_END = /\b(?:e\.g|i\.e|etc|vs|bzw|usw|ca|inkl|ggf|evtl|sog|nr|approx|z\.\s?b|d\.\s?h|u\.\s?a)\.$/i;

const EXCERPT_SYNONYM_WEIGHT = 0.3;

const EXCERPT_BACKWARD_COST = 3;

const EXCERPT_NEAR_REACH = 1;

const ELLIPSIS = "…";

const FORMULA_QUESTION =
  /\b(?:calculat\w*|comput\w*|formulas?|worth|berechne\w*|berechnung\w*|errechne\w*|formel\w*)\b/;

const FORMULA_STATEMENT =
  /\s=\s|\b(?:multiplied|times|sum of|divided by|product of|corresponds to|multipliziert|mal|summe aus|summe der|geteilt durch|entspricht)\b/i;

const DEFINED_TERM = /(?:^(?:[-*]\s+)?|[:;,(]\s*)\*\*([^*]+)\*\*\)?:?\s+(?=\p{Ll})/gu;

function definedTerms(text: string): string[] {
  return [...text.matchAll(DEFINED_TERM)].map((match) => match[1]);
}

export type DocsExcerptPart = { section: DocsSection; keepLinkLines?: boolean; weight?: number; lead?: boolean };

type ExcerptLine = { text: string; pieces: string[]; context: number[]; content: boolean; body: boolean; key?: string };

type ExcerptBlock = { heading: string; lines: ExcerptLine[]; links: string[]; weight: number };

type ExcerptUnit = {
  order: number;
  block: number;
  line: number;
  piece: number;
  tokens: Set<string>;
  keyTokens: Set<string>;
  definedTerms: string[][];
  formula: boolean;
  length: number;
};

type ExcerptState = { picked: boolean[][][]; shownContext: boolean[][]; trimmed: Map<string, string> };

function splitSentences(line: string): string[] {
  const sentences: string[] = [];
  for (const part of line.split(SENTENCE_BREAK)) {
    const previous = sentences.at(-1);
    if (
      previous !== undefined &&
      (previous.replace(/[^\p{L}\p{N}]/gu, "").length < 3 || ABBREVIATION_END.test(previous))
    )
      sentences[sentences.length - 1] = `${previous} ${part}`;
    else sentences.push(part);
  }
  return sentences;
}

function excerptHeading(section: DocsSection): string {
  return section.headingPath.length
    ? `${"#".repeat(Math.min(3, section.headingPath.length + 1))} ${section.headingPath.at(-1)}`
    : "";
}

function excerptBlock(part: DocsExcerptPart): ExcerptBlock {
  const raw = part.section.text.split("\n");
  const lines: ExcerptLine[] = [];
  const links: string[] = [];
  const contextLine = (text: string): ExcerptLine => ({ text, pieces: [], context: [], content: true, body: false });
  let subheading: number[] = [];
  let tableHeader: number[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const text = raw[index];
    if (text.startsWith("```")) {
      let end = index + 1;
      while (end < raw.length && !raw[end].startsWith("```")) end += 1;
      const fence = raw.slice(index, end + 1).join("\n");
      lines.push({ text: fence, pieces: [fence], context: subheading, content: true, body: true });
      index = end;
      tableHeader = [];
      continue;
    }
    if (part.keepLinkLines && LINK_LINE.test(text)) {
      links.push(text);
      continue;
    }
    if (text.trim() === "") {
      lines.push({ text, pieces: [], context: [], content: false, body: false });
      tableHeader = [];
      continue;
    }
    if (SUBHEADING_LINE.test(text)) {
      subheading = [lines.length];
      tableHeader = [];
      lines.push(contextLine(text));
      continue;
    }
    if (text.startsWith("|")) {
      if (TABLE_SEPARATOR.test(text)) {
        lines.push(contextLine(text));
        continue;
      }
      if (TABLE_SEPARATOR.test(raw[index + 1] ?? "")) {
        tableHeader = [lines.length, lines.length + 1];
        lines.push(contextLine(text));
        continue;
      }
      lines.push({
        text,
        pieces: [text],
        context: [...subheading, ...tableHeader],
        content: true,
        body: true,
        key: (text.split("|")[1] ?? "").replace(/`[^`]*`/g, " "),
      });
      continue;
    }
    tableHeader = [];
    const title = TITLE_LINE.test(text.trim());
    lines.push({
      text,
      pieces: title ? [text] : splitSentences(text),
      context: subheading,
      content: true,
      body: !title,
    });
  }
  return { heading: excerptHeading(part.section), lines, links, weight: part.weight ?? 1 };
}

function renderExcerptLine(line: ExcerptLine, picked: boolean[], trimmed: string | undefined): string {
  if (trimmed !== undefined) return trimmed;
  if (line.pieces.length === 0 || picked.every(Boolean)) return line.text;
  let rendered = "";
  let previous = -1;
  line.pieces.forEach((piece, index) => {
    if (!picked[index]) return;
    if (previous === -1) rendered = index > 0 ? `${ELLIPSIS} ${piece}` : piece;
    else rendered += index === previous + 1 ? ` ${piece}` : ` ${ELLIPSIS} ${piece}`;
    previous = index;
  });
  return previous < line.pieces.length - 1 ? `${rendered} ${ELLIPSIS}` : rendered;
}

function renderExcerptBlock(block: ExcerptBlock, index: number, state: ExcerptState, keptLinks: boolean): string {
  const out: string[] = block.heading ? [block.heading] : [];
  let omitted = false;
  let blank = false;
  let started = false;
  block.lines.forEach((line, lineIndex) => {
    const trimmed = state.trimmed.get(`${index}:${lineIndex}`);
    const shown =
      trimmed !== undefined || state.shownContext[index][lineIndex] || state.picked[index][lineIndex].some(Boolean);
    if (!shown) {
      if (line.content) omitted = true;
      else if (started) blank = true;
      return;
    }
    const rendered = renderExcerptLine(line, state.picked[index][lineIndex], trimmed);
    const elided = out.at(-1)?.endsWith(ELLIPSIS) ?? false;
    if (omitted) {
      if (!elided && !rendered.startsWith(ELLIPSIS)) out.push(ELLIPSIS);
    } else if (blank) out.push("");
    omitted = false;
    blank = false;
    started = true;
    out.push(elided && rendered.startsWith(`${ELLIPSIS} `) ? rendered.slice(ELLIPSIS.length + 1) : rendered);
  });
  if (omitted && !out.at(-1)?.endsWith(ELLIPSIS)) out.push(ELLIPSIS);
  if (keptLinks) out.push(...block.links);
  return out.join("\n");
}

function blockShown(state: ExcerptState, index: number): boolean {
  return (
    index === 0 ||
    state.picked[index].some((line) => line.some(Boolean)) ||
    [...state.trimmed.keys()].some((key) => key.split(":")[0] === String(index))
  );
}

function renderExcerpt(blocks: readonly ExcerptBlock[], state: ExcerptState, keptLinks: readonly boolean[]): string {
  return blocks
    .map((block, index) => (blockShown(state, index) ? renderExcerptBlock(block, index, state, keptLinks[index]) : ""))
    .filter((part, index) => index === 0 || part.length > 0)
    .join("\n\n");
}

function queryTermWeights(
  units: readonly ExcerptUnit[],
  query: string,
  stemmer: DocsStemmer,
): { term: string; synonyms: string[]; weight: number }[] {
  const primary = [...new Set(queryIntent(query, stemmer).tokens)];
  const index = synonymIndex(stemmer);
  return primary.map((term) => {
    const synonyms = [...(index.get(term) ?? [])].filter((other) => other !== term);
    const matching = units.filter(
      (unit) => unit.tokens.has(term) || synonyms.some((synonym) => unit.tokens.has(synonym)),
    ).length;
    return { term, synonyms, weight: Math.log(1 + units.length / (1 + matching)) };
  });
}

export function docsExcerpt(
  parts: readonly DocsExcerptPart[],
  query: string,
  maxChars: number,
  stemmer: DocsStemmer = "english",
): string {
  const blocks = parts.map(excerptBlock);
  const state: ExcerptState = {
    picked: blocks.map((block) => block.lines.map((line) => line.pieces.map(() => false))),
    shownContext: blocks.map((block) => block.lines.map(() => false)),
    trimmed: new Map(),
  };
  const keptLinks = blocks.map((block) => {
    const linkLength = block.links.reduce((total, line) => total + line.length + 1, 0);
    return block.links.length > 0 && linkLength < maxChars - block.heading.length - 1;
  });
  const units: ExcerptUnit[] = blocks.flatMap((block, blockIndex) =>
    block.lines.flatMap((line, lineIndex) =>
      line.pieces.map((piece, pieceIndex) => ({
        order: 0,
        block: blockIndex,
        line: lineIndex,
        piece: pieceIndex,
        tokens: new Set(tokenize(piece, stemmer)),
        keyTokens: new Set(tokenize(line.key ?? "", stemmer)),
        definedTerms:
          line.body && line.key === undefined ? definedTerms(piece).map((label) => tokenize(label, stemmer)) : [],
        formula: FORMULA_STATEMENT.test(piece),
        length: piece.length,
      })),
    ),
  );
  units.forEach((unit, order) => {
    unit.order = order;
  });
  const terms = queryTermWeights(units, query, stemmer);
  const level = terms.map(() => 0);
  const matches = units.map((unit) =>
    terms.map((term) =>
      unit.tokens.has(term.term)
        ? 1
        : term.synonyms.some((synonym) => unit.tokens.has(synonym))
          ? EXCERPT_SYNONYM_WEIGHT
          : 0,
    ),
  );
  const relevances = units.map(
    (unit) =>
      blocks[unit.block].weight * terms.reduce((total, term, t) => total + term.weight * matches[unit.order][t], 0),
  );
  const relevance = (unit: ExcerptUnit) => relevances[unit.order];
  const novelty = (unit: ExcerptUnit) =>
    blocks[unit.block].weight *
    terms.reduce((total, term, t) => total + term.weight * Math.max(0, matches[unit.order][t] - level[t]), 0);
  const isPicked = (unit: ExcerptUnit) => state.picked[unit.block][unit.line][unit.piece];
  const isTaken = (unit: ExcerptUnit) => isPicked(unit) || state.trimmed.has(`${unit.block}:${unit.line}`);
  const length = () => renderExcerpt(blocks, state, keptLinks).length;
  const tryPick = (unit: ExcerptUnit): boolean => {
    const line = blocks[unit.block].lines[unit.line];
    const hidden = line.context.filter((contextIndex) => !state.shownContext[unit.block][contextIndex]);
    state.picked[unit.block][unit.line][unit.piece] = true;
    for (const contextIndex of hidden) state.shownContext[unit.block][contextIndex] = true;
    if (length() <= maxChars) return true;
    for (const contextIndex of hidden) state.shownContext[unit.block][contextIndex] = false;
    if (hidden.length > 0 && length() <= maxChars) return true;
    state.picked[unit.block][unit.line][unit.piece] = false;
    return false;
  };
  const trimInto = (unit: ExcerptUnit) => {
    const key = `${unit.block}:${unit.line}`;
    state.trimmed.set(key, "");
    const available = maxChars - length();
    const text = blocks[unit.block].lines[unit.line].pieces[unit.piece];
    if (available > 2) state.trimmed.set(key, `${text.slice(0, available - 1)}${ELLIPSIS}`);
    else state.trimmed.delete(key);
  };
  const distance = new Map<ExcerptUnit, number>();
  const defined = new Set<string>();
  const termSet = new Set(terms.map((term) => term.term));
  const asksFormula = FORMULA_QUESTION.test(normalizedWords(query, stemmer).join(" "));
  const formulaShown = new Set<number>();
  const statesFormula = (unit: ExcerptUnit) =>
    asksFormula && unit.formula && !formulaShown.has(unit.block) && relevance(unit) > 0;
  const definedLabels = (unit: ExcerptUnit) =>
    unit.definedTerms.filter((label) => label.length > 0 && label.every((token) => termSet.has(token))).flat();
  const definesNew = (unit: ExcerptUnit) =>
    (keyed(unit) === 1 && [...unit.keyTokens].some((token) => !defined.has(token))) ||
    definedLabels(unit).some((token) => !defined.has(token)) ||
    statesFormula(unit);
  const anchor = (unit: ExcerptUnit) => {
    distance.set(unit, 0);
    for (const term of terms)
      if (unit.keyTokens.has(term.term) || definedLabels(unit).includes(term.term)) defined.add(term.term);
    if (asksFormula && unit.formula) formulaShown.add(unit.block);
    terms.forEach((_, t) => {
      level[t] = Math.max(level[t], matches[unit.order][t]);
    });
  };
  const keyed = (unit: ExcerptUnit) =>
    unit.keyTokens.size > 0 && [...unit.keyTokens].every((token) => termSet.has(token)) ? 1 : 0;
  const byRelevance = (left: ExcerptUnit, right: ExcerptUnit) =>
    Number(statesFormula(right)) - Number(statesFormula(left)) ||
    novelty(right) - novelty(left) ||
    keyed(right) - keyed(left) ||
    relevance(right) - relevance(left) ||
    left.order - right.order;
  const primaryUnits = units.filter((unit) => unit.block === 0);
  const [top] = [...primaryUnits].sort(byRelevance);
  if (top) {
    const seed = relevance(top) > 0 ? top : primaryUnits[0];
    if (tryPick(seed)) anchor(seed);
    else trimInto(seed);
  }
  const lead = primaryUnits[0];
  if (parts[0]?.lead && lead && !isTaken(lead) && tryPick(lead)) anchor(lead);
  const pickAnchors = (block: number) => {
    for (;;) {
      const base = length();
      const chosen = units
        .filter(
          (unit) =>
            unit.block === block &&
            !isTaken(unit) &&
            (novelty(unit) > 0 || definesNew(unit)) &&
            base + unit.length - 4 <= maxChars,
        )
        .sort(byRelevance)
        .find(tryPick);
      if (!chosen) return;
      anchor(chosen);
    }
  };
  const blockUnits = blocks.map((_, blockIndex) => units.filter((unit) => unit.block === blockIndex));
  const fill = (blocksToFill: readonly number[], reach: number) => {
    for (;;) {
      const next = blocksToFill
        .flatMap((block) => {
          const list = blockUnits[block];
          return list.flatMap((unit, index) => {
            if (isTaken(unit)) return [];
            const before = index > 0 ? distance.get(list[index - 1]) : undefined;
            const after = index + 1 < list.length ? distance.get(list[index + 1]) : undefined;
            const forward = before === undefined ? Number.POSITIVE_INFINITY : before + 1;
            const backward = after === undefined ? Number.POSITIVE_INFINITY : (after + 1) * EXCERPT_BACKWARD_COST;
            const cost = Math.min(forward, backward);
            const depth = forward <= backward ? forward : (after ?? 0) + 1;
            return Number.isFinite(cost) && cost <= reach ? [{ unit, cost, depth }] : [];
          });
        })
        .sort((left, right) => left.unit.block - right.unit.block || left.cost - right.cost);
      const chosen = next.find((candidate) => tryPick(candidate.unit));
      if (!chosen) return;
      distance.set(chosen.unit, chosen.depth);
    }
  };
  pickAnchors(0);
  fill([0], EXCERPT_NEAR_REACH);
  for (let block = 1; block < blocks.length; block += 1) pickAnchors(block);
  fill(
    blocks.map((_, block) => block),
    Number.POSITIVE_INFINITY,
  );
  const primary = blocks[0];
  const lastPicked = primaryUnits.filter(isPicked).at(-1);
  if (primary && lastPicked && !primaryUnits.some((unit) => isPicked(unit) && primary.lines[unit.line].body)) {
    const follower = primaryUnits.find((unit) => unit.line > lastPicked.line && !isTaken(unit));
    if (follower) trimInto(follower);
  }
  return renderExcerpt(blocks, state, keptLinks);
}

export function sectionExcerpt(
  section: DocsSection,
  query: string,
  maxChars: number,
  stemmer: DocsStemmer = "english",
  keepLinkLines = false,
): string {
  const heading = excerptHeading(section);
  if (heading.length + section.text.length + 1 <= maxChars) return [heading, section.text].filter(Boolean).join("\n");
  return docsExcerpt([{ section, keepLinkLines }], query, maxChars, stemmer);
}
