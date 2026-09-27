import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const BASE_URL_FILES = ["`llms.txt`", "`llms-full.txt`", "`sitemap.xml`", "`robots.txt`"];
const BASE_URL_TOOLS = ["`search_docs`", "`get_docs_page`", "`search`", "`fetch`"];
const DOCS_ACTION_KEYS = [
  "openInChatGPT",
  "openInClaude",
  "copyMcpConfig",
  "copyMcpCommand",
  "connectToCursor",
  "connectToVsCode",
] as const;
const API_REFERENCE_LABELS = ["**Server URL**", "**Send**"];

function baseUrlSection(locale: string): string {
  return (
    read(`content/docs/${locale}/self-hosting.mdx`)
      .split("\n## ")
      .find((section) => section.split("\n")[0].includes("[#base-url]")) ?? ""
  );
}

describe("self-hosting BASE_URL section", () => {
  it.each(CONTENT_LOCALES)("names every address the app builds from BASE_URL (%s)", (locale) => {
    const section = baseUrlSection(locale);
    const actions = JSON.parse(read(`i18n/locales/${locale}.json`)).DocsPage as Record<string, string>;
    const expected = [
      ...BASE_URL_FILES,
      ...BASE_URL_TOOLS,
      ...API_REFERENCE_LABELS,
      ...DOCS_ACTION_KEYS.map((key) => `**${actions[key]}**`),
    ];

    expect(section).not.toBe("");
    expect(expected.filter((name) => !section.includes(name))).toEqual([]);
  });
});
