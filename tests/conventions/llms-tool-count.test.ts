import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import {
  ALL_MCP_TOOLS,
  countMcpTools,
  MCP_TOOL_COUNT,
  offeredMcpToolCount,
} from "@/features/mcp-tools/tool-registry";
import { env } from "@/env";

const TOOL_NAME_PATTERN = /^ {2}name: ["']([a-z0-9_]+)["'],?$/gm;

function declaredToolNames(): string[] {
  const files = walkFiles(join(REPO_ROOT, "features", "mcp-tools"), (path) =>
    path.endsWith(".mcp-tools.ts"),
  );
  return files.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(TOOL_NAME_PATTERN)].map(
      (match) => match[1],
    ),
  );
}

describe("published MCP tool count", () => {
  it("requires every tool name to be globally unique", () => {
    const names = declaredToolNames();
    const duplicates = names.filter(
      (name, index) => names.indexOf(name) !== index,
    );

    expect([...new Set(duplicates)]).toEqual([]);
  });

  it("renders the declaration-derived count without a numeric literal", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const response = GET();
    const text = await response.text();
    const source = readFileSync(
      join(REPO_ROOT, "app", "llms.txt", "route.ts"),
      "utf8",
    );

    const declared = new Set(declaredToolNames());
    const published = ALL_MCP_TOOLS.map((tool) => tool.name);
    expect(published.filter((name) => !declared.has(name))).toEqual([]);
    expect(MCP_TOOL_COUNT).toBe(published.length);
    expect(() =>
      countMcpTools([{ name: "duplicate" }, { name: "duplicate" }]),
    ).toThrow("Duplicate MCP tool names: duplicate");
    expect(text).toContain(`(${offeredMcpToolCount(env.APP_MODE)} tools)`);
    expect(source).toContain("(${offeredMcpToolCount(env.APP_MODE)} tools)");
    expect(source).not.toMatch(/\(\d+ tools\)/);
  }, 30_000);

  it("counts address lookup only when a lookup service is configured", () => {
    const offered = offeredMcpToolCount("cloud");
    expect(offered).toBe(env.ADDRESS_LOOKUP_URL ? MCP_TOOL_COUNT : MCP_TOOL_COUNT - 1);
    expect(offeredMcpToolCount("self-hosted")).toBeLessThan(offered);
  });
});
