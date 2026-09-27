import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import { getDocsPageTool, searchDocsTool } from "../docs.mcp-tools";
import { MCP_ALWAYS_ON_TOOLS } from "../tool-registry";

const deepResearchTool = (name: string) =>
  MCP_ALWAYS_ON_TOOLS.find((tool) => tool.name === name) ?? { name, description: "" };
const URL_TOOLS = [searchDocsTool, getDocsPageTool, deepResearchTool("search"), deepResearchTool("fetch")];

describe("the origin of a docs url", () => {
  it.each(URL_TOOLS.map((tool) => [tool.name, tool.description]))(
    "is named as the configured BASE_URL in the %s description",
    (_name, description) => {
      expect(description).toContain("that origin is the instance's configured BASE_URL");
    },
  );

  it.each(CONTENT_LOCALES)("is named as the configured BASE_URL in every catalog summary (%s)", (locale) => {
    const summaries = JSON.parse(
      readFileSync(join(process.cwd(), "content", "docs", locale, "mcp-catalog-summaries.json"), "utf8"),
    ) as Record<string, string>;

    expect(URL_TOOLS.filter((tool) => !summaries[tool.name]?.includes("`BASE_URL`")).map((tool) => tool.name)).toEqual(
      [],
    );
  });
});
