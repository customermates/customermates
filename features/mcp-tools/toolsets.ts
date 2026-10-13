export const MCP_TOOLSET_KEYS = [
  "records",
  "record-model",
  "workspace",
  "views",
  "wiki",
  "messaging",
  "social",
  "docs",
  "widgets",
  "routines",
  "webhooks",
  "admin",
  "support",
] as const;

export const MCP_TOOLSET_DISCOVERY_TOOL_NAMES: Record<string, readonly string[]> = {
  "record-model": ["discover_record_types", "get_record_model", "read_crm_operation"],
  widgets: ["discover_record_types", "get_record_model"],
  routines: ["discover_record_types", "get_record_model"],
  webhooks: ["discover_record_types", "get_record_model"],
};

export function mcpToolsForToolsets<T extends { name: string }>(
  toolGroups: Record<string, T[]>,
  keys: readonly string[],
  alwaysOn: readonly T[] = [],
): T[] {
  const byName = new Map(Object.values(toolGroups).flatMap((tools) => tools.map((tool) => [tool.name, tool] as const)));
  const tools = [
    ...keys.flatMap((key) => [
      ...(toolGroups[key] ?? []),
      ...(MCP_TOOLSET_DISCOVERY_TOOL_NAMES[key] ?? []).flatMap((name) => byName.get(name) ?? []),
    ]),
    ...alwaysOn,
  ];
  return [...new Map(tools.map((tool) => [tool.name, tool])).values()];
}
