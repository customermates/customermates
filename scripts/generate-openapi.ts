import "dotenv/config";

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

import { generateFiles } from "fumadocs-openapi";
import { createOpenAPI } from "fumadocs-openapi/server";

import { env } from "@/env";
import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

const spec = generateOpenApiSpec();
const specDir = join(process.cwd(), "public", "v1");
const specPath = join(specDir, "openapi.json");

mkdirSync(specDir, { recursive: true });
writeFileSync(specPath, JSON.stringify(spec, null, 2));

const buildOpenapi = createOpenAPI({
  input: [specPath],
});

const apiSourceDir = join(process.cwd(), "content", "api", DEFAULT_LOCALE);

mkdirSync(apiSourceDir, { recursive: true });

await generateFiles({
  input: buildOpenapi,
  output: `./content/api/${DEFAULT_LOCALE}`,
  includeDescription: true,
  frontmatter: (title, description) => ({
    title,
    description: description || title,
    full: true,
  }),
});

const files = readdirSync(apiSourceDir).filter((file) => file.endsWith(".mdx"));

for (const file of files) {
  const filePath = join(apiSourceDir, file);
  let content = readFileSync(filePath, "utf-8");
  content = content.replace(
    /document=\{"[^"]*\/public\/v1\/openapi\.json"\}/g,
    `document={"${env.BASE_URL}/v1/openapi.json"}`,
  );
  writeFileSync(filePath, content, "utf-8");
}

for (const locale of CONTENT_LOCALES) {
  if (locale === DEFAULT_LOCALE) continue;
  const localeDir = join(process.cwd(), "content", "api", locale);
  rmSync(localeDir, { recursive: true, force: true });
  cpSync(apiSourceDir, localeDir, { recursive: true });
}

process.exit(0);
