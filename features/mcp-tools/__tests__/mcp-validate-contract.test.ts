import { readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { describe, it, expect } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MCP_DIR = join(ROOT, "features/mcp-tools");
const DI = readFileSync(join(ROOT, "core/di.ts"), "utf8");

function interactorGetters(): string[] {
  const set = new Set<string>();
  for (const file of readdirSync(MCP_DIR).filter((name) => name.endsWith(".mcp-tools.ts"))) {
    const src = readFileSync(join(MCP_DIR, file), "utf8");
    for (const match of src.matchAll(/\b(get[A-Z]\w*Interactor)\b/g)) set.add(match[1]);
  }
  return [...set].sort();
}

function classForGetter(getter: string): string | null {
  const at = DI.indexOf(`export const ${getter} =`);
  if (at < 0) return null;
  const match = DI.slice(at, at + 400).match(/new\s+(\w+)\s*\(/);
  return match ? match[1] : null;
}

function fileForClass(cls: string): string | null {
  const match = DI.match(new RegExp(`import\\s*\\{[^}]*\\b${cls}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`));
  return match ? match[1].replace(/^@\//, "") + ".ts" : null;
}

function invokeDecorator(file: string): "Validate" | "Enforce" | "none" {
  const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  const idx = lines.findIndex((line) => /async invoke\b/.test(line) && !/abstract/.test(line));
  if (idx < 0) return "none";
  const above = lines.slice(Math.max(0, idx - 8), idx).join("\n");
  if (/@Enforce\(/.test(above)) return "Enforce";
  if (/@Validate\(/.test(above)) return "Validate";
  return "none";
}

describe("MCP-backing interactors honor the @Validate contract", () => {
  const getters = interactorGetters();
  const resolved = getters
    .map((getter) => ({ getter, cls: classForGetter(getter) }))
    .filter((entry): entry is { getter: string; cls: string } => entry.cls != null)
    .map((entry) => ({ getter: entry.getter, file: fileForClass(entry.cls) }))
    .filter((entry): entry is { getter: string; file: string } => entry.file != null);

  it("references at least one interactor and resolves every getter to a source file", () => {
    expect(getters.length).toBeGreaterThan(0);
    const unresolved = getters.filter((getter) => !resolved.some((entry) => entry.getter === getter));
    expect(unresolved).toEqual([]);
  });

  it("never backs an MCP tool with an @Enforce interactor (must be @Validate, so bad input prettifies, or void-input)", () => {
    const violations = resolved
      .filter((entry) => invokeDecorator(entry.file) === "Enforce")
      .map((entry) => `${entry.getter} (${entry.file})`);
    expect(violations).toEqual([]);
  });
});
