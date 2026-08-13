import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import { countMcpTools, MCP_TOOL_COUNT } from "@/features/mcp-tools/tool-registry";

const TOOL_NAME_PATTERN = /^ {2}name: ["']([a-z0-9_]+)["'],?$/gm;

function declaredToolNames(): string[] {
  const files = walkFiles(join(REPO_ROOT, "features", "mcp-tools"), (path) => path.endsWith(".mcp-tools.ts"));
  return files.flatMap((file) => [...readFileSync(file, "utf8").matchAll(TOOL_NAME_PATTERN)].map((match) => match[1]));
}

describe("published MCP tool count", () => {
  it("requires every tool name to be globally unique", () => {
    const names = declaredToolNames();
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

    expect([...new Set(duplicates)]).toEqual([]);
  });

  it("renders the declaration-derived count without a numeric literal", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const response = GET();
    const text = await response.text();
    const source = readFileSync(join(REPO_ROOT, "app", "llms.txt", "route.ts"), "utf8");

    expect(MCP_TOOL_COUNT).toBe(declaredToolNames().length);
    expect(() => countMcpTools([{ name: "duplicate" }, { name: "duplicate" }])).toThrow(
      "Duplicate MCP tool names: duplicate",
    );
    expect(text).toContain(`(${MCP_TOOL_COUNT} tools)`);
    expect(source).toContain("(${MCP_TOOL_COUNT} tools)");
    expect(source).not.toMatch(/\(\d+ tools\)/);
  }, 30_000);
});
