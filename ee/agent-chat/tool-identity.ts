export const AGENT_TOOL_SOURCES = [
  "internal-mcp",
  "gateway-tool",
  "provider-native",
  "external-mcp",
  "sandbox",
] as const;

export type AgentToolSource = (typeof AGENT_TOOL_SOURCES)[number];

export type AgentToolIdentity = {
  source: AgentToolSource;
  serverId: string | null;
  name: string;
};

const IDENTITY_SEPARATOR = "::";

export function internalToolIdentity(name: string): AgentToolIdentity {
  return { source: "internal-mcp", serverId: null, name };
}

export function isInternalToolIdentity(identity: AgentToolIdentity) {
  return identity.source === "internal-mcp" && identity.serverId === null;
}

export function agentToolIdentityKey(identity: AgentToolIdentity) {
  return [identity.source, identity.serverId ?? "", identity.name].join(IDENTITY_SEPARATOR);
}

export function parseAgentToolIdentityKey(key: string): AgentToolIdentity | null {
  const parts = key.split(IDENTITY_SEPARATOR);
  if (parts.length !== 3) return null;

  const [source, serverId, name] = parts;
  if (!name || !(AGENT_TOOL_SOURCES as readonly string[]).includes(source)) return null;

  return { source: source as AgentToolSource, serverId: serverId || null, name };
}
