import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const SOURCE_ROOTS = ["app", "components", "core", "features", "ee"];
const CLIENT_DIRECTIVE = /^\s*(?:\/\/[^\n]*\n\s*)*["']use client["']/;
const NAMED_IMPORT = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;

function resolveModule(specifier: string, from: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(REPO_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? join(dirname(from), specifier)
      : null;
  if (!base) return null;
  return (
    [".tsx", ".ts", "/index.tsx", "/index.ts"].map((suffix) => base + suffix).find((path) => existsSync(path)) ?? null
  );
}

function memoizedServerRenderedRoots(): string[] {
  const violations: string[] = [];
  for (const root of SOURCE_ROOTS) {
    for (const file of walkFiles(
      join(REPO_ROOT, root),
      (path) => path.endsWith(".tsx") && !path.includes("__tests__"),
    )) {
      const source = readFileSync(file, "utf8");
      if (CLIENT_DIRECTIVE.test(source)) continue;
      for (const match of source.matchAll(NAMED_IMPORT)) {
        const target = resolveModule(match[2], file);
        if (!target) continue;
        const client = readFileSync(target, "utf8");
        if (!CLIENT_DIRECTIVE.test(client)) continue;
        for (const name of match[1].split(",").map((entry) => entry.trim().split(" as ")[0])) {
          if (!name || name.startsWith("type ") || !new RegExp(`<${name}[\\s/>]`).test(source)) continue;
          if (new RegExp(`export const ${name}\\s*=\\s*(?:observer|memo|React\\.memo)\\(`).test(client))
            violations.push(
              `${relative(REPO_ROOT, file)} renders memoized ${name} from ${relative(REPO_ROOT, target)}`,
            );
        }
      }
    }
  }
  return violations;
}

describe("server-rendered client roots", () => {
  it("renders client roots through a plain component so a route refresh keeps their state", () => {
    expect(memoizedServerRenderedRoots()).toEqual([]);
  });
});
