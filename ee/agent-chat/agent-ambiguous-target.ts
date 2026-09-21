import { MUTATING_ENTITY_TOOL_NAMES } from "./agent-tool-groups";

export type AmbiguousTarget = { entity: string; phrase: string; candidates: { id: string; name: string }[] };

const NAME_QUERY_KEYS = ["searchTerm", "name"] as const;
const MIN_PHRASE_LENGTH = 3;

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : ""))
    .join(" ");
}

function userPhrases(messages: readonly unknown[]): string[] {
  return messages
    .filter((message) => (message as { role?: string })?.role === "user")
    .map((message) => textOf((message as { content?: unknown }).content));
}

function nameQuery(input: unknown): string | null {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  if (!record) return null;
  for (const key of NAME_QUERY_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length >= MIN_PHRASE_LENGTH) return value.trim();
  }
  const filters = record.filters;
  if (!Array.isArray(filters)) return null;
  for (const raw of filters) {
    const filter = raw as { field?: unknown; value?: unknown };
    if (filter?.field !== "name" || typeof filter.value !== "string") continue;
    if (filter.value.trim().length >= MIN_PHRASE_LENGTH) return filter.value.trim();
  }
  return null;
}

function itemsOf(output: unknown): { id: string; name: string }[] {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (!record || record.ok !== true || typeof record.result !== "string") return [];
  return [...record.result.matchAll(/^\s{2}([0-9a-fA-F-]{36}),([^\n,]+)/gm)].map((match) => ({
    id: match[1],
    name: match[2].trim(),
  }));
}

export function ambiguousTargetFromMessages(messages: readonly unknown[]): AmbiguousTarget | null {
  const phrases = userPhrases(messages);
  if (phrases.length === 0) return null;

  const calls = new Map<string, { entity: string; phrase: string }>();
  let found: AmbiguousTarget | null = null;

  for (const message of messages) {
    const content = (message as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const raw of content) {
      const part = raw as { type?: string; toolName?: string; toolCallId?: string; input?: unknown; output?: unknown };
      if (part.type === "tool-call" && part.toolCallId && typeof part.toolName === "string") {
        if (part.toolName !== "list_records" && part.toolName !== "search_records") continue;
        const phrase = nameQuery(part.input);
        const entity = (part.input as { entity?: unknown })?.entity;
        if (!phrase || typeof entity !== "string") continue;
        if (!phrases.some((text) => text.toLowerCase().includes(phrase.toLowerCase()))) continue;
        calls.set(part.toolCallId, { entity, phrase });
        continue;
      }
      if (part.type !== "tool-result" || !part.toolCallId) continue;
      const call = calls.get(part.toolCallId);
      if (!call) continue;
      const matches = itemsOf(unwrap(part.output)).filter((item) =>
        item.name.toLowerCase().includes(call.phrase.toLowerCase()),
      );
      found = matches.length > 1 ? { entity: call.entity, phrase: call.phrase, candidates: matches } : null;
    }
  }

  return found;
}

function unwrap(output: unknown): unknown {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (record && record.type === "json" && "value" in record) return record.value;
  return output;
}

export function withheldToolNamesFor(target: AmbiguousTarget | null): readonly string[] {
  if (!target) return [];
  return MUTATING_ENTITY_TOOL_NAMES[target.entity] ?? [];
}

export function ambiguousTargetRefusal(target: AmbiguousTarget): string {
  const names = target.candidates.map((candidate) => `${candidate.name} (${candidate.id})`).join(", ");
  return `More than one ${target.entity} matches "${target.phrase}": ${names}. Ask the user which one they mean and write only after they answer.`;
}

export function writeCoversEveryCandidate(target: AmbiguousTarget, input: unknown): boolean {
  const ids = new Set(
    JSON.stringify(input ?? {})
      .match(/[0-9a-fA-F-]{36}/g)
      ?.map((id) => id.toLowerCase()) ?? [],
  );
  return target.candidates.every((candidate) => ids.has(candidate.id.toLowerCase()));
}
