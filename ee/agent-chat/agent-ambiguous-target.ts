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
const MIN_DISTINGUISHING_WORD = 4;
const SET_WORD_REACH = 2;
const SELECTION_RULE_REACH = 3;
const NAMING_CLAUSE_REACH = 5;
const SET_WORDS = new Set([
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
]);
const NAMING_WORDS = new Set([
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
]);
const SELECTION_RULES = [
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
].map((rule) => rule.split(" "));

type Row = { id: string; name: string };
type ListRead = { tool: string; entities: string[] | null };

function fold(text: string): string {
  return text
    .replace(/[‘’ʼ´`′ʹ]/g, "'")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{Variation_Selector}/gu, "")
    .replace(/\p{Pd}/gu, " ")
    .replace(/[\n\r\v\f\u0085\u2028\u2029]+/g, "\n")
    .replace(/[^\S\n]+/g, " ");
}

function loose(text: string): string {
  return text.replace(/\s+/g, " ");
}

function spellings(text: string): string[] {
  const plain = loose(text.replace(/[^\p{L}\p{N}\p{M}\u200c\u200d'\s]/gu, " ")).trim();
  const transliterated = plain.replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");
  const unaccented = plain.normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss").normalize("NFC");
  return [loose(text).trim(), transliterated, unaccented];
}

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

function governedByRule(text: string, start: number): boolean {
  const words = text
    .slice(0, start)
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter(Boolean)
    .slice(-NAMING_CLAUSE_REACH);
  if (words.slice(-SET_WORD_REACH).some((word) => SET_WORDS.has(word))) return true;
  const recent = words.slice(-SELECTION_RULE_REACH);
  if (SELECTION_RULES.some((rule) => holdsSequence(recent, rule))) return true;
  return NAMING_WORDS.has(words.at(-1) ?? "") && words.some((word) => SET_WORDS.has(word));
}

function writtenAsRecord(text: string, name: string): boolean {
  const [first] = [...name];
  if (!first) return false;
  const openBefore = UNSPACED_CHAR.test(first);
  return someOccurrence(
    text,
    name,
    (start) => (openBefore || !WORD_BEFORE_PHRASE.test(codePointBefore(text, start))) && !governedByRule(text, start),
  );
}

function writtenInSomeSpelling(text: string, name: string): boolean {
  const texts = spellings(text);
  const names = spellings(name);
  return texts.some((spelling, index) => writtenAsRecord(spelling, names[index]));
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

function unwrap(output: unknown): unknown {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (record && record.type === "json" && "value" in record) return record.value;
  return output;
}

function namedUniquely(latest: string, candidate: Row, candidates: Row[]): boolean {
  const name = fold(candidate.name);
  if (!containsName(latest, name)) return false;
  return candidates.every((other) => other === candidate || !holdsName(fold(other.name), name));
}

function mentionedAlone(text: string, name: string, candidates: Row[]): boolean {
  const longer = candidates
    .map((candidate) => fold(candidate.name))
    .filter((other) => other !== name && holdsName(other, name));
  const remaining = longer.reduce((rest, other) => rest.split(other).join(" "), text);
  return containsName(remaining, name);
}

function distinguishingWords(request: AmbiguityRequest, name: string): boolean {
  const earlier = new Set(request.previousAssistantText.split(/[^\p{L}\p{N}]+/u));
  const nameWords = new Set(name.split(/[^\p{L}\p{N}]+/u));
  return request.latestUserText
    .split(/[^\p{L}\p{N}]+/u)
    .some((word) => [...word].length >= MIN_DISTINGUISHING_WORD && !nameWords.has(word) && earlier.has(word));
}

function answersClarification(request: AmbiguityRequest, candidates: Row[]): boolean {
  const listed = candidates.filter((candidate) =>
    mentionedAlone(request.previousAssistantText, fold(candidate.name), candidates),
  );
  if (listed.length < 2) return false;
  return listed.some((candidate) => {
    const name = fold(candidate.name);
    if (!containsName(request.latestUserText, name)) return false;
    const twins = candidates.filter((other) => other !== candidate && fold(other.name) === name);
    if (twins.length > 0 && !distinguishingWords(request, name)) return false;
    return candidates.every((other) => {
      const otherName = fold(other.name);
      return (
        otherName === name || !holdsName(otherName, name) || !writtenInSomeSpelling(request.latestUserText, otherName)
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
  const written = new Set(
    named
      .filter(
        ({ row, name }) =>
          name.length > 0 &&
          named.some((other) => other.row !== row && holdsName(other.name, name)) &&
          writtenInSomeSpelling(latest, name),
      )
      .map(({ name }) => name),
  );
  return [...written].flatMap((name) => {
    const candidates = named.filter((entry) => holdsName(entry.name, name)).map((entry) => entry.row);
    if (answersClarification(request, candidates)) return [];
    const chosen = candidates.filter((candidate) => namedUniquely(latest, candidate, candidates));
    const unchosen = chosen.reduce((text, candidate) => text.split(fold(candidate.name)).join("\n"), latest);
    if (chosen.length > 0 && !writtenInSomeSpelling(unchosen, name)) return [];
    const remaining = candidates.filter((candidate) => !chosen.includes(candidate));
    if (remaining.length < 2) return [];
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
  const found: AmbiguousTarget[] = [];

  for (const message of messages) {
    const content = (message as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const raw of content) {
      const part = raw as { type?: string; toolName?: string; toolCallId?: string; input?: unknown; output?: unknown };
      if (part.type === "tool-call" && part.toolCallId && typeof part.toolName === "string") {
        const input = part.input && typeof part.input === "object" ? (part.input as Record<string, unknown>) : null;
        const entities = input ? queriedEntities(part.toolName, input) : undefined;
        if (entities !== undefined) reads.set(part.toolCallId, { tool: part.toolName, entities });
        continue;
      }
      if (part.type !== "tool-result" || !part.toolCallId) continue;
      const read = reads.get(part.toolCallId);
      if (!read) continue;
      for (const { entity, rows } of rowSets(unwrap(part.output), read))
        found.push(...targetsAmong(entity, rows, request));
    }
  }

  return found;
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
