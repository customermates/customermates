import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";
import { resolveCommercialTokens } from "@/core/commercial/commercial-tokens";
import { resolveDerivedTokens } from "@/core/content/derived-tokens";

const SOURCES = ["docs", "api"] as const;
const LOCALES = CONTENT_LOCALES;

type ManifestPage = { title: string; description: string; content: string };

const root = path.join(process.cwd(), "content");
const manifest: Record<
  string,
  Record<string, Record<string, ManifestPage>>
> = {};

function parsePage(slug: string, raw: string, locale: string): ManifestPage {
  raw = resolveDerivedTokens(resolveCommercialTokens(raw, locale));
  const frontmatter = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const pick = (key: string) =>
    frontmatter?.[1].match(
      new RegExp(`^${key}:\\s*["']?(.+?)["']?$`, "m"),
    )?.[1] ?? "";
  return {
    title: pick("title") || slug,
    description: pick("description"),
    content: raw,
  };
}

for (const source of SOURCES) {
  manifest[source] = {};
  for (const locale of LOCALES) {
    manifest[source][locale] = {};
    const dir = path.join(root, source, locale);
    let files: string[] = [];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".mdx")) continue;
      const slug = file.slice(0, -4);
      manifest[source][locale][slug] = parsePage(
        slug,
        readFileSync(path.join(dir, file), "utf8"),
        locale,
      );
    }
  }
}

const outDir = path.join(process.cwd(), "generated");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "raw-docs-manifest.json");
writeFileSync(outPath, JSON.stringify(manifest));
console.log(
  `Wrote ${outPath} (${Object.keys(manifest).length} sources, ${Object.values(manifest).reduce((sum, src) => sum + Object.values(src).reduce((s, l) => s + Object.keys(l).length, 0), 0)} files)`,
);
