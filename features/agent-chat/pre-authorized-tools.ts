import type { ExtendedUser } from "@/features/user/user.types";

import { ALWAYS_APPROVE_TOOL_NAMES } from "./tool-gating";

/**
 * The per-user "skip the confirmation card for these tools" setting is stored as
 * a `{ toolNames: string[] }` JSON blob on the User row. Parse defensively — the
 * column is untyped JSON and may be null or legacy-shaped.
 */
export function parsePreAuthorizedToolNames(value: unknown): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const list = (value as { toolNames?: unknown }).toolNames;
    if (Array.isArray(list)) return list.filter((name): name is string => typeof name === "string");
  }
  return [];
}

export function getPreAuthorizedToolNames(user: Pick<ExtendedUser, "preAuthorizedAgentTools">): string[] {
  // Some tools (e.g. run_code) can never be pre-authorized away — filter them out
  // here so a stale/forced stored value can't downgrade their approval gate.
  return parsePreAuthorizedToolNames(user.preAuthorizedAgentTools).filter(
    (name) => !ALWAYS_APPROVE_TOOL_NAMES.has(name),
  );
}
