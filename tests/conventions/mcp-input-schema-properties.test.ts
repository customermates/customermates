import { z } from "zod";
import { describe, expect, it } from "vitest";
import { normalizeObjectSchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";

import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";

const NO_INPUT_TOOLS = new Set<string>();

function advertisedInputSchema(schema: z.ZodType) {
  const strict = schema instanceof z.ZodObject ? schema.strict() : schema;
  const object = normalizeObjectSchema(strict);
  if (!object) return { type: "object", properties: {} };
  return toJsonSchemaCompat(object, {
    strictUnions: true,
    pipeStrategy: "input",
  }) as {
    properties?: Record<string, unknown>;
  };
}

describe("MCP tool input schemas", () => {
  it.each(ALL_MCP_TOOLS.map((tool) => [tool.name, tool] as const))(
    "%s advertises its inputs to schema-driven clients",
    (name, tool) => {
      const properties = Object.keys(
        advertisedInputSchema(tool.inputSchema).properties ?? {},
      );
      if (NO_INPUT_TOOLS.has(name)) {
        expect(properties).toEqual([]);
        return;
      }
      expect(
        properties.length,
        `${name} exports an input schema without properties`,
      ).toBeGreaterThan(0);
    },
  );
});
