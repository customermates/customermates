import type { NextRequest } from "next/server";

import manifest from "@/generated/raw-docs-manifest.json";

const SOURCE_KEY_MAP = {
  docs: "docs",
  openapi: "api",
} as const;

type RawRouteParams = {
  locale: string;
  slug: string;
  source: string;
};

type Manifest = Record<string, Record<string, Record<string, string>>>;

function normalizeSlug(slug: string) {
  return slug.replace(/(\.mdx?)+$/, "");
}

export async function GET(_request: NextRequest, { params }: { params: Promise<RawRouteParams> }) {
  const { locale, slug, source } = await params;
  const normalizedSlug = normalizeSlug(slug);
  const sourceKey = SOURCE_KEY_MAP[source as keyof typeof SOURCE_KEY_MAP];
  const content = sourceKey ? (manifest as Manifest)[sourceKey]?.[locale]?.[normalizedSlug] : undefined;

  if (!content) return new Response("Not Found", { status: 404 });

  return new Response(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
    status: 200,
  });
}
