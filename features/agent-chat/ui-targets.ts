"use client";

import { useEffect } from "react";

/**
 * Registry of UI components the agent is allowed to point at (highlight / tour).
 *
 * Components opt in by (a) carrying a `data-agent-id="<id>"` attribute so the
 * overlay can find the element, and (b) registering an `{ id, description, route }`
 * entry so the agent can discover what's available via the list_ui_targets tool.
 * This keeps the agent's reach to a curated, human-described surface — it can't
 * target arbitrary DOM.
 */
export type AgentTarget = { id: string; description: string; route?: string };

const targets = new Map<string, AgentTarget>();

export function registerAgentTargets(entries: AgentTarget[]): () => void {
  for (const entry of entries) targets.set(entry.id, entry);
  return () => {
    for (const entry of entries) targets.delete(entry.id);
  };
}

export function listAgentTargets(): AgentTarget[] {
  return [...targets.values()];
}

export function findAgentTargetElement(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[data-agent-id="${CSS.escape(id)}"]`);
}

export const agentTargetAttr = (id: string) => ({ "data-agent-id": id });

/**
 * Tag a single component as an agent target. One call does both jobs — registers
 * the catalog entry and returns the `data-agent-id` prop to spread — so the id is
 * written once and the tag can never drift from the registration.
 *
 *   <Button {...useAgentTarget("contacts.create", "Create a new contact")}>New</Button>
 */
export function useAgentTarget(
  id: string,
  description: string,
  opts?: { route?: string },
): { "data-agent-id": string } {
  const route = opts?.route;
  useEffect(() => registerAgentTargets([{ id, description, route }]), [id, description, route]);
  return { "data-agent-id": id };
}

/** Register a set of targets in bulk (for lists); spread agentTargetAttr(id) on each element. */
export function useAgentTargets(entries: AgentTarget[]): void {
  const signature = JSON.stringify(entries);
  useEffect(() => registerAgentTargets(entries), [signature]); // eslint-disable-line react-hooks/exhaustive-deps
}
