import {
  WEBHOOK_EVENT_COUNT,
  WEBHOOK_MESSAGING_EVENT_COUNT,
  WEBHOOK_RECORD_EVENT_COUNT,
} from "@/features/webhook/webhook-event-registry";

import { readMcpRegistryFacts } from "./mcp-registry-facts";

const DERIVED_TOKEN_PATTERN = /\[\[derived\.([^\]]+)\]\]/g;

const MCP_REGISTRY_FACTS = readMcpRegistryFacts();
const MCP_GROUP_FACTS = Object.fromEntries(
  Object.entries(MCP_REGISTRY_FACTS.groups).map(([group, count]) => [`mcp.tools.groups.${group}`, count]),
) as Record<`mcp.tools.groups.${string}`, number>;

const DERIVED_FACTS = {
  "mcp.tools.total": MCP_REGISTRY_FACTS.total,
  "mcp.tools.grouped": MCP_REGISTRY_FACTS.grouped,
  "mcp.tools.alwaysOn": MCP_REGISTRY_FACTS.alwaysOn,
  "mcp.toolsets.count": MCP_REGISTRY_FACTS.toolsets,
  ...MCP_GROUP_FACTS,
  "webhooks.events.total": WEBHOOK_EVENT_COUNT,
  "webhooks.events.records": WEBHOOK_RECORD_EVENT_COUNT,
  "webhooks.events.messaging": WEBHOOK_MESSAGING_EVENT_COUNT,
} as const;

export type DerivedFactToken = keyof typeof DERIVED_FACTS;

export function resolveDerivedToken(token: string): string {
  if (!(token in DERIVED_FACTS)) throw new Error(`Unknown derived token: ${token}`);
  return String(DERIVED_FACTS[token as DerivedFactToken]);
}

export function resolveDerivedTokens(value: string): string {
  const resolved = value.replace(DERIVED_TOKEN_PATTERN, (_match, token: string) => resolveDerivedToken(token));
  if (resolved.includes("[[derived.")) throw new Error("Malformed or unresolved derived token");
  return resolved;
}

export function resolveDerivedTokensDeep<T>(value: T): T {
  if (typeof value === "string") return resolveDerivedTokens(value) as T;
  if (Array.isArray(value)) return value.map(resolveDerivedTokensDeep) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveDerivedTokensDeep(item)])) as T;

  return value;
}
