import { decode } from "@toon-format/toon";

export type AmbiguousTarget = { entity: string; phrase: string; candidates: { id: string; name: string }[] };

export type AmbiguityRequest = { latestUserText: string; previousAssistantText: string };

const NAME_QUERY_KEYS = ["searchTerm", "name"] as const;
const MIN_PHRASE_LENGTH = 3;
const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const TOON_TABLE_ROW = /^\s+([0-9a-fA-F-]{36}),(?:"((?:[^"\\]|\\.)*)"|([^\n,]*))/gm;
const TOON_LIST_ROW = /^\s*-\s+id:\s*([0-9a-fA-F-]{36})\s*\n\s+name:\s*(?:"((?:[^"\\]|\\.)*)"|([^\n]*))/gm;
const UNSPACED_SCRIPTS = ["Han", "Hiragana", "Katakana", "Thai", "Lao", "Khmer", "Myanmar"]
  .map((script) => `\\p{scx=${script}}`)
  .join("");
const WORD_CHAR = `[[\\p{L}\\p{N}\\p{M}\\u200c\\u200d]--[${UNSPACED_SCRIPTS}]]`;

type Row = { id: string; name: string };

function fold(text: string): string {
  return text.normalize("NFC").toLowerCase();
}

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function startsWordWith(text: string, phrase: string): boolean {
  if (!phrase) return false;
  return new RegExp(`(?<!${WORD_CHAR})${escapeName(phrase)}`, "v").test(text);
}

function containsName(text: string, name: string): boolean {
  if (!name) return false;
  return new RegExp(`(?<!${WORD_CHAR})${escapeName(name)}(?:['’]?s)?(?!${WORD_CHAR})`, "v").test(text);
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

function nameQuery(input: Record<string, unknown>): string | null {
  for (const key of NAME_QUERY_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length >= MIN_PHRASE_LENGTH) return value.trim();
  }
  const filters = input.filters;
  if (!Array.isArray(filters)) return null;
  for (const raw of filters) {
    const filter = raw as { field?: unknown; value?: unknown };
    if (filter?.field !== "name" || typeof filter.value !== "string") continue;
    if (filter.value.trim().length >= MIN_PHRASE_LENGTH) return filter.value.trim();
  }
  return null;
}

function queriedEntity(toolName: string, input: Record<string, unknown>): string | null {
  if (toolName === "list_records") return typeof input.entity === "string" ? input.entity : null;
  if (toolName !== "search_records") return null;
  const entities = input.entities;
  return Array.isArray(entities) && entities.length === 1 && typeof entities[0] === "string" ? entities[0] : null;
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

function decodedRows(text: string, entity: string): Row[] | null {
  try {
    const decoded = decode(text) as { items?: unknown; results?: { entity?: unknown; items?: unknown }[] };
    if (Array.isArray(decoded?.items)) return rowsFromItems(decoded.items);
    const result = Array.isArray(decoded?.results)
      ? decoded.results.find((entry) => entry.entity === entity)
      : undefined;
    return result ? rowsFromItems(result.items) : null;
  } catch {
    return null;
  }
}

function matchedRows(text: string, pattern: RegExp): Row[] {
  return [...text.matchAll(pattern)].map((match) => ({
    id: match[1],
    name: (match[2] !== undefined ? unescapeToon(match[2]) : (match[3] ?? "")).trim(),
  }));
}

function rowsOf(output: unknown, entity: string): Row[] {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (!record || record.ok !== true || typeof record.result !== "string") return [];
  return (
    decodedRows(record.result, entity) ?? [
      ...matchedRows(record.result, TOON_TABLE_ROW),
      ...matchedRows(record.result, TOON_LIST_ROW),
    ]
  );
}

function unwrap(output: unknown): unknown {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (record && record.type === "json" && "value" in record) return record.value;
  return output;
}

function exactNameInsideAnother(needle: string, candidates: Row[]): boolean {
  return candidates.some(
    (candidate) =>
      fold(candidate.name) === needle &&
      candidates.some((other) => other !== candidate && fold(other.name).includes(needle)),
  );
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
      return other === candidate || !otherName.includes(name) || !containsName(request.latestUserText, otherName);
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

export function ambiguousTargetsFromMessages(
  messages: readonly unknown[],
  request: AmbiguityRequest,
): AmbiguousTarget[] {
  const latest = request.latestUserText;
  if (!latest) return [];

  const calls = new Map<string, { entity: string; phrase: string }>();
  const found: AmbiguousTarget[] = [];

  for (const message of messages) {
    const content = (message as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const raw of content) {
      const part = raw as { type?: string; toolName?: string; toolCallId?: string; input?: unknown; output?: unknown };
      if (part.type === "tool-call" && part.toolCallId && typeof part.toolName === "string") {
        const input = part.input && typeof part.input === "object" ? (part.input as Record<string, unknown>) : null;
        if (!input) continue;
        const entity = queriedEntity(part.toolName, input);
        const phrase = nameQuery(input);
        if (!entity || !phrase || !startsWordWith(latest, fold(phrase))) continue;
        calls.set(part.toolCallId, { entity, phrase });
        continue;
      }
      if (part.type !== "tool-result" || !part.toolCallId) continue;
      const call = calls.get(part.toolCallId);
      if (!call) continue;
      const needle = fold(call.phrase);
      const candidates = rowsOf(unwrap(part.output), call.entity).filter((row) => fold(row.name).includes(needle));
      if (candidates.length < 2 || !exactNameInsideAnother(needle, candidates)) continue;
      if (namedUniquely(latest, candidates) || answersClarification(request, candidates)) continue;
      found.push({ entity: call.entity, phrase: call.phrase, candidates });
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
