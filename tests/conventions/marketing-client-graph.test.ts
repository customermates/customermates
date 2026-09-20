import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

// Every module reachable from a "use client" file is bundled into the browser, so one value import
// of a server-shaped module puts that module's whole dependency tree on a marketing page. Three
// landed that way at once: theme-switcher.tsx imported the Prisma `Theme` enum as a value and
// shipped the generated client plus the full database model-name table (70 KB) to every blog post;
// public-navbar.tsx wrapped itself in mobx-react-lite's observer() while reading no observable; and
// the marketing shell statically imported the docs sidebar so every non-docs page paid for it.
// None of them is visible in a diff, and all three survived a green suite.

const CLIENT_ENTRY_POINTS = [
  "app/layout.tsx",
  "app/providers.tsx",
  "app/not-found.tsx",
  "app/[locale]/layout.tsx",
  "app/[locale]/error.tsx",
  "app/[locale]/(static)/layout.tsx",
  "app/[locale]/(static)/page.tsx",
  "app/[locale]/(static)/blog/[slug]/page.tsx",
  "app/[locale]/(static)/pricing/page.tsx",
  "app/[locale]/(static)/compare/[competitor]/page.tsx",
  "app/[locale]/(static)/for/[industry]/page.tsx",
];

const FORBIDDEN = [
  { id: "mobx", reason: "the marketing chrome reads no observable; drop observer() rather than shipping MobX" },
  { id: "mobx-react-lite", reason: "the marketing chrome reads no observable; drop observer() rather than shipping MobX" },
  {
    id: "generated/prisma",
    reason: "import the enum as a type and use its string literals; a value import ships the generated client",
  },
];

const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", "/index.tsx", "/index.ts", "/index.js", "/index.mjs"];

const sources = new Map<string, string>();

function read(file: string): string {
  const cached = sources.get(file);
  if (cached !== undefined) return cached;
  const source = readFileSync(file, "utf8");
  sources.set(file, source);
  return source;
}

function directive(file: string, name: "use client" | "use server"): boolean {
  return new RegExp(`^\\s*["']${name}["']`, "mu").test(read(file).slice(0, 400));
}

function resolveImport(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(REPO_ROOT, specifier.slice(2));
  else if (specifier.startsWith("./") || specifier.startsWith("../")) base = resolve(dirname(fromFile), specifier);
  else return null;

  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return existsSync(base) && statSync(base).isFile() ? base : null;
}

type Edge = { specifier: string; typeOnly: boolean; dynamic: boolean };

function edges(file: string): Edge[] {
  const source = read(file);
  const found: Edge[] = [];
  const statement = /import\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/gu;
  let match: RegExpExecArray | null;
  while ((match = statement.exec(source)) !== null) {
    const specifier = match[3] ?? match[4];
    if (!specifier) continue;
    const clause = match[2] ?? "";
    let typeOnly = Boolean(match[1]);
    if (!typeOnly && clause.trim().startsWith("{") && clause.includes("type ")) {
      const names = clause
        .replace(/[{}]/gu, "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      typeOnly = names.length > 0 && names.every((name) => name.startsWith("type "));
    }
    found.push({ specifier, typeOnly, dynamic: false });
  }
  const lazy = /\bimport\(\s*["']([^"']+)["']\s*\)/gu;
  while ((match = lazy.exec(source)) !== null) found.push({ specifier: match[1]!, typeOnly: false, dynamic: true });
  return found;
}

// A module enters the browser bundle once any path to it has crossed a "use client" boundary.
// "use server" files stop the walk: Next replaces those imports with a network reference.
// `import()` also stops it: that chunk is fetched on demand, not in the first load.
function marketingClientGraph(): { packages: Map<string, string[]>; files: Set<string> } {
  const packages = new Map<string, string[]>();
  const files = new Set<string>();
  const seen = new Map<string, string | null>();
  const queue: { file: string; inClient: boolean }[] = [];

  for (const entry of CLIENT_ENTRY_POINTS) {
    const file = join(REPO_ROOT, entry);
    if (!existsSync(file)) continue;
    const inClient = directive(file, "use client");
    seen.set(`${file}|${inClient}`, null);
    queue.push({ file, inClient });
  }

  const chainTo = (state: string): string[] => {
    const chain: string[] = [];
    let cursor: string | null | undefined = state;
    while (cursor) {
      chain.unshift(relative(REPO_ROOT, cursor.slice(0, cursor.lastIndexOf("|"))));
      cursor = seen.get(cursor);
    }
    return chain;
  };

  while (queue.length > 0) {
    const { file, inClient } = queue.shift()!;
    if (inClient) files.add(relative(REPO_ROOT, file));
    for (const { specifier, typeOnly, dynamic } of edges(file)) {
      if (typeOnly || dynamic) continue;
      const resolved = resolveImport(specifier, file);
      if (resolved === null) {
        if (inClient && !packages.has(specifier)) packages.set(specifier, chainTo(`${file}|${inClient}`));
        continue;
      }
      if (directive(resolved, "use server")) continue;
      const nextInClient = inClient || directive(resolved, "use client");
      const state = `${resolved}|${nextInClient}`;
      if (seen.has(state)) continue;
      seen.set(state, `${file}|${inClient}`);
      queue.push({ file: resolved, inClient: nextInClient });
    }
  }

  return { packages, files };
}

const graph = marketingClientGraph();

function reached(id: string): string[] | null {
  for (const [specifier, chain] of graph.packages) {
    if (specifier === id || specifier.startsWith(`${id}/`)) return [...chain, specifier];
  }
  for (const file of graph.files) {
    if (file === id || file.startsWith(id)) return [file];
  }
  return null;
}

describe("marketing client graph", () => {
  it("walks a graph that is neither empty nor the whole repository", () => {
    expect(graph.files.size).toBeGreaterThan(5);
    expect(graph.files.size).toBeLessThan(400);
  });

  it("reaches the marketing chrome it is supposed to police", () => {
    expect(graph.files).toContain(join("app", "components", "public-navbar.tsx"));
  });

  it.each(FORBIDDEN)("keeps $id out of the browser bundle on marketing pages", ({ id, reason }) => {
    const chain = reached(id);
    expect(chain, chain === null ? "" : `${id} reaches the browser via:\n  ${chain.join("\n  -> ")}\n${reason}`).toBe(
      null,
    );
  });
});
