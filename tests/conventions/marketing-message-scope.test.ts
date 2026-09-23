import { readFileSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { MARKETING_NAMESPACES } from "@/i18n/marketing-messages";

import { REPO_ROOT, walkFiles } from "./walk";

// The root layout ships only these namespaces to anonymous visitors, so the i18n catalogue in the
// RSC flight payload drops from 104 namespaces to this set. next-intl renders a missing key as the
// literal dotted key rather than throwing (defaultGetMessageFallback joins namespace and key), so a
// namespace the marketing tree uses but this list omits becomes visible text in production with
// every static check green. This test re-derives the set from source so the list cannot drift.
const MARKETING_ROOTS = [
  join("app", "[locale]", "(static)"),
  join("app", "components", "public-navbar.tsx"),
  join("app", "components", "footer.tsx"),
  join("app", "components", "footer-content.tsx"),
  join("app", "components", "footer-badges.tsx"),
  join("app", "components", "navigation", "public-navbar-menu.tsx"),
  join("app", "components", "navigation", "public-navbar-model.ts"),
  join("app", "components", "navigation", "public-navbar-sign-out-button.tsx"),
  join("app", "components", "navigation", "marketing-shell.tsx"),
  join("app", "components", "navigation", "docs-shell.tsx"),
  join("app", "[locale]", "error.tsx"),
  join("app", "not-found.tsx"),
  join("components", "shared"),
  join("components", "marketing"),
  join("components", "acquisition"),
  join("components", "seo"),
  join("components", "card"),
];

const NAMESPACE_FROM_LITERAL = /\bt\(\s*"([A-Z][A-Za-z0-9]*)\./gu;
const NAMESPACE_FROM_TEMPLATE = /\bt\(\s*`([A-Z][A-Za-z0-9]*)\./gu;

function marketingSources(): string[] {
  const found: string[] = [];
  for (const root of MARKETING_ROOTS) {
    const absolute = join(REPO_ROOT, root);
    if (absolute.endsWith(".tsx") || absolute.endsWith(".ts")) {
      found.push(absolute);
      continue;
    }
    found.push(...walkFiles(absolute, (path) => /\.tsx?$/u.test(path) && !path.includes(`${sep}__tests__${sep}`)));
  }
  return found;
}

function referencedNamespaces(): Set<string> {
  const namespaces = new Set<string>();
  for (const path of marketingSources()) {
    const source = readFileSync(path, "utf8");
    for (const [, namespace] of source.matchAll(NAMESPACE_FROM_LITERAL)) namespaces.add(namespace);
    for (const [, namespace] of source.matchAll(NAMESPACE_FROM_TEMPLATE)) namespaces.add(namespace);
  }
  return namespaces;
}

describe("marketing message scope", () => {
  it("ships every namespace the anonymous marketing tree references", () => {
    const declared = new Set<string>(MARKETING_NAMESPACES);
    const missing = [...referencedNamespaces()].filter((namespace) => !declared.has(namespace)).sort();

    expect(
      missing,
      `these namespaces are used by the marketing tree but withheld from anonymous visitors, so they render as raw dotted keys: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the list a strict subset of the shipped catalogue", () => {
    const catalogue = JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", "en.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const unknown = MARKETING_NAMESPACES.filter((namespace) => !(namespace in catalogue));

    expect(unknown, `these namespaces do not exist in en.json: ${unknown.join(", ")}`).toEqual([]);
  });

  it("stays smaller than the full catalogue", () => {
    const catalogue = JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", "en.json"), "utf8")) as Record<
      string,
      unknown
    >;

    expect(MARKETING_NAMESPACES.length).toBeLessThan(Object.keys(catalogue).length / 2);
  });
});
