import "dotenv/config";

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

import { generateFiles } from "fumadocs-openapi";
import { createOpenAPI } from "fumadocs-openapi/server";

import { env } from "@/env";
import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";

const spec = generateOpenApiSpec();
const specPath = join(process.cwd(), "public", "v1", "openapi.json");

writeFileSync(specPath, JSON.stringify(spec, null, 2));

const buildOpenapi = createOpenAPI({
  input: [specPath],
});

const apiEnDir = join(process.cwd(), "content", "api", "en");
const apiDeDir = join(process.cwd(), "content", "api", "de");

mkdirSync(apiEnDir, { recursive: true });
mkdirSync(apiDeDir, { recursive: true });

await generateFiles({
  input: buildOpenapi,
  output: "./content/api/en",
  includeDescription: true,
  frontmatter: (title, description) => ({
    title,
    description: description || title,
    full: true,
  }),
});

const files = readdirSync(apiEnDir).filter((file) => file.endsWith(".mdx"));

for (const file of files) {
  const filePath = join(apiEnDir, file);
  let content = readFileSync(filePath, "utf-8");
  content = content.replace(
    /document=\{"[^"]*\/public\/v1\/openapi\.json"\}/g,
    `document={"${env.BASE_URL}/v1/openapi.json"}`,
  );
  writeFileSync(filePath, content, "utf-8");
}

rmSync(apiDeDir, { recursive: true, force: true });
cpSync(apiEnDir, apiDeDir, { recursive: true });
