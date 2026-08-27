import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { MCP_ALWAYS_ON_TOOLS, MCP_TOOL_GROUPS } from "@/features/mcp-tools/tool-registry";
import type { McpTool } from "@/features/mcp-tools/mcp-tool";
import { CONTENT_LOCALES, type ContentLocale } from "@/i18n/locale-registry";

const ROOT = process.cwd();
const summariesPath = (locale: ContentLocale) => join(ROOT, "content", "docs", locale, "mcp-catalog-summaries.json");

export const CATALOG_SECTIONS: Record<string, McpTool[]> = {
  records: MCP_TOOL_GROUPS.records,
  workspace: MCP_TOOL_GROUPS.workspace,
  messaging: MCP_TOOL_GROUPS.messaging,
  social: MCP_TOOL_GROUPS.social,
  docs: [...MCP_TOOL_GROUPS.docs, ...MCP_ALWAYS_ON_TOOLS],
  "custom-columns": MCP_TOOL_GROUPS["custom-columns"],
  widgets: MCP_TOOL_GROUPS.widgets,
  webhooks: MCP_TOOL_GROUPS.webhooks,
  admin: MCP_TOOL_GROUPS.admin,
  support: MCP_TOOL_GROUPS.support,
};

export type CatalogSummaries = Record<string, string>;

export function renderCatalogTable(section: string, locale: ContentLocale, summaries: CatalogSummaries): string {
  const tools = CATALOG_SECTIONS[section];
  if (!tools) throw new Error(`Unknown catalog section "${section}"`);
  const purposeHeader = summaries.$purposeHeader ?? "Purpose";
  const lines = [`| Tool | Read | Destructive | ${purposeHeader} |`, "|---|---|---|---|"];
  for (const tool of tools) {
    const summary = summaries[tool.name];
    if (!summary) throw new Error(`Tool "${tool.name}" has no ${locale} summary in ${summariesPath(locale)}`);
    const read = tool.annotations?.readOnlyHint ? "✓" : "";
    const destructive = tool.annotations?.destructiveHint ? "✓" : "";
    lines.push(`| \`${tool.name}\` | ${read} | ${destructive} | ${summary} |`);
  }
  return lines.join("\n");
}

export function applyCatalogTables(source: string, locale: ContentLocale, summaries: CatalogSummaries): string {
  return source.replace(
    /(\{\/\* mcp-catalog:([a-z-]+) \*\/\}\n)[\s\S]*?(\n\{\/\* \/mcp-catalog \*\/\})/g,
    (_match, open: string, section: string, close: string) =>
      `${open}${renderCatalogTable(section, locale, summaries)}${close}`,
  );
}

function main() {
  for (const locale of CONTENT_LOCALES) {
    const summaries = JSON.parse(readFileSync(summariesPath(locale), "utf8")) as CatalogSummaries;
    const path = join(ROOT, "content", "docs", locale, "mcp.mdx");
    const source = readFileSync(path, "utf8");
    const next = applyCatalogTables(source, locale, summaries);
    if (next !== source) writeFileSync(path, next);
    const sections = [...next.matchAll(/\{\/\* mcp-catalog:([a-z-]+) \*\/\}/g)].map((m) => m[1]);
    const missing = Object.keys(CATALOG_SECTIONS).filter((key) => !sections.includes(key));
    if (missing.length > 0) throw new Error(`${path} is missing catalog markers for: ${missing.join(", ")}`);
    console.log(`${path}: ${sections.length} catalog tables generated`);
  }
}

if (process.argv[1]?.endsWith("generate-mcp-catalog.ts")) main();
