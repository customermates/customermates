import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildMcpServerCard } from "@/features/mcp-tools/server-card";
import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";

const directory = join(process.cwd(), "public", ".well-known", "mcp");
const card = buildMcpServerCard(ALL_MCP_TOOLS);

mkdirSync(directory, { recursive: true });
writeFileSync(join(directory, "server-card.json"), `${JSON.stringify(card, null, 2)}\n`);
console.log(`MCP server card generated: ${card.tools.length} tool definitions, no tool execution`);
