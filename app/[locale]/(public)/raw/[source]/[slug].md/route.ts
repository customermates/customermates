import type { NextRequest } from "next/server";

import { getDocsPageRaw } from "@/features/mcp-tools/docs.mcp-tools";
import { isContentLocale } from "@/i18n/locale-registry";

const SOURCE_KEY_MAP = {
  docs: "docs",
  openapi: "api",
} as const;

type RawRouteParams = {
  locale: string;
  slug: string;
  source: string;
};

function normalizeSlug(slug: string) {
  return slug.replace(/(\.mdx?)+$/, "");
}

export async function GET(_request: NextRequest, { params }: { params: Promise<RawRouteParams> }) {
  const { locale, slug, source } = await params;
  const normalizedSlug = normalizeSlug(slug);
  const sourceKey = SOURCE_KEY_MAP[source as keyof typeof SOURCE_KEY_MAP];
  const page = sourceKey && isContentLocale(locale) ? getDocsPageRaw(normalizedSlug, locale, sourceKey) : null;

  if (!page) return new Response("Not Found", { status: 404 });

  return new Response(`# ${page.title}\n\n${page.markdown}\n`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Robots-Tag": "noindex, follow",
    },
    status: 200,
  });
}
