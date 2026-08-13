import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

import { createProcessor } from "@mdx-js/mdx";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import {
  FOOTER_COLUMN_SIZE,
  FOOTER_PREFERRED_SLUGS,
  type FooterCollection,
  selectFooterSlugs,
} from "@/app/components/footer-selection";
import { CONTENT_DYNAMIC_ROUTES, UNBACKED_DYNAMIC_PUBLIC_ROUTES } from "@/core/fumadocs/content-route-contract";
import {
  CONTENT_LOCALES,
  DEFAULT_LOCALE,
  type ContentLocale,
  contentLocaleOrDefault,
  isContentLocale,
  routingLocaleFromUrlSegment,
} from "@/i18n/locale-registry";
import { PUBLIC_ROUTES } from "@/i18n/routing";

const ENFORCED = true;

const CONTENT_ROOT = join(REPO_ROOT, "content");
const processor = createProcessor({ format: "mdx" });
const ROOT_LINK_CANDIDATE = /(?:\]\s*\(\s*|href\s*=\s*(?:\{\s*)?["']|^\s*\[[^\]\n]+\]:\s*)\//mu;

type MdxNode = {
  attributes?: Array<{
    data?: { estree?: EstreeProgram };
    name?: string;
    type?: string;
    value?: string | { data?: { estree?: EstreeProgram }; type?: string; value?: string } | null;
  }>;
  children?: MdxNode[];
  identifier?: string;
  position?: { start?: { line?: number } };
  type: string;
  url?: string;
};

type EstreeProgram = {
  body?: Array<{ expression?: { type?: string; value?: unknown } }>;
};

type ContentLink = {
  file: string;
  line: number;
  sourceLocale: ContentLocale;
  target: string;
};

type NormalizedTarget = {
  locale: ContentLocale | null;
  path: string;
};

function staticExpressionValue(program: EstreeProgram | undefined): string | null {
  const expression = program?.body?.[0]?.expression;
  return expression?.type === "Literal" && typeof expression.value === "string" ? expression.value : null;
}

function jsxHref(node: MdxNode): string | null {
  if (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement") return null;
  const attribute = node.attributes?.find(
    (candidate) => candidate.type === "mdxJsxAttribute" && candidate.name === "href",
  );
  if (!attribute || attribute.value === null || attribute.value === undefined) return null;
  if (typeof attribute.value === "string") return attribute.value;
  return staticExpressionValue(attribute.value.data?.estree);
}

function rootRelative(target: string | null | undefined): target is string {
  return typeof target === "string" && target.startsWith("/") && !target.startsWith("//");
}

function maskFrontmatter(source: string): string {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, (frontmatter) =>
    frontmatter.replace(/[^\r\n]/gu, " "),
  );
}

function linksInDocument(source: string, file: string, sourceLocale: ContentLocale): ContentLink[] {
  let tree: MdxNode;

  try {
    tree = processor.parse(source) as unknown as MdxNode;
  } catch (error) {
    throw new Error(`Could not parse ${file} as MDX`, { cause: error });
  }

  const links: ContentLink[] = [];
  const definitions = new Map<string, string>();
  const references: Array<{ identifier: string; line: number }> = [];
  const record = (target: string, node: MdxNode) => {
    if (rootRelative(target)) {
      links.push({
        file,
        line: node.position?.start?.line ?? 1,
        sourceLocale,
        target,
      });
    }
  };
  const visit = (node: MdxNode): void => {
    if (node.type === "link" && rootRelative(node.url)) record(node.url, node);
    if (node.type === "definition" && node.identifier && rootRelative(node.url)) {
      definitions.set(node.identifier, node.url);
    }
    if (node.type === "linkReference" && node.identifier) {
      references.push({
        identifier: node.identifier,
        line: node.position?.start?.line ?? 1,
      });
    }

    const href = jsxHref(node);
    if (href) record(href, node);
    for (const child of node.children ?? []) visit(child);
  };

  visit(tree);

  for (const reference of references) {
    const target = definitions.get(reference.identifier);
    if (rootRelative(target)) links.push({ file, line: reference.line, sourceLocale, target });
  }

  return links;
}

export function normalizeTarget(target: string): NormalizedTarget | null {
  const base = "https://internal.invalid";
  const url = new URL(target, base);
  if (url.origin !== base) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const prefixedLocale = segments[0] ? routingLocaleFromUrlSegment(segments[0]) : null;
  if (prefixedLocale) segments.shift();

  const path = segments.length === 0 ? "/" : `/${segments.join("/")}`;
  return {
    locale: prefixedLocale ? contentLocaleOrDefault(prefixedLocale) : null,
    path: path.length > 1 ? path.replace(/\/+$/u, "") : path,
  };
}

function knownTargets(locale: ContentLocale): Set<string> {
  const targets = new Set<string>(PUBLIC_ROUTES.filter((route) => !route.includes(":")));

  for (const { collection, route } of Object.values(CONTENT_DYNAMIC_ROUTES)) {
    const base = route.slice(0, route.lastIndexOf("/"));
    for (const slug of collectionSlugs(collection, locale)) targets.add(`${base}/${slug}`);
  }

  return targets;
}

function contentLinks(): ContentLink[] {
  const found: ContentLink[] = [];

  for (const path of walkFiles(CONTENT_ROOT, (candidate) => extname(candidate) === ".mdx")) {
    const source = readFileSync(path, "utf8");
    if (!ROOT_LINK_CANDIDATE.test(source)) continue;

    const file = relative(REPO_ROOT, path).split(sep).join("/");
    const localeSegment = relative(CONTENT_ROOT, path).split(sep)[1];
    if (!isContentLocale(localeSegment)) throw new Error(`${file} is outside a registered content locale`);
    found.push(...linksInDocument(maskFrontmatter(source), file, localeSegment));
  }

  return found;
}

function collectionSlugs(collection: string, locale: ContentLocale): string[] {
  const directory = join(CONTENT_ROOT, collection, locale);
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".mdx")
    .map((entry) => entry.name.slice(0, -".mdx".length))
    .sort();
}

describe("internal link targets", () => {
  it("accounts for every dynamic public route at one canonical source map", () => {
    const mapped = Object.values(CONTENT_DYNAMIC_ROUTES).map(({ route }) => route);
    const declaredUnbacked = [...UNBACKED_DYNAMIC_PUBLIC_ROUTES];
    const dynamicPublicRoutes = PUBLIC_ROUTES.filter((route) => route.includes(":"));

    expect([...mapped, ...declaredUnbacked].sort()).toEqual([...dynamicPublicRoutes].sort());
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "resolves every literal internal link in MDX",
    () => {
      const links = contentLinks();
      const targetsByLocale = new Map(CONTENT_LOCALES.map((locale) => [locale, knownTargets(locale)]));
      const problems: string[] = [];

      expect(links.length, "expected root-relative links under content/").toBeGreaterThan(0);

      for (const link of links) {
        const normalized = normalizeTarget(link.target);
        if (!normalized) continue;
        const targetLocale = normalized.locale ?? link.sourceLocale;
        if (!targetsByLocale.get(targetLocale)?.has(normalized.path)) {
          problems.push(`${link.file}:${link.line} -> ${link.target}`);
        }
      }

      expect(problems, `content links with no published route:\n${problems.join("\n")}`).toEqual([]);
    },
    30_000,
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("derives six live footer links per collection and locale", () => {
    const selections = new Map<string, string[]>();
    const problems: string[] = [];

    for (const collection of Object.keys(FOOTER_PREFERRED_SLUGS) as FooterCollection[]) {
      for (const locale of CONTENT_LOCALES) {
        const published = collectionSlugs(collection, locale);
        const selected = selectFooterSlugs(collection, published);
        selections.set(`${collection}/${locale}`, selected);

        if (selected.length !== FOOTER_COLUMN_SIZE) {
          problems.push(`${collection}/${locale} yields ${selected.length}, expected ${FOOTER_COLUMN_SIZE}`);
        }
        for (const slug of selected) {
          if (!published.includes(slug)) problems.push(`${collection}/${locale} selected absent slug ${slug}`);
        }
      }

      const reference = selections.get(`${collection}/${DEFAULT_LOCALE}`);
      for (const locale of CONTENT_LOCALES) {
        expect(selections.get(`${collection}/${locale}`)).toEqual(reference);
      }
    }

    expect(problems, `footer columns with invalid derived links:\n${problems.join("\n")}`).toEqual([]);
  });

  it("tops up a footer column deterministically when a preferred page disappears", () => {
    const preferred = FOOTER_PREFERRED_SLUGS["for-pages"];
    const available = [...preferred.slice(1), "zzz-replacement", "aaa-replacement"];

    expect(selectFooterSlugs("for-pages", available)).toEqual([...preferred.slice(1), "aaa-replacement"]);
    expect(selectFooterSlugs("for-pages", preferred.slice(0, 2))).toEqual([...preferred.slice(0, 2)]);
  });

  it("normalizes locale prefixes, queries, fragments, and trailing slashes", () => {
    expect(normalizeTarget("/pricing#plans")).toEqual({
      locale: null,
      path: "/pricing",
    });
    expect(normalizeTarget("/pricing?ref=footer")).toEqual({
      locale: null,
      path: "/pricing",
    });
    expect(normalizeTarget("/for/healthcare/")).toEqual({
      locale: null,
      path: "/for/healthcare",
    });
    expect(normalizeTarget("/de/for/healthcare")).toEqual({
      locale: "de",
      path: "/for/healthcare",
    });
    expect(normalizeTarget("/fr/pricing")).toEqual({
      locale: DEFAULT_LOCALE,
      path: "/pricing",
    });
    expect(normalizeTarget("/")).toEqual({ locale: null, path: "/" });
  });

  it("extracts Markdown references and static JSX href forms through the MDX AST", () => {
    const links = linksInDocument(
      `[inline](/pricing)\n\n[reference][plans]\n\n[plans]: /pricing#plans\n\n<Card\n  href={'/features/all'}\n/>`,
      "synthetic.mdx",
      DEFAULT_LOCALE,
    );

    expect(links.map(({ target }) => target)).toEqual(["/pricing", "/features/all", "/pricing#plans"]);
  });
});
