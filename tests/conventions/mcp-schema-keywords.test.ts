import { z } from "zod";
import { describe, expect, it } from "vitest";

import { ALL_MCP_TOOLS, MCP_OPERATOR_TOOLS } from "@/features/mcp-tools/tool-registry";

function nonStandardIdKeywords(node: unknown, path: string, found: string[]) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => nonStandardIdKeywords(item, `${path}[${index}]`, found));
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "id" && typeof value === "string") found.push(`${path}.id`);
    if (key === "properties" && value && typeof value === "object") {
      for (const [name, property] of Object.entries(value))
        nonStandardIdKeywords(property, `${path}.properties.${name}`, found);
      continue;
    }
    nonStandardIdKeywords(value, `${path}.${key}`, found);
  }
}

describe("MCP tool schemas", () => {
  it.each([...ALL_MCP_TOOLS, ...MCP_OPERATOR_TOOLS].map((tool) => [tool.name, tool] as const))(
    "%s publishes JSON schemas without the non-standard id keyword that MCP clients reject",
    (_name, tool) => {
      const found: string[] = [];
      nonStandardIdKeywords(z.toJSONSchema(tool.inputSchema, { io: "input", unrepresentable: "any" }), "input", found);
      if (tool.outputSchema) {
        nonStandardIdKeywords(
          z.toJSONSchema(tool.outputSchema, { io: "output", unrepresentable: "any" }),
          "output",
          found,
        );
      }

      expect(found).toEqual([]);
    },
  );
});
