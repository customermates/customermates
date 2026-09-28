import type { ContentLocale } from "@/i18n/locale-registry";

import rawManifest from "@/generated/raw-docs-manifest.json";

import { env } from "@/env";
import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { DOCS_API_KEY_PLACEHOLDER, getMcpInstallSnippet, type McpTool } from "@/features/docs/mcp-install-snippet";

import { splitSections, unwrapDocsComponents, type DocsSection } from "./docs-retrieval";

type ManifestPage = { title: string; description: string; content: string };
export type DocsSource = "docs" | "api";
export type DocsLocale = ContentLocale;
type Manifest = Record<DocsSource, Record<DocsLocale, Record<string, ManifestPage>>>;

const manifest = rawManifest as Manifest;
const pageCache = new Map<string, string>();
const sectionCache = new Map<string, DocsSection[]>();

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function expandSnippet(tool: string): string {
  return getMcpInstallSnippet(tool as McpTool, DOCS_API_KEY_PLACEHOLDER, env.BASE_URL);
}

const API_PAGE_LINE =
  /^<APIPage\s[^>]*\b(operations|webhooks)=\{\[\{"(?:path|name)":"([^"]+)","method":"([a-z]+)"\}\]\}\s*\/>[ \t]*$/gm;

type SpecSchema = { $ref?: string; const?: string; enum?: string[]; properties?: Record<string, SpecSchema> };
type RawDocsSpec = {
  servers?: { url: string }[];
  webhooks?: Record<string, { post?: { requestBody?: { content?: Record<string, { schema?: SpecSchema }> } } }>;
  components?: { schemas?: Record<string, SpecSchema> };
};

let rawDocsSpec: RawDocsSpec | undefined;

function webhookEventName(spec: RawDocsSpec, name: string): string {
  const schema = spec.webhooks?.[name]?.post?.requestBody?.content?.["application/json"]?.schema;
  const resolved = schema?.$ref ? spec.components?.schemas?.[schema.$ref.replace("#/components/schemas/", "")] : schema;
  const event = resolved?.properties?.event;
  return event?.const ?? event?.enum?.[0] ?? name;
}

function expandApiPage(slug: string, markdown: string): string {
  return markdown.replace(API_PAGE_LINE, (_, kind: string, target: string, method: string) => {
    rawDocsSpec ??= generateOpenApiSpec() as RawDocsSpec;
    const restServerPath = rawDocsSpec.servers?.[0]?.url ?? "";
    const spec = `\`${restServerPath}/v1/openapi\``;
    const verb = method.toUpperCase();
    return kind === "webhooks"
      ? `**Webhook:** \`${webhookEventName(rawDocsSpec, target)}\`, sent as \`${verb}\` to your webhook URL, operationId \`${slug}\`. Payload schema: ${spec}.`
      : `**Endpoint:** \`${verb} ${restServerPath}${target}\`, operationId \`${slug}\`. Parameters and schemas: ${spec}.`;
  });
}

export function pageMarkdown(source: DocsSource, locale: DocsLocale, slug: string, page: ManifestPage): string {
  const cacheKey = `${source}:${locale}:${slug}`;
  const cached = pageCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const content = stripFrontmatter(page.content);
  const markdown = unwrapDocsComponents(source === "api" ? expandApiPage(slug, content) : content, expandSnippet);
  pageCache.set(cacheKey, markdown);
  return markdown;
}

export function pageSections(source: DocsSource, locale: DocsLocale, slug: string, page: ManifestPage): DocsSection[] {
  return splitSections({ slug, source, pageTitle: page.title, markdown: pageMarkdown(source, locale, slug, page) });
}

export function docsManifestPages(source: DocsSource, locale: DocsLocale): Array<[string, ManifestPage]> {
  return Object.entries(manifest[source]?.[locale] ?? {});
}

export function docsCorpusSections(source: DocsSource, locale: DocsLocale): DocsSection[] {
  const cacheKey = `${source}:${locale}`;
  const cached = sectionCache.get(cacheKey);
  if (cached) return cached;
  const sections = docsManifestPages(source, locale).flatMap(([slug, page]) =>
    pageSections(source, locale, slug, page),
  );
  sectionCache.set(cacheKey, sections);
  return sections;
}

export function pageUrl(source: DocsSource, locale: DocsLocale, slug: string): string {
  if (source === "api") return `${env.BASE_URL}/${locale}/docs/openapi/${slug}`;
  return slug === "intro-page" ? `${env.BASE_URL}/${locale}/docs` : `${env.BASE_URL}/${locale}/docs/${slug}`;
}

export function normalizeSlug(slug: string): string {
  return slug
    .replace(/^\/?(docs\/)?/, "")
    .replace(/(\.mdx?)+$/, "")
    .trim();
}

export function listDocsSlugs(locale: DocsLocale, source: DocsSource): string[] {
  return Object.keys(manifest[source]?.[locale] ?? {}).sort();
}

export function getDocsPageRaw(
  slug: string,
  locale: DocsLocale,
  source: DocsSource,
): { slug: string; title: string; description: string; url: string; markdown: string } | null {
  const normalized = normalizeSlug(slug);
  const pages = manifest[source]?.[locale];
  const page = pages && Object.hasOwn(pages, normalized) ? pages[normalized] : undefined;
  if (!page) return null;

  const markdown = pageMarkdown(source, locale, normalized, page);

  return {
    slug: normalized,
    title: page.title,
    description: page.description,
    url: pageUrl(source, locale, normalized),
    markdown,
  };
}
