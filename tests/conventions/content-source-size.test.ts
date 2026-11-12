import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import { COLLECTION_LOADERS } from "@/core/fumadocs/collections";

const SOURCE_FILE = /\.(?:ts|tsx|mjs)$/u;
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/gu;
const SCANNED_ROOTS = ["app", "components", "core", "features", "i18n", "ee", "hooks", "scripts"];

const BODY_SOURCE_CONSUMERS: Record<string, string[]> = {
  "core/fumadocs/body-sources/about": ["app/[locale]/(static)/about/page.tsx"],
  "core/fumadocs/body-sources/api-docs": ["app/[locale]/(static)/docs/openapi/[slug]/page.tsx"],
  "core/fumadocs/body-sources/blog-posts": ["app/[locale]/(static)/blog/[slug]/page.tsx"],
  "core/fumadocs/body-sources/compare-pages": ["app/[locale]/(static)/compare/[competitor]/page.tsx"],
  "core/fumadocs/body-sources/docs": [
    "app/[locale]/(static)/docs/[slug]/page.tsx",
    "app/[locale]/(static)/docs/page.tsx",
  ],
  "core/fumadocs/body-sources/feature-pages": ["app/[locale]/(static)/features/[slug]/page.tsx"],
  "core/fumadocs/body-sources/for-pages": ["app/[locale]/(static)/for/[industry]/page.tsx"],
  "core/fumadocs/body-sources/legal": ["app/[locale]/(static)/components/legal-mdx-page.tsx"],
};

function repoPath(path: string): string {
  return relative(REPO_ROOT, path).split(sep).join("/");
}

function importsOf(path: string): string[] {
  return [...readFileSync(path, "utf8").matchAll(IMPORT_SPECIFIER)].map((match) => match[1]);
}

function scannedFiles(): string[] {
  return SCANNED_ROOTS.flatMap((root) =>
    walkFiles(join(REPO_ROOT, root), (path) => SOURCE_FILE.test(path) && !repoPath(path).includes("/__tests__/")),
  );
}

describe("content source function size", () => {
  const files = scannedFiles();

  it("keeps compiled MDX out of every module except the page that renders that collection's body", () => {
    const consumers = new Map<string, string[]>();

    for (const file of files) {
      const path = repoPath(file);
      if (path.startsWith("core/fumadocs/body-sources/")) continue;

      for (const specifier of importsOf(file)) {
        const module = specifier.replace(/^@\//u, "");
        if (!module.startsWith("core/fumadocs/body-sources/")) continue;
        consumers.set(module, [...(consumers.get(module) ?? []), path].sort());
      }
    }

    expect(Object.fromEntries([...consumers].sort(([a], [b]) => a.localeCompare(b)))).toEqual(BODY_SOURCE_CONSUMERS);
  });

  it("imports the generated compiled collections only from their body source module", () => {
    const offenders = files.flatMap((file) => {
      const path = repoPath(file);
      if (path.startsWith("core/fumadocs/body-sources/")) return [];

      return importsOf(file)
        .filter((specifier) => specifier.startsWith("@/.source/bodies/") || specifier === "@/.source/server")
        .map((specifier) => `${path} imports ${specifier}`);
    });

    expect(offenders).toEqual([]);
  });

  it("gives every body source module exactly the generated collection of its name", () => {
    for (const module of Object.keys(BODY_SOURCE_CONSUMERS)) {
      const text = readFileSync(join(REPO_ROOT, `${module}.ts`), "utf8");
      const imported = [...text.matchAll(/from "@\/\.source\/bodies\/(\w+)"/gu)].map((match) => match[1]);

      expect(imported).toHaveLength(1);
      expect(Object.keys(COLLECTION_LOADERS)).toContain(imported[0]);
      expect(text).toContain(`export const ${imported[0]}BodySource`);
    }
  });

  it("defines one loader per collection of the content config, and a head source for each", () => {
    const config = readFileSync(join(REPO_ROOT, "core/fumadocs/source.config.ts"), "utf8");
    const collections = [...config.matchAll(/^export const (\w+) = defineCollections\(/gmu)].map((match) => match[1]);
    const sourceModule = readFileSync(join(REPO_ROOT, "core/fumadocs/source.ts"), "utf8");

    expect(Object.keys(COLLECTION_LOADERS).sort()).toEqual([...collections].sort());
    for (const name of collections) expect(sourceModule).toContain(`headLoader("${name}", ${name})`);
  });
});
