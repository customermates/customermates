import { ENTITY_UPDATE_TOOL_NAMES } from "./agent-tool-groups";

export type AmbiguousTarget = { entity: string; phrase: string; candidates: { id: string; name: string }[] };

const NAME_QUERY_KEYS = ["searchTerm", "name"] as const;
const MIN_PHRASE_LENGTH = 3;
const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const TOON_ROW = /^\s+([0-9a-fA-F-]{36}),(?:"((?:[^"\\]|\\.)*)"|([^\n,]*))/gm;

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : ""))
    .join(" ");
}

function latestUserText(messages: readonly unknown[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: string; content?: unknown };
    if (message?.role === "user") return textOf(message.content).toLowerCase();
  }
  return null;
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

function rowsOf(output: unknown): { id: string; name: string }[] {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (!record || record.ok !== true || typeof record.result !== "string") return [];
  return [...record.result.matchAll(TOON_ROW)].map((match) => ({
    id: match[1],
    name: (match[2] !== undefined ? unescapeToon(match[2]) : (match[3] ?? "")).trim(),
  }));
}

function unwrap(output: unknown): unknown {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (record && record.type === "json" && "value" in record) return record.value;
  return output;
}

function exactNameInsideAnother(needle: string, candidates: { name: string }[]): boolean {
  return candidates.some(
    (candidate) =>
      candidate.name.toLowerCase() === needle &&
      candidates.some((other) => other !== candidate && other.name.toLowerCase().includes(needle)),
  );
}

function namedUniquely(latest: string, candidates: { name: string }[]): boolean {
  return candidates.some((candidate) => {
    const name = candidate.name.toLowerCase();
    if (!name || !latest.includes(name)) return false;
    return candidates.every((other) => other === candidate || !other.name.toLowerCase().includes(name));
  });
}

export function ambiguousTargetFromMessages(messages: readonly unknown[]): AmbiguousTarget | null {
  const latest = latestUserText(messages);
  if (!latest) return null;

  const calls = new Map<string, { entity: string; phrase: string }>();
  let found: AmbiguousTarget | null = null;

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
        if (!entity || !phrase || !latest.includes(phrase.toLowerCase())) continue;
        calls.set(part.toolCallId, { entity, phrase });
        continue;
      }
      if (part.type !== "tool-result" || !part.toolCallId) continue;
      const call = calls.get(part.toolCallId);
      if (!call) continue;
      const needle = call.phrase.toLowerCase();
      const candidates = rowsOf(unwrap(part.output)).filter((row) => row.name.toLowerCase().includes(needle));
      found =
        candidates.length >= 2 && exactNameInsideAnother(needle, candidates) && !namedUniquely(latest, candidates)
          ? { entity: call.entity, phrase: call.phrase, candidates }
          : null;
    }
  }

  return found;
}

export function withheldToolNamesFor(target: AmbiguousTarget | null): readonly string[] {
  if (!target) return [];
  const updateTool = ENTITY_UPDATE_TOOL_NAMES[target.entity];
  return updateTool ? [updateTool] : [];
}

export function candidateIdsIn(target: AmbiguousTarget, input: unknown): number {
  const ids = new Set((JSON.stringify(input ?? {}).match(UUID) ?? []).map((id) => id.toLowerCase()));
  return target.candidates.filter((candidate) => ids.has(candidate.id.toLowerCase())).length;
}

export function refusesAmbiguousWrite(target: AmbiguousTarget | null, readOnly: boolean, input: unknown): boolean {
  return Boolean(target) && !readOnly && candidateIdsIn(target as AmbiguousTarget, input) === 1;
}

export function ambiguousTargetRefusal(target: AmbiguousTarget): string {
  const names = target.candidates.map((candidate) => `${candidate.name} (${candidate.id})`).join(", ");
  return `More than one ${target.entity} matches "${target.phrase}": ${names}. Nothing was changed. Ask the user which one they mean, or act on all of them only if they asked for every match.`;
}
