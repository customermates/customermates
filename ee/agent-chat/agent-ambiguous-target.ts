import { decode } from "@toon-format/toon";

export type AmbiguousTarget = { entity: string; phrase: string; candidates: { id: string; name: string }[] };

export type AmbiguityRequest = { latestUserText: string; previousAssistantText: string };

const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const TOON_TABLE_ROW = /^\s+([0-9a-fA-F-]{36}),(?:"((?:[^"\\]|\\.)*)"|([^\n,]*))/gm;
const TOON_LIST_ROW = /^\s*-\s+id:\s*([0-9a-fA-F-]{36})\s*\n\s+name:\s*(?:"((?:[^"\\]|\\.)*)"|([^\n]*))/gm;
const TOON_ENTITY_SECTION = /^\s*-\s+entity:\s*"?([\w-]+)"?\s*$/gm;
const UNSPACED_SCRIPTS = ["Han", "Hiragana", "Katakana", "Thai", "Lao", "Khmer", "Myanmar"]
  .map((script) => `\\p{scx=${script}}`)
  .join("");
const PROCLITIC_SCRIPTS = ["Hebrew", "Arabic", "Syriac", "Ethiopic"].map((script) => `\\p{scx=${script}}`).join("");
const WORD = "\\p{L}\\p{N}\\p{M}\\u200c\\u200d";
const NEVER_WORD = "\\u20e3";
const ANY_WORD_CHAR = new RegExp(`^[[${WORD}]--[${NEVER_WORD}]]$`, "v");
const SPACED_WORD_CHAR = new RegExp(`^[[${WORD}]--[${NEVER_WORD}${UNSPACED_SCRIPTS}]]$`, "v");
const WORD_BEFORE_PHRASE = new RegExp(`^[[${WORD}]--[${NEVER_WORD}${UNSPACED_SCRIPTS}${PROCLITIC_SCRIPTS}]]$`, "v");
const UNSPACED_CHAR = new RegExp(`^[${UNSPACED_SCRIPTS}]$`, "v");
const SET_WORD_REACH = 3;
const DETERMINER_REACH = 2;
const SELECTION_RULE_REACH = 3;
const NAMING_CLAUSE_REACH = 8;
const CLAUSE_LOOKBACK_CHARS = 400;
const CLAUSE_MARKS = [".", "!", "?", ";", ":", ",", "\n"];
const CLAUSE_BREAK = /[.,:;!?]+(?=\s|$)|\n/;
const COUNT_WORDS = [
  "both",
  "two",
  "three",
  "four",
  "five",
  "beide",
  "beiden",
  "zwei",
  "drei",
  "vier",
  "fünf",
  "ambos",
  "ambas",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "entrambi",
  "entrambe",
  "tre",
  "quattro",
  "cinque",
];
const COORDINATORS = ["and", "und", "sowie", "y", "e", "et", "ed"];
const ENTITY_PLURALS: Record<string, string[]> = {
  deal: ["deals", "tratos"],
  contact: ["contacts", "kontakte", "contactos", "contatti"],
  task: ["tasks", "aufgaben", "tareas", "tâches", "attività"],
  organization: [
    "organizations",
    "organisations",
    "organisationen",
    "organizaciones",
    "organizzazioni",
    "companies",
    "firmen",
    "empresas",
    "entreprises",
    "aziende",
  ],
  service: ["services", "dienstleistungen", "servicios", "servizi"],
};
const ARTICLES = ["the", "die", "der", "el", "los", "las", "les", "le", "la", "lo", "i", "gli"];
const SINGULAR_GENITIVES = [
  "des",
  "eines",
  "meines",
  "deines",
  "seines",
  "ihres",
  "unseres",
  "eures",
  "dieses",
  "jenes",
];
const POSSESSIVES = [
  "our",
  "my",
  "your",
  "their",
  "unsere",
  "unseren",
  "unserer",
  "meine",
  "meinen",
  "deine",
  "ihre",
  "ihren",
  "nuestros",
  "nuestras",
  "mis",
  "tus",
  "sus",
  "nos",
  "mes",
  "tes",
  "ses",
  "vos",
  "leurs",
  "nostri",
  "nostre",
  "miei",
  "mie",
  "tuoi",
  "tue",
  "suoi",
  "sue",
  "loro",
];
const PHRASE_BREAKS = [
  "to",
  "into",
  "for",
  "from",
  "of",
  "on",
  "in",
  "at",
  "as",
  "and",
  "or",
  "mit",
  "zu",
  "zum",
  "zur",
  "für",
  "von",
  "vom",
  "an",
  "auf",
  "im",
  "und",
  "oder",
  "dem",
  "den",
  "das",
  "a",
  "al",
  "para",
  "por",
  "de",
  "del",
  "con",
  "y",
  "o",
  "à",
  "au",
  "aux",
  "pour",
  "du",
  "des",
  "avec",
  "et",
  "ou",
  "sur",
  "dans",
  "alla",
  "ai",
  "per",
  "di",
  "della",
  "e",
  "su",
  "nel",
  "nella",
];
const SET_WORD_LIST = [
  "all",
  "every",
  "each",
  "both",
  "any",
  "alle",
  "allen",
  "aller",
  "alles",
  "jede",
  "jeden",
  "jeder",
  "jedes",
  "beide",
  "beiden",
  "sämtliche",
  "sämtlichen",
  "todos",
  "todas",
  "cada",
  "ambos",
  "ambas",
  "tous",
  "toutes",
  "chaque",
  "tutti",
  "tutte",
  "ogni",
  "entrambi",
  "entrambe",
];
const NAMING_WORD_LIST = [
  "named",
  "called",
  "namens",
  "genannt",
  "heißt",
  "heißen",
  "llamado",
  "llamada",
  "llamados",
  "llamadas",
  "nommé",
  "nommée",
  "nommés",
  "nommées",
  "appelé",
  "appelée",
  "appelés",
  "appelées",
  "chiamato",
  "chiamata",
  "chiamati",
  "chiamate",
  "titled",
  "with the name",
  "whose name is",
  "mit dem namen",
  "mit namen",
  "con el nombre",
  "de nombre",
  "avec le nom",
  "du nom",
  "con il nome",
  "di nome",
];
const SELECTION_RULE_LIST = [
  "starts with",
  "start with",
  "starting with",
  "begins with",
  "begin with",
  "beginning with",
  "contains",
  "containing",
  "ends with",
  "ending with",
  "matching",
  "name mit",
  "namen mit",
  "beginnt mit",
  "beginnen mit",
  "enthält",
  "enthalten",
  "endet auf",
  "enden auf",
  "empieza por",
  "empieza con",
  "empiezan por",
  "empiezan con",
  "comienza por",
  "comienza con",
  "contiene",
  "contienen",
  "commence par",
  "commencent par",
  "commençant par",
  "contient",
  "contiennent",
  "contenant",
  "inizia con",
  "iniziano con",
  "comincia con",
  "contengono",
];

