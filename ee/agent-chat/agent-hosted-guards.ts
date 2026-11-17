export const ROUTINE_DRAFT_GUARD_MESSAGE =
  "A routine created by the assistant must state enabled explicitly: pass enabled false to save it as a draft the user can activate, or enabled true only when the user explicitly asked to activate it.";

const HOSTED_RESULT_MARGIN_CHARS = 500;

function inputRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
}

export function hostedToolInputGuard(toolName: string, input: unknown): string | null {
  if (toolName !== "manage_routines") return null;
  const record = inputRecord(input);
  if (!record || record.action !== "create") return null;
  return typeof record.enabled === "boolean" ? null : ROUTINE_DRAFT_GUARD_MESSAGE;
}

export function hostedToolInput(toolName: string, input: unknown, resultMaxChars: number): unknown {
  if (toolName !== "manage_wiki_pages") return input;
  const record = inputRecord(input);
  if (!record || record.maxChars === undefined) return input;
  const { maxChars, ...rest } = record;
  const limit = resultMaxChars - HOSTED_RESULT_MARGIN_CHARS;
  const requested = Number(maxChars);
  return Number.isFinite(requested) && requested <= limit ? input : rest;
}
