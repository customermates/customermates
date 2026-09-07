import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

// The workflow bundle is evaluated inside a `vm` sandbox that has no `require`. Reaching the
// generated Prisma client from that graph throws `ReferenceError: require is not defined` while the
// workflow session is being created, so every agent turn dies before a single step runs and the
// chat hangs on "Starting…". A type-only import is erased and therefore harmless; a value import
// is not. Steps marked "use step" are stripped from the bundle, but a module-level import is not.
const FORBIDDEN_MODULE = "generated/prisma";

const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"];

// Modules the agent-turn workflow calls from its *body* rather than from inside a "use step"
// function. Step bodies are stripped from the sandbox bundle, so only the body graph has to stay
// free of the generated client.
const WORKFLOW_BODY_MODULES = [
  "ee/agent-chat/system-prompt.ts",
  "ee/agent-chat/agent-surface-policy.ts",
  "ee/routines/routine-trigger-doc.ts",
];

function resolveModule(specifier: string, fromFile: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(REPO_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (base === null) return null;

  for (const extension of EXTENSIONS) {
    if (existsSync(base + extension)) return base + extension;
  }
  for (const extension of EXTENSIONS) {
    const index = join(base, "index" + extension);
    if (existsSync(index)) return index;
  }
  return existsSync(base) ? base : null;
}

function isTypeOnly(statement: string): boolean {
  if (/^import\s+type\b/.test(statement)) return true;

  const named = statement.match(/^import\s*\{([^}]*)\}/);
  if (!named) return false;

  const specifiers = named[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return specifiers.length > 0 && specifiers.every((entry) => /^type\s/.test(entry));
}

function valueImports(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(/^import\s[^;]*?from\s*["']([^"']+)["']/gm)) {
    if (!isTypeOnly(match[0])) specifiers.push(match[1]);
  }
  for (const match of source.matchAll(/^export\s+(?!type\b)[^;]*?from\s*["']([^"']+)["']/gm)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

// Returns the import chain from a workflow entry point to the generated Prisma client, so a
// failure names every hop rather than only the endpoints.
function prismaValueImportChain(entry: string): string[] | null {
  const queue: { file: string; chain: string[] }[] = [{ file: entry, chain: [relative(REPO_ROOT, entry)] }];
  const seen = new Set<string>([entry]);

  while (queue.length > 0) {
    const { file, chain } = queue.shift()!;
    if (!existsSync(file)) continue;

    for (const specifier of valueImports(readFileSync(file, "utf8"))) {
      const resolved = resolveModule(specifier, file);
      if (resolved === null) continue;

      const repoPath = relative(REPO_ROOT, resolved);
      if (repoPath.startsWith(FORBIDDEN_MODULE)) return [...chain, repoPath];
      if (seen.has(resolved)) continue;

      seen.add(resolved);
      queue.push({ file: resolved, chain: [...chain, repoPath] });
    }
  }
  return null;
}

describe("workflow sandbox imports", () => {
  it.each(WORKFLOW_BODY_MODULES)("%s exists", (repoPath) => {
    expect(existsSync(join(REPO_ROOT, repoPath))).toBe(true);
  });

  it.each(WORKFLOW_BODY_MODULES)(
    "%s never reaches the generated prisma client through a value import",
    (repoPath) => {
      const chain = prismaValueImportChain(join(REPO_ROOT, repoPath));
      expect(chain?.join("\n  -> ") ?? null).toBeNull();
    },
  );
});
