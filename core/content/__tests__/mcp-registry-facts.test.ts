import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readMcpRegistryFacts } from "../mcp-registry-facts";

const temporaryRoots: string[] = [];

function registryRoot(source: string): string {
  const root = mkdtempSync(join(tmpdir(), "mcp-registry-facts-"));
  temporaryRoots.push(root);
  const directory = join(root, "features", "mcp-tools");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "tool-registry.ts"), source);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("MCP registry source facts", () => {
  it("counts direct group and always-on references", () => {
    const root = registryRoot(`
      export const MCP_TOOL_GROUPS = {
        records: [getRecordsTool, updateRecordsTool],
        "custom-columns": [manageColumnsTool],
      };
      export const MCP_ALWAYS_ON_TOOLS = [searchTool, fetchTool];
    `);
    expect(readMcpRegistryFacts(root)).toEqual({
      alwaysOn: 2,
      grouped: 3,
      groups: { records: 2, "custom-columns": 1 },
      toolsets: 2,
      total: 5,
    });
  });

  it("rejects registry shapes whose count cannot be projected statically", () => {
    const root = registryRoot(`
      export const MCP_TOOL_GROUPS = { records: [...recordTools] };
      export const MCP_ALWAYS_ON_TOOLS = [searchTool];
    `);
    expect(() => readMcpRegistryFacts(root)).toThrow("direct tool references");
  });
});
