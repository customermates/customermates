import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

// The runner stage of the Dockerfile copies source files one by one. `next start` transpiles
// next.config.ts and requires its local imports from that source, and `prisma migrate deploy` does
// the same with prisma.config.ts, so a local module the runner stage misses fails with
// MODULE_NOT_FOUND on every start and the container crash-loops before the app answers.
const RUNTIME_ENTRIES = ["next.config.ts", "prisma.config.ts"];

const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"];

function source(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

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

function valueImports(text: string): string[] {
  const specifiers: string[] = [];
  for (const match of text.matchAll(/^import\s[^;]*?from\s*["']([^"']+)["']/gm)) {
    if (!isTypeOnly(match[0])) specifiers.push(match[1]);
  }
  for (const match of text.matchAll(/^import\s*["']([^"']+)["']/gm)) specifiers.push(match[1]);
  for (const match of text.matchAll(/^export\s+(?!type\b)[^;]*?from\s*["']([^"']+)["']/gm)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

// Plugins such as next-intl check at config load that the paths handed to them exist.
function referencedPaths(text: string): string[] {
  return [...text.matchAll(/["'](\.\/[^"']+\.(?:ts|tsx|js|mjs|json))["']/g)].map((match) => match[1]);
}

// Every repository file the entries load from source when the image starts.
function runtimeFiles(): string[] {
  const queue = RUNTIME_ENTRIES.map((entry) => join(REPO_ROOT, entry));
  const seen = new Set<string>(queue);

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (!existsSync(file)) continue;

    const text = readFileSync(file, "utf8");
    const paths = file === join(REPO_ROOT, "next.config.ts") ? referencedPaths(text) : [];
    for (const path of paths) seen.add(join(REPO_ROOT, path));

    for (const next of valueImports(text).map((specifier) => resolveModule(specifier, file))) {
      if (next === null || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...seen].map((path) => relative(REPO_ROOT, path)).sort();
}

function runnerStage(dockerfile: string): string {
  const [, stage = ""] = dockerfile.split(/^FROM\s+\S+\s+AS\s+runner\s*$/imu);
  return stage.split(/^FROM\s/imu)[0];
}

function runnerCopies(stage: string): string[] {
  return [...stage.matchAll(/^COPY\s+--from=builder\s+\/app\/\S+\s+\.\/(\S+)\s*$/gmu)].map((match) =>
    match[1].replace(/\/$/u, ""),
  );
}

describe("Docker runner stage", () => {
  const stage = runnerStage(source("Dockerfile"));

  it("copies every local module next.config.ts and prisma.config.ts load when the image starts", () => {
    const copies = runnerCopies(stage);
    const files = runtimeFiles();
    const missing = files.filter((path) => !copies.some((copy) => path === copy || path.startsWith(copy + "/")));

    expect(files.length).toBeGreaterThan(RUNTIME_ENTRIES.length);
    expect(missing).toEqual([]);
  });

  // createMDX recompiles core/fumadocs/source.config.ts whenever next.config.ts loads unless its
  // own guard is set. That config reaches components and features the runner stage never copies,
  // so without the guard every start logs esbuild errors and an unhandled rejection.
  it("stops fumadocs from recompiling its source config when the image starts", () => {
    const fumadocsNext = createRequire(join(REPO_ROOT, "package.json")).resolve("fumadocs-mdx/next");

    expect(readFileSync(fumadocsNext, "utf8")).toMatch(/process\.env\._FUMADOCS_MDX !== ["']1["']/u);
    expect(stage).toMatch(/^ENV\s+_FUMADOCS_MDX=1\s*$/mu);
  });
});
