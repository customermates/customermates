export const AGENT_ENTITY_TYPES = ["contact", "organization", "deal", "service", "task"] as const;
export type AgentEntityType = (typeof AGENT_ENTITY_TYPES)[number];

/**
 * Lightweight context about what the user is currently looking at, sent with each
 * chat request so the agent can resolve phrases like "this deal" without the user
 * pasting ids. Kept deliberately small (route + a single focused entity).
 */
export type AgentPageContext = {
  route?: string;
  entity?: { type: AgentEntityType; id: string };
};

export function parseAgentPageContext(value: unknown): AgentPageContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { route?: unknown; entity?: unknown };

  const context: AgentPageContext = {};
  if (typeof record.route === "string") context.route = record.route;

  if (record.entity && typeof record.entity === "object") {
    const entity = record.entity as { type?: unknown; id?: unknown };
    if (
      typeof entity.id === "string" &&
      typeof entity.type === "string" &&
      (AGENT_ENTITY_TYPES as readonly string[]).includes(entity.type)
    )
      context.entity = { type: entity.type as AgentEntityType, id: entity.id };
  }

  return context;
}
