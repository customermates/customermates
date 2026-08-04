import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const TERMINOLOGY_SPECIFIERS = [
  "@/components/entity-terminology/use-entity-terminology",
  "@/features/entity-terminology/entity-terminology.resolver",
  "@/core/stores/terminology.store",
];

const TERMINOLOGY_SYMBOLS = [
  "useEntityTerminology",
  "useColumnLabel",
  "resolveEntityTerm",
  "resolveEntityLabel",
  "buildTerminologyMap",
  "terminologyStore",
];

const CANONICAL_SURFACES = [
  "app/[locale]/(protected)/company/components/audit-log",
  "app/[locale]/(protected)/company/components/webhook",
  "features/webhook",
  "features/event",
  "ee/messaging/webhooks",
  "app/api",
];

const CANONICAL_FILES = ["features/messaging/activities/audit-detail.tsx", "features/messaging/activities/activities-panel.tsx"];

function toRepoPath(path: string) {
  return relative(REPO_ROOT, path).split(sep).join("/");
}

function canonicalSourceFiles() {
  const fromDirectories = CANONICAL_SURFACES.flatMap((surface) =>
    walkFiles(join(REPO_ROOT, surface), (path) => /\.(ts|tsx)$/.test(path) && !path.includes("__tests__")),
  );

  return [...new Set([...fromDirectories, ...CANONICAL_FILES.map((file) => join(REPO_ROOT, file))])];
}

function terminologyReferences(path: string) {
  const text = readFileSync(path, "utf8");
  const offenders: string[] = [];

  for (const specifier of TERMINOLOGY_SPECIFIERS) if (text.includes(specifier)) offenders.push(specifier);
  for (const symbol of TERMINOLOGY_SYMBOLS) if (new RegExp(`\\b${symbol}\\b`).test(text)) offenders.push(symbol);

  return [...new Set(offenders)];
}

describe("audit and webhook surfaces stay canonical", () => {
  it("never resolves workspace terminology", () => {
    const offenders = canonicalSourceFiles()
      .map((path) => ({ path: toRepoPath(path), symbols: terminologyReferences(path) }))
      .filter((file) => file.symbols.length > 0)
      .map((file) => `${file.path} references ${file.symbols.join(", ")}`);

    expect(offenders).toEqual([]);
  });

  it("keeps a canonical column label resolver available", () => {
    const source = readFileSync(join(REPO_ROOT, "components/entity-terminology/use-column-label.ts"), "utf8");

    expect(source).toContain("export function useCanonicalColumnLabel()");
  });
});
