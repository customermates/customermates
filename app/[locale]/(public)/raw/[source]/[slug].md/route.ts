import type { NextRequest } from "next/server";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { ROUTING_LOCALES } from "@/i18n/routing";

const SOURCE_DIRECTORY_MAP = {
  docs: "docs",
  openapi: "api",
  skills: "skills",
} as const;

type RawRouteParams = {
  locale: string;
  slug: string;
  source: string;
};

function normalizeSlug(slug: string) {
  return slug.endsWith(".md") ? slug.slice(0, -3) : slug;
}

function isValidLocale(locale: string): locale is (typeof ROUTING_LOCALES)[number] {
  return (ROUTING_LOCALES as readonly string[]).includes(locale);
}

function isValidSlug(slug: string) {
  return /^[a-z0-9-]+$/i.test(slug);
}

function isValidSource(source: string): source is keyof typeof SOURCE_DIRECTORY_MAP {
  return source in SOURCE_DIRECTORY_MAP;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<RawRouteParams> }) {
  const { locale, slug, source } = await params;
  const normalizedSlug = normalizeSlug(slug);

  if (!isValidLocale(locale) || !isValidSource(source) || !isValidSlug(normalizedSlug))
    return new Response("Not Found", { status: 404 });

  const filePath = path.join(process.cwd(), "content", SOURCE_DIRECTORY_MAP[source], locale, `${normalizedSlug}.mdx`);

  try {
    const content = await readFile(filePath, "utf8");

    return new Response(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
      },
      status: 200,
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
