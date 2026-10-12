import { z } from "zod";
import { describe, expect, it } from "vitest";

import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";

type JsonObject = {
  properties?: Record<string, { enum?: string[]; description?: string }>;
};

function actionFieldLists(tool: (typeof ALL_MCP_TOOLS)[number]) {
  const schema = z.toJSONSchema(tool.inputSchema, {
    io: "input",
    unrepresentable: "any",
  }) as JsonObject;
  const action = schema.properties?.action;
  if (!action?.enum || !action.description) return null;
  const actions = new Set(action.enum);
  const lists = [
    ...action.description.matchAll(
      /(?:^|; )([a-z_]+): ([A-Za-z]+(?:, [A-Za-z]+)*)(?=[;.]|$)/g,
    ),
  ]
    .filter(([, name]) => actions.has(name))
    .map(([, name, fields]) => ({ action: name, fields: fields.split(", ") }));
  return { properties: new Set(Object.keys(schema.properties ?? {})), lists };
}

describe("MCP action field descriptions", () => {
  it("pins the manage_wiki_pages update fields to its schema", () => {
    const tool = ALL_MCP_TOOLS.find(
      (candidate) => candidate.name === "manage_wiki_pages",
    );
    const parsed = tool ? actionFieldLists(tool) : null;

    expect(
      parsed?.lists.find((list) => list.action === "update")?.fields,
    ).toEqual([
      "id",
      "expectedUpdatedAt",
      "title",
      "markdown",
      "kind",
      "whenToUse",
    ]);
  });

  it.each(ALL_MCP_TOOLS.map((tool) => [tool.name, tool] as const))(
    "%s names only real input fields in its per-action field lists",
    (_name, tool) => {
      const parsed = actionFieldLists(tool);
      if (!parsed) return;
      const unknown = parsed.lists.flatMap((list) =>
        list.fields
          .filter((field) => !parsed.properties.has(field))
          .map((field) => `${list.action}: ${field}`),
      );

      expect(unknown).toEqual([]);
    },
  );
});
