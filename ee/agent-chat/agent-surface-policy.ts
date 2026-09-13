export type AgentSurface = "chat" | "routine";

export const AGENT_APPROVAL_WINDOW_MS = 30 * 60 * 1000;

export function isUnattendedSurface(surface: AgentSurface): boolean {
  return surface === "routine";
}

export function approvalWindowMsForSurface(surface: AgentSurface): number {
  return isUnattendedSurface(surface) ? 0 : AGENT_APPROVAL_WINDOW_MS;
}
