import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const TOOL_NAME_PATTERN = /^ {2}name: ["']([a-z0-9_]+)["'],?$/gm;
const TOOL_EXPORT_PATTERN = /export const [A-Za-z0-9]+Tool = \{/g;
const CATALOG_TOOL_PATTERN = /`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g;
const CATALOG_LOCALES = ["en", "de"];

function toolFiles(): string[] {
  return walkFiles(join(REPO_ROOT, "features", "mcp-tools"), (path) => path.endsWith(".mcp-tools.ts"));
}

function registeredToolNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const file of toolFiles()) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(TOOL_NAME_PATTERN)) {
      names.set(match[1], file.slice(REPO_ROOT.length + 1));
    }
  }
  return names;
}

function catalogPath(locale: string): string {
  return join("content", "docs", locale, "mcp-tool-catalog.mdx");
}

function catalogToolNames(locale: string): Set<string> {
  const text = readFileSync(join(REPO_ROOT, catalogPath(locale)), "utf8");
  return new Set([...text.matchAll(CATALOG_TOOL_PATTERN)].map((match) => match[1]));
}

describe("MCP tool catalog fidelity", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("extracts one name literal per exported tool", () => {
    let total = 0;
    for (const file of toolFiles()) {
      const text = readFileSync(file, "utf8");
      const exportCount = [...text.matchAll(TOOL_EXPORT_PATTERN)].length;
      const nameCount = [...text.matchAll(TOOL_NAME_PATTERN)].length;
      expect(nameCount, `${file.slice(REPO_ROOT.length + 1)}: name literals must match exported *Tool consts`).toBe(
        exportCount,
      );
      total += nameCount;
    }
    const routeText = readFileSync(join(REPO_ROOT, "app", "api", "v1", "mcp", "route.ts"), "utf8");
    const allToolsBlock = routeText.match(/const ALL_TOOLS = \[([\s\S]*?)\];/);
    const registeredCount = [...(allToolsBlock?.[1] ?? "").matchAll(/[A-Za-z0-9]+Tool\b/g)].length;
    expect(registeredCount, "ALL_TOOLS in app/api/v1/mcp/route.ts must register every exported tool").toBe(total);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("documents every registered tool in both catalogs", () => {
    const registered = registeredToolNames();
    const missing: string[] = [];
    for (const locale of CATALOG_LOCALES) {
      const documented = catalogToolNames(locale);
      for (const [name, file] of registered) {
        if (!documented.has(name)) missing.push(`${name} (${file}) is missing from ${catalogPath(locale)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("documents no tool that is not registered", () => {
    const registered = registeredToolNames();
    const stale: string[] = [];
    for (const locale of CATALOG_LOCALES) {
      for (const name of catalogToolNames(locale)) {
        if (!registered.has(name)) stale.push(`${name} in ${catalogPath(locale)} matches no registered tool`);
      }
    }
    expect(stale).toEqual([]);
  });
});
