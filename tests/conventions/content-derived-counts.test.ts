import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveDerivedToken, resolveDerivedTokens } from "@/core/content/derived-tokens";
import {
  MCP_ALWAYS_ON_TOOLS,
  MCP_GROUPED_TOOL_COUNT,
  MCP_TOOL_COUNT,
  MCP_TOOL_GROUPS,
  MCP_TOOLSET_COUNT,
} from "@/features/mcp-tools/tool-registry";
import { WEBHOOK_EVENT_COUNT } from "@/features/webhook/webhook-event-registry";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;
const REGISTRY_FILE = join("features", "mcp-tools", "tool-registry.ts");
const TOOL_NAME_PATTERN = /^ {2}name: ["']([a-z0-9_]+)["'],?$/gm;
const TOOL_COUNT_CLAIM =
  /\b(\d{1,3})(?:-tool[- ]mcp\b|\s+(?:(?:mcp[- ])?(?:tools|werkzeuge)\b|\[mcp\]\([^)]+\)\s*(?:tools|werkzeuge)\b|\[(?:mcp[- ])?(?:tools|werkzeuge)\]\([^)]+\)))/gi;
const TOOLSET_COUNT_CLAIM = /\b(eight|nine|ten|eleven|twelve|acht|neun|zehn|elf|zwölf|\d{1,2})\s+toolsets\b/gi;
const WEBHOOK_COUNT_CLAIM =
  /\b(\d{1,3})\s+(?:webhooks?\b|webhook[- ]?(?:events?(?: types?)?|eventtypen|ereignisse|ereignistypen)\b|\[(?:webhook[- ])?(?:events|ereignisse)\]\([^)]+\))/gi;
const APPROXIMATION =
  /(over|above|more than|approximately|around|about|nearly|up to|beyond|über|mehr als|rund|etwa|circa|ca\.|bis zu|microsoft|office|dynamics|~|\+)\s*$/i;

function registeredToolNames(): Set<string> {
  const names = new Set<string>();
  const files = walkFiles(join(REPO_ROOT, "features", "mcp-tools"), (path) => path.endsWith(".mcp-tools.ts"));
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(TOOL_NAME_PATTERN)) names.add(match[1]);
  }
  return names;
}

function contentFiles(): string[] {
  return walkFiles(join(REPO_ROOT, "content"), (path) => path.endsWith(".mdx"));
}

function scanContent(claim: RegExp, isViolation: (match: RegExpMatchArray) => string | null): string[] {
  const violations: string[] = [];
  for (const path of contentFiles()) {
    const file = relative(REPO_ROOT, path);
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, index) => {
        for (const match of line.matchAll(claim)) {
          if (APPROXIMATION.test(line.slice(0, match.index ?? 0))) continue;
          const problem = isViolation(match);
          if (problem) violations.push(`${file}:${index + 1} ${problem}`);
        }
      });
  }
  return violations;
}

describe("counts stated in content derive from product source", () => {
  it("resolves every derived fact token", () => {
    const violations: string[] = [];
    for (const path of contentFiles()) {
      const text = readFileSync(path, "utf8");
      if (!text.includes("[[derived.")) continue;
      try {
        resolveDerivedTokens(text);
      } catch (error) {
        violations.push(`${relative(REPO_ROOT, path)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("resolves one MCP tool count from the registry", () => {
    const registered = registeredToolNames();
    expect(registered.size).toBeGreaterThan(0);
    expect(MCP_TOOL_COUNT, `${REGISTRY_FILE} must bind every exported tool once`).toBe(registered.size);
    expect(Number(resolveDerivedToken("mcp.tools.total"))).toBe(MCP_TOOL_COUNT);
    expect(Number(resolveDerivedToken("mcp.tools.grouped"))).toBe(MCP_GROUPED_TOOL_COUNT);
    expect(Number(resolveDerivedToken("mcp.tools.alwaysOn"))).toBe(MCP_ALWAYS_ON_TOOLS.length);
    expect(Number(resolveDerivedToken("mcp.toolsets.count"))).toBe(MCP_TOOLSET_COUNT);
    for (const [group, tools] of Object.entries(MCP_TOOL_GROUPS)) {
      expect(Number(resolveDerivedToken(`mcp.tools.groups.${group}`))).toBe(tools.length);
    }
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("states no handwritten MCP tool count", () => {
    const violations = scanContent(
      TOOL_COUNT_CLAIM,
      (match) => `states literal "${match[0].trim()}"; use a derived MCP count token`,
    );
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("states no handwritten toolset count", () => {
    const violations = scanContent(
      TOOLSET_COUNT_CLAIM,
      (match) => `states literal "${match[0].trim()}"; use the derived MCP toolset token`,
    );
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("states no handwritten webhook event count", () => {
    expect(WEBHOOK_EVENT_COUNT).toBeGreaterThan(0);
    const violations = scanContent(
      WEBHOOK_COUNT_CLAIM,
      (match) => `states literal "${match[0].trim()}"; use a derived webhook count token`,
    );
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
