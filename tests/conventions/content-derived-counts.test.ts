import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const REGISTRY_FILE = join("features", "mcp-tools", "tool-registry.ts");
const WEBHOOK_SCHEMA_FILE = join("features", "webhook", "webhook.schema.ts");

const TOOL_NAME_PATTERN = /^ {2}name: ["']([a-z0-9_]+)["'],?$/gm;
const TOOL_BINDING_PATTERN = /\b[A-Za-z0-9]+Tool\b/g;
const TOOLSET_KEY_PATTERN = /^ {2}"?[a-z][a-z-]*"?: \[/gm;

const TOOL_COUNT_CLAIM = /\b(\d{1,3})\s+(mcp[- ])?(tools|werkzeuge)\b/gi;
const TOOLSET_COUNT_CLAIM = /\b(eight|nine|ten|eleven|twelve|acht|neun|zehn|elf|zwölf|\d{1,2})\s+toolsets\b/gi;
const WEBHOOK_COUNT_CLAIM = /\b(\d{1,3})\s+(webhook[- ])?(events|ereignisse)\b/gi;
const APPROXIMATION =
  /(over|above|more than|approximately|around|about|nearly|up to|beyond|über|mehr als|rund|etwa|circa|ca\.|bis zu|microsoft|office|dynamics|~|\+)\s*$/i;

const NUMBER_WORDS: Record<number, { de: string; en: string } | undefined> = {
  8: { de: "acht", en: "eight" },
  9: { de: "neun", en: "nine" },
  10: { de: "zehn", en: "ten" },
  11: { de: "elf", en: "eleven" },
  12: { de: "zwölf", en: "twelve" },
};

function readSource(file: string): string {
  return readFileSync(join(REPO_ROOT, file), "utf8");
}

function registeredToolNames(): Set<string> {
  const names = new Set<string>();
  const files = walkFiles(join(REPO_ROOT, "features", "mcp-tools"), (path) => path.endsWith(".mcp-tools.ts"));
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(TOOL_NAME_PATTERN)) names.add(match[1]);
  }
  return names;
}

function distinctBindings(source: string): number {
  const bindings = [...source.matchAll(TOOL_BINDING_PATTERN)].map((match) => match[0]).filter((name) => name !== "McpTool");
  return new Set(bindings).size;
}

function registryGroupsSource(): string {
  const text = readSource(REGISTRY_FILE);
  const start = text.indexOf("export const MCP_TOOL_GROUPS");
  return text.slice(start, text.indexOf("export const MCP_ALWAYS_ON_TOOLS", start));
}

function toolsetCount(): number {
  return [...registryGroupsSource().matchAll(TOOLSET_KEY_PATTERN)].length;
}

function webhookEventCount(): number {
  const text = readSource(WEBHOOK_SCHEMA_FILE);
  const start = text.indexOf("WebhookEventSchema = z.enum([");
  const body = text.slice(start, text.indexOf("]", start));
  return [...body.matchAll(/"[a-z_.]+"/g)].length;
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
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("resolves one MCP tool count from the registry", () => {
    const registered = registeredToolNames();
    expect(registered.size).toBeGreaterThan(0);
    expect(distinctBindings(readSource(REGISTRY_FILE)), `${REGISTRY_FILE} must bind every exported tool once`).toBe(
      registered.size,
    );
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("states no other MCP tool count", () => {
    const total = registeredToolNames().size;
    const grouped = distinctBindings(registryGroupsSource());
    const allowed = new Set([total, grouped]);

    const violations = scanContent(TOOL_COUNT_CLAIM, (match) =>
      allowed.has(Number(match[1]))
        ? null
        : `states "${match[0].trim()}"; the registry exposes ${total} tools (${grouped} inside toolsets)`,
    );

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("states no other toolset count", () => {
    const expected = toolsetCount();
    const words = NUMBER_WORDS[expected];
    expect(words, `add a number word for ${expected} toolsets`).toBeDefined();

    const violations = scanContent(TOOLSET_COUNT_CLAIM, (match) => {
      const stated = match[1].toLowerCase();
      if (stated === words?.en || stated === words?.de || Number(stated) === expected) return null;
      return `states "${match[0].trim()}"; the registry declares ${expected} toolsets`;
    });

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("states no other webhook event count", () => {
    const expected = webhookEventCount();
    expect(expected).toBeGreaterThan(0);

    const violations = scanContent(WEBHOOK_COUNT_CLAIM, (match) =>
      Number(match[1]) === expected ? null : `states "${match[0].trim()}"; the schema defines ${expected} events`,
    );

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
