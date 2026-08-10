import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const TOOL_NAME_PATTERN = /^ {2}name: ["']([a-z0-9_]+)["'],?$/gm;
const REGISTRY_FILE = join("features", "mcp-tools", "tool-registry.ts");
const TOOL_COUNT_CLAIM = /\b(\d{1,3})\s+(mcp[- ])?(tools|werkzeuge)\b/gi;
const NOT_A_TOOL_COUNT =
  /(over|above|more than|approximately|around|about|nearly|up to|beyond|über|mehr als|rund|etwa|circa|ca\.|bis zu|microsoft|office|dynamics|~|\+)\s*$/i;
const TOOLSET_COUNT_CLAIM =
  /\b(eight|nine|ten|eleven|twelve|acht|neun|zehn|elf|zwölf|\d{1,2})\s+(toolsets|Toolsets)\b/gi;
const NUMBER_WORDS: Record<number, { de: string; en: string } | undefined> = {
  8: { de: "acht", en: "eight" },
  9: { de: "neun", en: "nine" },
  10: { de: "zehn", en: "ten" },
  11: { de: "elf", en: "eleven" },
  12: { de: "zwölf", en: "twelve" },
};

function registeredToolNames(): Set<string> {
  const names = new Set<string>();
  const files = walkFiles(join(REPO_ROOT, "features", "mcp-tools"), (path) => path.endsWith(".mcp-tools.ts"));
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(TOOL_NAME_PATTERN)) names.add(match[1]);
  }
  return names;
}

function registryGroupsSource(): string {
  const text = readFileSync(join(REPO_ROOT, REGISTRY_FILE), "utf8");
  const start = text.indexOf("export const MCP_TOOL_GROUPS");
  return text.slice(start, text.indexOf("export const MCP_ALWAYS_ON_TOOLS", start));
}

function registryBindingCount(): number {
  const text = readFileSync(join(REPO_ROOT, REGISTRY_FILE), "utf8");
  const registration = text.slice(text.indexOf("export const MCP_TOOL_GROUPS"));
  const bindings = [...registration.matchAll(/\b[A-Za-z0-9]+Tool\b/g)]
    .map((match) => match[0])
    .filter((name) => name !== "McpTool");
  return new Set(bindings).size;
}

function toolsetCount(): number {
  return [...registryGroupsSource().matchAll(/^ {2}"?[a-z][a-z-]*"?: \[/gm)].length;
}

function groupedToolCount(): number {
  const bindings = [...registryGroupsSource().matchAll(/\b[A-Za-z0-9]+Tool\b/g)]
    .map((match) => match[0])
    .filter((name) => name !== "McpTool");
  return new Set(bindings).size;
}

function statedCounts(line: string): { count: number; phrase: string }[] {
  const stated: { count: number; phrase: string }[] = [];
  for (const match of line.matchAll(TOOL_COUNT_CLAIM)) {
    const preceding = line.slice(0, match.index ?? 0);
    if (NOT_A_TOOL_COUNT.test(preceding)) continue;
    stated.push({ count: Number(match[1]), phrase: match[0].trim() });
  }
  return stated;
}

describe("MCP tool count derives from the registry", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("resolves one count from the registered tools", () => {
    const registered = registeredToolNames();
    expect(registered.size).toBeGreaterThan(0);
    expect(registryBindingCount(), `${REGISTRY_FILE} must bind every exported tool exactly once`).toBe(registered.size);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("states that same count everywhere content names one", () => {
    const total = registeredToolNames().size;
    const grouped = groupedToolCount();
    const allowed = new Set([total, grouped]);
    const violations: string[] = [];

    for (const path of walkFiles(join(REPO_ROOT, "content"), (file) => file.endsWith(".mdx"))) {
      const file = relative(REPO_ROOT, path);
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          for (const { count, phrase } of statedCounts(line)) {
            if (allowed.has(count)) continue;
            violations.push(
              `${file}:${index + 1} states "${phrase}"; the registry exposes ${total} tools (${grouped} inside toolsets)`,
            );
          }
        });
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("states the registered number of toolsets", () => {
    const expected = NUMBER_WORDS[toolsetCount()];
    expect(expected, `add a number word for ${toolsetCount()} toolsets`).toBeDefined();
    const violations: string[] = [];

    for (const path of walkFiles(join(REPO_ROOT, "content"), (file) => file.endsWith(".mdx"))) {
      const file = relative(REPO_ROOT, path);
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          for (const match of line.matchAll(TOOLSET_COUNT_CLAIM)) {
            const stated = match[1].toLowerCase();
            if (stated === expected.en || stated === expected.de || Number(stated) === toolsetCount()) continue;
            violations.push(`${file}:${index + 1} states "${match[0].trim()}"; the registry declares ${toolsetCount()}`);
          }
        });
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
