import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { slugifyHeading } from "@/features/mcp-tools/docs-retrieval";
import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

import { REPO_ROOT } from "./walk";

/**
 * Agents cite docs sections by anchor and pages by relative route, so both must be stable and the
 * same in every language: a translated page keeps its English page's H2/H3 anchors, in order, as
 * explicit `[#anchor]` suffixes, and its Link lines name the same routes and assistant ids. Every
 * route a Link line names must be a real app page.
 */
type Heading = { level: number; anchor: string; explicit: boolean; line: number };
type Page = { headings: Heading[]; linkRoutes: Set<string>; mateIds: Set<string>; linkLines: number };

const EXPLICIT_ANCHOR = /\s*(?:\[#([^\]]+)\]|\{#([^}]+)\})\s*$/;
const LINK_LINE = /^\*\*Link:\*\*/;

export function parseDocsPage(text: string): Page {
  const headings: Heading[] = [];
  const linkRoutes = new Set<string>();
  const mateIds = new Set<string>();
  let linkLines = 0;
  let fence: string | null = null;
  text.split("\n").forEach((line, index) => {
    const marker = /^(```|~~~)/.exec(line)?.[1];
    if (marker) fence = fence === marker ? null : (fence ?? marker);
    if (fence) return;
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      const explicit = EXPLICIT_ANCHOR.exec(heading[2]);
      const anchor = explicit ? (explicit[1] ?? explicit[2]) : slugifyHeading(heading[2].replace(EXPLICIT_ANCHOR, ""));
      headings.push({ level: heading[1].length, anchor, explicit: !!explicit, line: index + 1 });
    }
    if (LINK_LINE.test(line)) {
      linkLines += 1;
      const [linkPart, matePart = ""] = line.split("**Mate:**");
      for (const match of linkPart.matchAll(/`(\/[^`\s]*)`/g)) linkRoutes.add(match[1]);
      for (const match of matePart.matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`/g)) mateIds.add(match[1]);
    }
  });
  return { headings, linkRoutes, mateIds, linkLines };
}

export function translationViolations(slug: string, locale: string, source: Page, translation: Page): string[] {
  const found: string[] = [];
  const expected = source.headings.map((heading) => `${heading.level}#${heading.anchor}`).join(" ");
  const actual = translation.headings.map((heading) => `${heading.level}#${heading.anchor}`).join(" ");
  if (expected !== actual) found.push(`${locale}/${slug}: H2/H3 anchors differ from ${DEFAULT_LOCALE}`);
  for (const heading of translation.headings.filter((entry) => !entry.explicit)) {
    found.push(`${locale}/${slug}:${heading.line}: heading needs an explicit [#${heading.anchor}]`);
  }
  if (source.linkLines !== translation.linkLines) found.push(`${locale}/${slug}: Link line count differs`);
  for (const [kind, left, right] of [
    ["route", source.linkRoutes, translation.linkRoutes],
    ["assistant id", source.mateIds, translation.mateIds],
  ] as const) {
    for (const value of left) if (!right.has(value)) found.push(`${locale}/${slug}: Link lines miss ${kind} ${value}`);
    for (const value of right) if (!left.has(value)) found.push(`${locale}/${slug}: Link lines add ${kind} ${value}`);
  }
  return found;
}

function appPageRoutes(): string[][] {
  const routes: string[][] = [];
  const walk = (dir: string, segments: string[]) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name.startsWith("__")) continue;
        walk(path, /^\(.*\)$/.test(name) ? segments : [...segments, name]);
      } else if (/^page\.(tsx|ts|mdx)$/.test(name)) routes.push(segments);
    }
  };
  walk(join(REPO_ROOT, "app", "[locale]"), []);
  return routes;
}

export function isAppPageRoute(route: string, routes: string[][]): boolean {
  const segments = route.split(/[?#]/)[0].split("/").filter(Boolean);
  return routes.some(
    (candidate) =>
      candidate.length === segments.length &&
      candidate.every(
        (part, index) => /^\[.+\]$/.test(part) || part === segments[index] || /^[<{].*[>}]$/.test(segments[index]),
      ),
  );
}

function docsPages(locale: string): Map<string, Page> {
  const dir = join(REPO_ROOT, "content", "docs", locale);
  return new Map(
    readdirSync(dir)
      .filter((file) => file.endsWith(".mdx"))
      .map((file) => [
        file.replace(/\.mdx$/, ""),
        parseDocsPage(readFileSync(join(dir, file), "utf8").replace(/^---[\s\S]*?---\n/, "")),
      ]),
  );
}

describe("docs anchor and Link line parity", () => {
  it("flags a translated heading without an explicit anchor and a Link line with another route", () => {
    const source = parseDocsPage(
      "## Roles tab\n**Link:** `/company/roles`. **Mate:** `nav-company-roles`.\n### Who can edit roles?",
    );
    const translation = parseDocsPage(
      "## Tab Rollen [#roles-tab]\n**Link:** `/company/members`. **Mate:** `nav-company-roles`.\n### Wer darf Rollen bearbeiten?",
    );
    expect(translationViolations("app-company", "de", source, translation)).toEqual([
      "de/app-company: H2/H3 anchors differ from en",
      "de/app-company:3: heading needs an explicit [#wer-darf-rollen-bearbeiten]",
      "de/app-company: Link lines miss route /company/roles",
      "de/app-company: Link lines add route /company/members",
    ]);
  });

  it("keeps every translated page's anchors, Link line routes and assistant ids equal to the English page", () => {
    const source = docsPages(DEFAULT_LOCALE);
    const violations = CONTENT_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).flatMap((locale) =>
      [...docsPages(locale)].flatMap(([slug, translation]) => {
        const english = source.get(slug);
        return english ? translationViolations(slug, locale, english, translation) : [`${locale}/${slug}: no English page`];
      }),
    );
    expect(violations).toEqual([]);
  });

  it("names only real app pages in Link lines", () => {
    const routes = appPageRoutes();
    const missing = CONTENT_LOCALES.filter((locale) => existsSync(join(REPO_ROOT, "content", "docs", locale))).flatMap(
      (locale) =>
        [...docsPages(locale)].flatMap(([slug, page]) =>
          [...page.linkRoutes]
            .filter((route) => !/^\/(api|docs)(\/|$)/.test(route) && !isAppPageRoute(route, routes))
            .map((route) => `${locale}/${slug}: ${route}`),
        ),
    );
    expect(missing).toEqual([]);
  });
});