type Row = { id: string; name: string };
type ListRead = { tool: string; entities: string[] | null };

function fold(text: string): string {
  return text
    .replace(/[‘’ʼ´`′ʹ]/g, "'")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{Pd}/gu, " ")
    .replace(/[\n\r\v\f\u0085\u2028\u2029]+/g, "\n")
    .replace(/[^\S\n]+/g, " ");
}

function loose(text: string): string {
  return text.replace(/\s+/g, " ");
}

const spelled = new Map<string, string[]>();

function respell(text: string, keepBreaks: boolean): string[] {
  const key = `${keepBreaks ? "strict" : "loose"}:${text}`;
  const known = spelled.get(key);
  if (known) return known;
  const spaced = text.replace(/[^\p{L}\p{N}\p{M}\u200c\u200d'\s]/gu, " ");
  const plain = (keepBreaks ? spaced.replace(/[^\S\n]+/g, " ") : loose(spaced)).trim();
  const transliterated = plain.replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");
  const unaccented = plain.normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss").normalize("NFC");
  const result = [(keepBreaks ? text : loose(text)).trim(), transliterated, unaccented];
  spelled.set(key, result);
  return result;
}

function spellings(text: string): string[] {
  return respell(text, false);
}

function strictSpellings(text: string, clauses = false): string[] {
  if (!clauses) return respell(text, true);
  const [raw] = respell(text, true);
  const [, transliterated, unaccented] = respell(text.replace(/[.,:;!?]+(?=\s|$)/g, "\n"), true);
  return [raw, transliterated, unaccented];
}

function wordsOf(text: string): string[] {
  return text.split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);
}

function inEverySpelling(words: string[]): string[] {
  return [...new Set(words.flatMap((word) => spellings(word)))];
}

const SET_WORDS = new Set(inEverySpelling([...SET_WORD_LIST, ...COUNT_WORDS]));
const COORDINATING_WORDS = new Set(inEverySpelling(COORDINATORS));
const PLURALS_BY_ENTITY = new Map(
  Object.entries(ENTITY_PLURALS).map(([entity, plurals]) => [entity, new Set(inEverySpelling(plurals))]),
);
const ARTICLE_WORDS = new Set(inEverySpelling(ARTICLES));
const DETERMINER_WORDS = new Set(inEverySpelling([...ARTICLES, ...POSSESSIVES]));
const GENITIVE_WORDS = new Set(inEverySpelling(SINGULAR_GENITIVES));
const BREAKING_WORDS = new Set(inEverySpelling(PHRASE_BREAKS));
const NAMING_RULES = inEverySpelling(NAMING_WORD_LIST).map((rule) => rule.split(" "));
const SELECTION_RULES = inEverySpelling(SELECTION_RULE_LIST).map((rule) => rule.split(" "));

function codePointBefore(text: string, index: number): string {
  return [...text.slice(Math.max(0, index - 2), index)].at(-1) ?? "";
}

function codePointAt(text: string, index: number): string {
  const code = text.codePointAt(index);
  return code === undefined ? "" : String.fromCodePoint(code);
}

function someOccurrence(text: string, needle: string, bounded: (start: number, end: number) => boolean): boolean {
  for (let start = text.indexOf(needle); start !== -1; start = text.indexOf(needle, start + 1))
    if (bounded(start, start + needle.length)) return true;

  return false;
}

function wordCharNextTo(edge: string): RegExp {
  return UNSPACED_CHAR.test(edge) ? ANY_WORD_CHAR : SPACED_WORD_CHAR;
}

function containsName(text: string, name: string): boolean {
  const chars = [...name];
  if (chars.length === 0) return false;
  const before = wordCharNextTo(chars[0]);
  const after = wordCharNextTo(chars[chars.length - 1]);
  return someOccurrence(
    text,
    name,
    (start, end) => !before.test(codePointBefore(text, start)) && !after.test(codePointAt(text, end)),
  );
}

function holdsName(longer: string, name: string): boolean {
  return someOccurrence(
    longer,
    name,
    (start, end) =>
      !SPACED_WORD_CHAR.test(codePointBefore(longer, start)) && !SPACED_WORD_CHAR.test(codePointAt(longer, end)),
  );
}

function holdsSequence(words: string[], sequence: string[]): boolean {
  return words.some((_, index) => sequence.every((part, offset) => words[index + offset] === part));
}

function endsWithSequence(words: string[], sequence: string[]): boolean {
  const tail = words.slice(-sequence.length);
  return tail.length === sequence.length && sequence.every((part, index) => tail[index] === part);
}

function namingPhraseGoverned(words: string[]): boolean {
  const rule = NAMING_RULES.find((naming) => endsWithSequence(words, naming));
  if (!rule) return false;
  const head = words.slice(0, words.length - rule.length).slice(-NAMING_CLAUSE_REACH);
  const setAt = head.findLastIndex((word) => SET_WORDS.has(word));
  if (setAt < 0) return false;
  const between = head.slice(setAt + 1);
  const described = ARTICLE_WORDS.has(between[0] ?? "") ? between.slice(1) : between;
  return described.every((word) => !BREAKING_WORDS.has(word) && !ARTICLE_WORDS.has(word));
}

function followingKind(text: string, end: number, entity: string): "plural" | "coordinated" | "open" | "other" {
  const after = text.slice(end, end + CLAUSE_LOOKBACK_CHARS);
  const clauseEnd = Math.min(
    ...CLAUSE_MARKS.map((mark) => after.indexOf(mark)).filter((index) => index >= 0),
    after.length,
  );
  const words = wordsOf(after.slice(0, clauseEnd)).slice(0, SELECTION_RULE_REACH);
  const [next] = words;
  if (next !== undefined && PLURALS_BY_ENTITY.get(entity)?.has(next)) return "plural";
  if (words.some((word) => COORDINATING_WORDS.has(word))) return "coordinated";
  return next === undefined || BREAKING_WORDS.has(next) ? "open" : "other";
}

function setWordGoverns(words: string[], text: string, end: number, entity: string): boolean {
  let index = words.length - 1;
  for (let skipped = 0; skipped < DETERMINER_REACH && DETERMINER_WORDS.has(words[index] ?? ""); skipped += 1)
    index -= 1;
  const adjacent = SET_WORDS.has(words[index] ?? "");
  const reach = words.slice(-SET_WORD_REACH);
  const setAt = reach.findLastIndex((word) => SET_WORDS.has(word));
  const describing =
    setAt >= 0 && reach.slice(setAt + 1).every((word) => !BREAKING_WORDS.has(word) && !GENITIVE_WORDS.has(word));
  if (!adjacent && !describing) return false;
  const kind = followingKind(text, end, entity);
  return kind === "plural" || (adjacent && kind === "open");
}

function governedByRule(text: string, start: number, end: number, entity: string): boolean {
  const before = text.slice(Math.max(0, start - CLAUSE_LOOKBACK_CHARS), start);
  const clauseStart = Math.max(...CLAUSE_MARKS.map((mark) => before.lastIndexOf(mark))) + 1;
  const words = wordsOf(before.slice(clauseStart));
  if (setWordGoverns(words, text, end, entity)) return true;
  const recent = words.slice(-SELECTION_RULE_REACH);
  if (SELECTION_RULES.some((rule) => holdsSequence(recent, rule))) return true;
  return namingPhraseGoverned(words);
}

function writtenAsRecord(text: string, name: string, entity: string): boolean {
  const [first] = [...name];
  if (!first) return false;
  const openBefore = UNSPACED_CHAR.test(first);
  return someOccurrence(
    text,
    name,
    (start, end) =>
      (openBefore || !WORD_BEFORE_PHRASE.test(codePointBefore(text, start))) &&
      !governedByRule(text, start, end, entity),
  );
}

function writtenInClauses(whole: string, clauses: string[], name: string, entity: string): boolean {
  const holding = clauses.filter((clause) => clause.includes(name));
  if (holding.length === 0) return writtenAsRecord(whole, name, entity);
  return holding.some((clause) => writtenAsRecord(clause, name, entity));
}

function writtenInSomeSpelling(text: string, name: string, entity: string): boolean {
  const names = spellings(name);
  const clauses = text.split(CLAUSE_BREAK).map(spellings);
  return spellings(text).some((spelling, index) =>
    writtenInClauses(
      spelling,
      clauses.map((clause) => clause[index]),
      names[index],
      entity,
    ),
  );
}

function writtenOutside(text: string, name: string, chosen: string[], entity: string): boolean {
  const names = spellings(name);
  const chosenSpellings = chosen.map((other) => strictSpellings(other));
  return strictSpellings(text, true).some((spelling, index) => {
    if (!chosenSpellings.every((other) => containsName(spelling, other[index]))) return false;
    const rest = chosenSpellings.reduce((remaining, other) => remaining.split(other[index]).join("\n"), spelling);
    const clauses = rest.split(CLAUSE_BREAK).map((clause) => loose(clause).trim());
    return writtenInClauses(loose(rest).trim(), clauses, names[index], entity);
  });
}

function containsOutside(text: string, name: string, others: string[]): boolean {
  const names = strictSpellings(name);
  const otherSpellings = others.map((other) => strictSpellings(other));
  return strictSpellings(text, true).some((spelling, index) => {
    if (!otherSpellings.every((other) => containsName(spelling, other[index]))) return false;
    const rest = otherSpellings.reduce((remaining, other) => remaining.split(other[index]).join("\n"), spelling);
    return containsName(rest, names[index]);
  });
}

function containsInSomeSpelling(text: string, name: string): boolean {
  const names = strictSpellings(name);
  return strictSpellings(text).some((spelling, index) => containsName(spelling, names[index]));
}

export function ambiguityRequestOf(history: readonly { role: string; text: string }[]): AmbiguityRequest {
  const latestIndex = history.findLastIndex((message) => message.role === "user");
  const previousAssistant = history
    .slice(0, Math.max(latestIndex, 0))
    .findLast((message) => message.role === "assistant");
  return {
    latestUserText: fold(latestIndex >= 0 ? history[latestIndex].text : ""),
    previousAssistantText: fold(previousAssistant?.text ?? ""),
  };
}

function queriedEntities(toolName: string, input: Record<string, unknown>): string[] | null | undefined {
  if (toolName === "list_records") return typeof input.entity === "string" ? [input.entity] : undefined;
  if (toolName !== "search_records") return undefined;
  const entities = Array.isArray(input.entities)
    ? input.entities.filter((entity): entity is string => typeof entity === "string")
    : [];
  return entities.length > 0 ? entities : null;
}

function unescapeToon(value: string): string {
  return value.replace(/\\(.)/g, "$1");
}

function rowsFromItems(items: unknown): Row[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const record = item as { id?: unknown; name?: unknown };
    return typeof record?.id === "string" && typeof record.name === "string"
      ? [{ id: record.id, name: record.name.trim() }]
      : [];
  });
}

function matchedRows(text: string): Row[] {
  return [...text.matchAll(TOON_TABLE_ROW), ...text.matchAll(TOON_LIST_ROW)].map((match) => ({
    id: match[1],
    name: (match[2] !== undefined ? unescapeToon(match[2]) : (match[3] ?? "")).trim(),
  }));
}

function entitySections(text: string): { entity: string; body: string }[] {
  const marks = [...text.matchAll(TOON_ENTITY_SECTION)];
  return marks.map((mark, index) => ({
    entity: mark[1],
    body: text.slice(mark.index + mark[0].length, marks[index + 1]?.index ?? text.length),
  }));
}

function decoded(text: string): { items?: unknown; results?: unknown } | null {
  try {
    const value = decode(text) as { items?: unknown; results?: unknown } | null;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function rowSets(output: unknown, read: ListRead): { entity: string; rows: Row[] }[] {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (!record || record.ok !== true || typeof record.result !== "string") return [];
  const wanted = (entity: string) => !read.entities || read.entities.includes(entity);
  const value = decoded(record.result);
  if (value && read.tool === "list_records") {
    return read.entities && Array.isArray(value.items)
      ? [{ entity: read.entities[0], rows: rowsFromItems(value.items) }]
      : [];
  }
  if (value) {
    const results = Array.isArray(value.results) ? (value.results as { entity?: unknown; items?: unknown }[]) : [];
    return results.flatMap((entry) =>
      typeof entry?.entity === "string" && wanted(entry.entity)
        ? [{ entity: entry.entity, rows: rowsFromItems(entry.items) }]
        : [],
    );
  }
  if (read.tool === "search_records") {
    return entitySections(record.result)
      .filter((section) => wanted(section.entity))
      .map((section) => ({ entity: section.entity, rows: matchedRows(section.body) }));
  }
  return read.entities?.length === 1 ? [{ entity: read.entities[0], rows: matchedRows(record.result) }] : [];
}

function createdRows(output: unknown): Row[] {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (!record || record.ok !== true || typeof record.result !== "string") return [];
  const value = decoded(record.result);
  return value ? rowsFromItems(value.items) : matchedRows(record.result);
}

function unwrap(output: unknown): unknown {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (record && record.type === "json" && "value" in record) return record.value;
  return output;
}

function chosenAmong(latest: string, candidates: Row[]): Row[] {
  const chosen: Row[] = [];
  const longestFirst = [...candidates].sort((a, b) => fold(b.name).length - fold(a.name).length);
  for (const candidate of longestFirst) {
    const name = fold(candidate.name);
    const holders = candidates.filter((other) => fold(other.name) !== name && holdsName(fold(other.name), name));
    if (!holders.every((holder) => chosen.includes(holder))) continue;
    if (
      containsOutside(
        latest,
        name,
        holders.map((holder) => fold(holder.name)),
      )
    )
      chosen.push(candidate);
  }
  return chosen;
}

function mentionedAlone(text: string, name: string, candidates: Row[]): boolean {
  const longer = candidates
    .map((candidate) => fold(candidate.name))
    .filter((other) => other !== name && holdsName(other, name));
  const remaining = longer.reduce((rest, other) => rest.split(other).join(" "), text);
  return containsName(remaining, name);
}

function answersClarification(request: AmbiguityRequest, candidates: Row[], entity: string): boolean {
  const listed = candidates.filter((candidate) =>
    mentionedAlone(request.previousAssistantText, fold(candidate.name), candidates),
  );
  if (listed.length < 2) return false;
  return listed.some((candidate) => {
    const name = fold(candidate.name);
    if (!containsInSomeSpelling(request.latestUserText, name)) return false;
    return candidates.every((other) => {
      const otherName = fold(other.name);
      return (
        otherName === name ||
        !holdsName(otherName, name) ||
        !writtenInSomeSpelling(request.latestUserText, otherName, entity)
      );
    });
  });
}

export function ambiguousTargetKey(target: AmbiguousTarget): string {
  return `${target.entity}:${fold(target.phrase)}`;
}

export function mergeAmbiguousTarget(armed: AmbiguousTarget | undefined, next: AmbiguousTarget): AmbiguousTarget {
  if (!armed) return next;
  const known = new Set(armed.candidates.map((candidate) => candidate.id.toLowerCase()));
  return {
    ...armed,
    candidates: [...armed.candidates, ...next.candidates.filter((candidate) => !known.has(candidate.id.toLowerCase()))],
  };
}

function targetsAmong(entity: string, rows: Row[], request: AmbiguityRequest): AmbiguousTarget[] {
  const latest = request.latestUserText;
  const named = rows.map((row) => ({ row, name: fold(row.name) }));
  const nested = named.filter(
    ({ name }) => name.length > 0 && named.some((other) => other.name !== name && holdsName(other.name, name)),
  );
  const written = [...new Set(nested.map(({ name }) => name))].filter((name) =>
    writtenInSomeSpelling(latest, name, entity),
  );
  return written.flatMap((name) => {
    const candidates = named.filter((entry) => holdsName(entry.name, name)).map((entry) => entry.row);
    if (answersClarification(request, candidates, entity)) return [];
    const chosen = chosenAmong(latest, candidates);
    const chosenNames = chosen.map((candidate) => fold(candidate.name));
    if (chosen.length > 0 && !writtenOutside(latest, name, chosenNames, entity)) return [];
    const remaining = candidates.filter((candidate) => !chosen.includes(candidate));
    const phrase = remaining.find((candidate) => fold(candidate.name) === name)?.name ?? name;
    return [{ entity, phrase, candidates: remaining }];
  });
}

export function ambiguousTargetsFromMessages(
  messages: readonly unknown[],
  request: AmbiguityRequest,
): AmbiguousTarget[] {
  if (!request.latestUserText) return [];

  const reads = new Map<string, ListRead>();
  const creations = new Set<string>();
  const created = new Set<string>();
  const found: AmbiguousTarget[] = [];

  spelled.clear();
  for (const message of messages) {
    const content = (message as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const raw of content) {
      const part = raw as { type?: string; toolName?: string; toolCallId?: string; input?: unknown; output?: unknown };
      if (part.type === "tool-call" && part.toolCallId && typeof part.toolName === "string") {
        const input = part.input && typeof part.input === "object" ? (part.input as Record<string, unknown>) : null;
        const entities = input ? queriedEntities(part.toolName, input) : undefined;
        if (entities !== undefined) reads.set(part.toolCallId, { tool: part.toolName, entities });
        if (part.toolName.startsWith("create_")) creations.add(part.toolCallId);
        continue;
      }
      if (part.type !== "tool-result" || !part.toolCallId) continue;
      if (creations.has(part.toolCallId)) {
        for (const row of createdRows(unwrap(part.output))) created.add(row.id.toLowerCase());
        continue;
      }
      const read = reads.get(part.toolCallId);
      if (!read) continue;
      for (const { entity, rows } of rowSets(unwrap(part.output), read))
        found.push(...targetsAmong(entity, rows, request));
    }
  }
  spelled.clear();

  return found.flatMap((target) => {
    const candidates = target.candidates.filter((candidate) => !created.has(candidate.id.toLowerCase()));
    return candidates.length >= 2 ? [{ ...target, candidates }] : [];
  });
}

export function candidateIdsIn(target: AmbiguousTarget, input: unknown): number {
  const ids = new Set((JSON.stringify(input ?? {}).match(UUID) ?? []).map((id) => id.toLowerCase()));
  return target.candidates.filter((candidate) => ids.has(candidate.id.toLowerCase())).length;
}

export function refusingTarget(
  targets: Iterable<AmbiguousTarget>,
  readOnly: boolean,
  input: unknown,
): AmbiguousTarget | null {
  if (readOnly) return null;
  for (const target of targets) if (candidateIdsIn(target, input) === 1) return target;
  return null;
}

export function ambiguousTargetRefusal(target: AmbiguousTarget): string {
  const names = target.candidates.map((candidate) => `${candidate.name} (${candidate.id})`).join(", ");
  return `More than one ${target.entity} matches "${target.phrase}": ${names}. Nothing was changed. Ask the user which one they mean.`;
}
