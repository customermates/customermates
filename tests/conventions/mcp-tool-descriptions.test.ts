import { z } from "zod";
import { describe, expect, it } from "vitest";

import type { McpTool } from "@/features/mcp-tools/mcp-tool";

import { TOOL_GUIDANCE } from "@/features/mcp-tools/tool-guidance";
import { ALL_MCP_TOOLS_WITH_OPERATOR } from "@/features/mcp-tools/tool-registry";

const TOOLS: readonly McpTool[] = ALL_MCP_TOOLS_WITH_OPERATOR;
const NAMES = TOOLS.map((tool) => tool.name);
const COMMON_WORD_NAMES = new Set(["search", "fetch"]);

const MODEL_DIRECTIVES: readonly RegExp[] = [
  /\buse (this|it|them)\b/i,
  /\b(call|calls|calling|called|invoke|invoking)\b/i,
  /\byou\b|\byour\b|\byourself\b/i,
  /\b(do not|don't|never|always|should|prefer|instead)\b/i,
  /\b(ask|tell|confirm with|check with) the user\b/i,
  /\bbefore (calling|using|running)\b/i,
  /\bnext\b/i,
];

function schemaDescriptions(schema: z.ZodType, io: "input" | "output"): string[] {
  const found: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "description" && typeof value === "string") found.push(value);
      else visit(value);
    }
  };
  visit(z.toJSONSchema(schema, { target: "draft-07", io, unrepresentable: "any" }));
  return found;
}

function texts(tool: McpTool): { where: string; text: string }[] {
  return [
    { where: "description", text: tool.description },
    { where: "title", text: tool.title },
    ...schemaDescriptions(tool.inputSchema, "input").map((text) => ({ where: "input schema", text })),
    ...(tool.outputSchema
      ? schemaDescriptions(tool.outputSchema, "output").map((text) => ({ where: "output schema", text }))
      : []),
  ];
}

function otherToolNames(tool: McpTool, text: string): string[] {
  return NAMES.filter(
    (name) => name !== tool.name && !COMMON_WORD_NAMES.has(name) && new RegExp(`\\b${name}\\b`).test(text),
  );
}

describe("MCP tool descriptions describe only their own tool (Claude connector directory policy)", () => {
  it("never name another tool in a tool, input or output description", () => {
    const offences = TOOLS.flatMap((tool) =>
      texts(tool).flatMap(({ where, text }) =>
        otherToolNames(tool, text).map((name) => `${tool.name} ${where} names ${name}: ${text.slice(0, 120)}`),
      ),
    );
    expect(offences).toEqual([]);
  });

  it("never address or steer the model; workflow guidance lives in the server instructions", () => {
    const offences = TOOLS.flatMap((tool) =>
      texts(tool).flatMap(({ where, text }) =>
        MODEL_DIRECTIVES.filter((pattern) => pattern.test(text)).map(
          (pattern) => `${tool.name} ${where} matches ${pattern}: ${text.slice(0, 160)}`,
        ),
      ),
    );
    expect(offences).toEqual([]);
  });

  it("keeps guidance only for tools that exist", () => {
    expect(Object.keys(TOOL_GUIDANCE).filter((name) => !NAMES.includes(name))).toEqual([]);
  });
});
