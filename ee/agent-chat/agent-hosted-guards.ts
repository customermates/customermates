export const ROUTINE_DRAFT_GUARD_MESSAGE =
  "A routine created by the assistant must state enabled explicitly: pass enabled false to save it as a draft the user can activate, or enabled true only when the user explicitly asked to activate it.";

export function hostedToolInputGuard(toolName: string, input: unknown): string | null {
  if (toolName !== "manage_routines") return null;
  const record =
    input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  if (!record || record.action !== "create") return null;
  return typeof record.enabled === "boolean" ? null : ROUTINE_DRAFT_GUARD_MESSAGE;
}
