import type { AgentToolIdentity } from "./tool-identity";

import { isInternalToolIdentity } from "./tool-identity";
import { isUnattendedSurface, type AgentSurface } from "./agent-surface-policy";

export const WIKI_PROPOSAL_TOOL_NAME = "manage_wiki_pages";

const WIKI_PROPOSAL_ACTIONS: ReadonlySet<string> = new Set(["create", "update", "delete"]);

export function isWikiProposalAction(action: unknown): boolean {
  return typeof action === "string" && WIKI_PROPOSAL_ACTIONS.has(action);
}

export function isWikiProposalWrite(identity: AgentToolIdentity, input: unknown, surface: AgentSurface | undefined) {
  if (!surface || !isUnattendedSurface(surface)) return false;
  if (!isInternalToolIdentity(identity) || identity.name !== WIKI_PROPOSAL_TOOL_NAME) return false;
  const action =
    input && typeof input === "object" && !Array.isArray(input) ? (input as { action?: unknown }).action : undefined;
  return isWikiProposalAction(action);
}
