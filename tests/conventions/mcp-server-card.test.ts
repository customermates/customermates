import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { buildMcpServerCard } from "@/features/mcp-tools/server-card";
import { MCP_GET_STARTED_PROMPT_INFO, MCP_SERVER_INFO } from "@/features/mcp-tools/server-metadata";

import { REPO_ROOT } from "./walk";

describe("public MCP server card", () => {
  it("publishes definitions without running tools or publishing their implementation", () => {
    const execute = vi.fn(() => "private workspace data");
    const card = buildMcpServerCard([
      {
        name: "example",
        title: "Example",
        description: "A public tool definition",
        inputSchema: z.object({ value: z.string().transform((value) => value.length) }),
        outputSchema: z.object({ length: z.number() }),
        annotations: { readOnlyHint: true },
        execute,
      },
    ]);

    expect(execute).not.toHaveBeenCalled();
    expect(JSON.stringify(card)).not.toContain("private workspace data");
    expect(card.serverInfo).toEqual(MCP_SERVER_INFO);
    expect(card.authentication).toEqual({ required: true, schemes: ["oauth2", "apiKey"] });
    expect(card.resources).toEqual([]);
    expect(card.prompts).toEqual([MCP_GET_STARTED_PROMPT_INFO]);
    expect(card.tools[0]).not.toHaveProperty("execute");
    expect(card.tools[0].inputSchema).toMatchObject({
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    });
    expect(card.tools[0].outputSchema).toMatchObject({
      type: "object",
      properties: { length: { type: "number" } },
    });
  });

  it("keeps the checked-in public card current with every registered tool", async () => {
    const { ALL_MCP_TOOLS } = await import("@/features/mcp-tools/tool-registry");
    const stored = JSON.parse(readFileSync(join(REPO_ROOT, "public/.well-known/mcp/server-card.json"), "utf8"));

    expect(stored, "Public metadata drifted; run yarn mcp:generate-card").toEqual(buildMcpServerCard(ALL_MCP_TOOLS));
  }, 120_000);
});
