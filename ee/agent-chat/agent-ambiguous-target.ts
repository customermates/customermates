import { decode } from "@toon-format/toon";

export type AmbiguousTarget = { entity: string; phrase: string; candidates: { id: string; name: string }[] };

export type AmbiguityRequest = { latestUserText: string; previousAssistantText: string };

const NAME_QUERY_KEYS = ["searchTerm", "name"] as const;
const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const TOON_TABLE_ROW = /^\s+([0-9a-fA-F-]{36}),(?:"((?:[^"\\]|\\.)*)"|([^\n,]*))/gm;
const TOON_LIST_ROW = /^\s*-\s+id:\s*([0-9a-fA-F-]{36})\s*\n\s+name:\s*(?:"((?:[^"\\]|\\.)*)"|([^\n]*))/gm;
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

type Row = { id: string; name: string };
type NameRead = { tool: string; entities: string[] | null };

function fold(text: string): string {
  return text
    .replace(/[‘’ʼ´`′ʹ]/g, "'")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{Variation_Selector}/gu, "")
    .replace(/[\n\r\v\f\u0085\u2028\u2029]+/g, "\n")
    .replace(/[^\S\n]+/g, " ");
}

function loose(text: string): string {
  return text.replace(/\p{Pd}/gu, " ").replace(/\s+/g, " ");
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

function startsWordWith(text: string, phrase: string): boolean {
  const [first] = [...phrase];
  if (!first) return false;
  if (UNSPACED_CHAR.test(first)) return text.includes(phrase);
  return someOccurrence(text, phrase, (start) => !WORD_BEFORE_PHRASE.test(codePointBefore(text, start)));
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

function filterValue(filters: unknown[], field: string): string | null {
  for (const raw of filters) {
    const filter = raw as { field?: unknown; value?: unknown };
    if (filter?.field === field && typeof filter.value === "string" && filter.value.trim()) return filter.value.trim();
  }
  return null;
}

function nameQuery(input: Record<string, unknown>): string | null {
  for (const key of NAME_QUERY_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const filters = Array.isArray(input.filters) ? input.filters : [];
  const parts = [filterValue(filters, "firstName"), filterValue(filters, "lastName")].filter(
    (part): part is string => part !== null,
  );
  return filterValue(filters, "name") ?? (parts.length > 0 ? parts.join(" ") : null);
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

function matchedRows(text: string, pattern: RegExp): Row[] {
  return [...text.matchAll(pattern)].map((match) => ({
    id: match[1],
    name: (match[2] !== undefined ? unescapeToon(match[2]) : (match[3] ?? "")).trim(),
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

function rowSets(output: unknown, read: NameRead): { entity: string; rows: Row[] }[] {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (!record || record.ok !== true || typeof record.result !== "string") return [];
  const value = decoded(record.result);
  if (value && read.tool === "list_records") {
    return read.entities && Array.isArray(value.items)
      ? [{ entity: read.entities[0], rows: rowsFromItems(value.items) }]
      : [];
  }

  if (value) {
    const results = Array.isArray(value.results) ? (value.results as { entity?: unknown; items?: unknown }[]) : [];
    return results.flatMap((entry) =>
      typeof entry?.entity === "string" && (!read.entities || read.entities.includes(entry.entity))
        ? [{ entity: entry.entity, rows: rowsFromItems(entry.items) }]
        : [],
    );
  }
  if (read.entities?.length !== 1) return [];
  const rows = [...matchedRows(record.result, TOON_TABLE_ROW), ...matchedRows(record.result, TOON_LIST_ROW)];
  return [{ entity: read.entities[0], rows }];
}

function unwrap(output: unknown): unknown {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (record && record.type === "json" && "value" in record) return record.value;
  return output;
}

function namedUniquely(latest: string, candidates: Row[]): boolean {
  return candidates.some((candidate) => {
    const name = fold(candidate.name);
    if (!containsName(latest, name)) return false;
    return candidates.every((other) => other === candidate || !fold(other.name).includes(name));
  });
}

function mentionedAlone(text: string, name: string, candidates: Row[]): boolean {
  const longer = candidates
    .map((candidate) => fold(candidate.name))
    .filter((other) => other !== name && other.includes(name));
  const remaining = longer.reduce((rest, other) => rest.split(other).join(" "), text);
  return containsName(remaining, name);
}

function answersClarification(request: AmbiguityRequest, candidates: Row[]): boolean {
  const listed = candidates.filter((candidate) =>
    mentionedAlone(request.previousAssistantText, fold(candidate.name), candidates),
  );
  if (listed.length < 2) return false;
  return listed.some((candidate) => {
    const name = fold(candidate.name);
    if (!containsName(request.latestUserText, name)) return false;
    return candidates.every((other) => {
      const otherName = fold(other.name);
      return other === candidate || !otherName.includes(name) || !startsWordWith(request.latestUserText, otherName);
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

function targetsAmong(entity: string, rows: Row[], request: AmbiguityRequest, spokenText: string): AmbiguousTarget[] {
  const named = rows.map((row) => ({ row, name: fold(row.name) }));
  const written = new Set(
    named
      .filter(
        ({ row, name }) =>
          name.length > 0 &&
          named.some((other) => other.row !== row && other.name.includes(name)) &&
          startsWordWith(spokenText, loose(name)),
      )
      .map(({ name }) => name),
  );
  return [...written].flatMap((name) => {
    const candidates = named.filter((entry) => entry.name.includes(name)).map((entry) => entry.row);
    if (namedUniquely(request.latestUserText, candidates) || answersClarification(request, candidates)) return [];
    const phrase = candidates.find((candidate) => fold(candidate.name) === name)?.name ?? name;
    return [{ entity, phrase, candidates }];
  });
}

export function ambiguousTargetsFromMessages(
  messages: readonly unknown[],
  request: AmbiguityRequest,
): AmbiguousTarget[] {
  if (!request.latestUserText) return [];
  const spokenText = loose(request.latestUserText);

  const reads = new Map<string, NameRead>();
  const found: AmbiguousTarget[] = [];

  for (const message of messages) {
    const content = (message as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const raw of content) {
      const part = raw as { type?: string; toolName?: string; toolCallId?: string; input?: unknown; output?: unknown };
      if (part.type === "tool-call" && part.toolCallId && typeof part.toolName === "string") {
        const input = part.input && typeof part.input === "object" ? (part.input as Record<string, unknown>) : null;
        if (!input) continue;
        const entities = queriedEntities(part.toolName, input);
        if (entities === undefined || !nameQuery(input)) continue;
        reads.set(part.toolCallId, { tool: part.toolName, entities });
        continue;
      }
      if (part.type !== "tool-result" || !part.toolCallId) continue;
      const read = reads.get(part.toolCallId);
      if (!read) continue;
      for (const { entity, rows } of rowSets(unwrap(part.output), read))
        found.push(...targetsAmong(entity, rows, request, spokenText));
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
  return `More than one ${target.entity} matches "${target.phrase}": ${names}. Nothing was changed. Ask the user which one they mean, or act on all of them only if they asked for every match.`;
}
