import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";
import { FILTER_FIELD_TERMINOLOGY } from "@/features/entity-terminology/entity-terminology.constants";

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

const CANONICAL_FILES = [
  "features/messaging/activities/audit-detail.tsx",
  "features/messaging/activities/activities-panel.tsx",
];

const CANONICAL_FILTER_REPOSITORIES = [
  "features/audit-log/prisma-audit-log.repository.ts",
  "ee/messaging/activities/prisma-activities.repository.ts",
  "features/webhook/prisma-webhook.repository.ts",
  "features/webhook/prisma-webhook-delivery.repository.ts",
];

const ENTITY_REFERENCE_FILTER_FIELDS = [
  "contactIds",
  "organizationIds",
  "dealIds",
  "serviceIds",
  "taskIds",
  "participantContactId",
];

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

  it("never offers an entity-reference filter field, whose label follows workspace terminology", () => {
    const offenders = CANONICAL_FILTER_REPOSITORIES.flatMap((repository) => {
      const source = readFileSync(join(REPO_ROOT, repository), "utf8");

      return ENTITY_REFERENCE_FILTER_FIELDS.filter((field) =>
        new RegExp(`FilterFieldKey\\.${field}\\b`).test(source),
      ).map((field) => `${repository} offers ${field}`);
    });

    expect(offenders).toEqual([]);
  });

  it("gives every entity-reference filter field a workspace term in the working UI", () => {
    const unmapped = ENTITY_REFERENCE_FILTER_FIELDS.filter((field) => !(field in FILTER_FIELD_TERMINOLOGY));

    expect(unmapped).toEqual([]);
  });

  it("keeps a canonical column label resolver available", () => {
    const source = readFileSync(join(REPO_ROOT, "components/entity-terminology/use-column-label.ts"), "utf8");

    expect(source).toContain("export function useCanonicalColumnLabel()");
  });
});
