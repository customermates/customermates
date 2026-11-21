import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DATA_VIEW_VISIBILITIES } from "@/core/data-view/data-view-state.schema";
import { renderTemplatePrompt } from "@/core/templates/template-prompt";
import { TEMPLATE_SLUGS } from "@/core/templates/template-registry";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { cloneSpec, cloneText, getTemplate } from "./template-fixtures";

const TOOLS_DIRECTORY = join(process.cwd(), "features", "mcp-tools");
const TOOL_SOURCES = readdirSync(TOOLS_DIRECTORY)
  .filter((name) => name.endsWith(".mcp-tools.ts"))
  .map((name) => readFileSync(join(TOOLS_DIRECTORY, name), "utf8"));
const TOOL_NAMES = new Set(
  TOOL_SOURCES.flatMap((source) => [...source.matchAll(/\bname: "([a-z_]+)"/gu)].map((m) => m[1])),
);
const TOOL_NAME = /\b[a-z]+(?:_[a-z]+)+\b/gu;

function toolSource(name: string): string {
  return TOOL_SOURCES.find((source) => source.includes(`name: "${name}"`)) ?? "";
}

function prompts(): Array<{ locale: string; text: string }> {
  return TEMPLATE_SLUGS.flatMap((slug) =>
    Object.keys(getTemplate(slug).publication).map((locale) => ({
      locale,
      text: renderTemplatePrompt(cloneSpec(slug), cloneText(slug, locale), {}),
    })),
  );
}

describe("tools named in the template prompts", () => {
  it("finds the MCP tools of the server", () => {
    expect(TOOL_NAMES.size).toBeGreaterThan(20);
  });

  it.each(APP_LOCALES)("names only tools the MCP server offers in %s", (locale) => {
    const named = new Set(
      prompts()
        .filter((prompt) => prompt.locale === locale)
        .flatMap((prompt) => [...prompt.text.matchAll(TOOL_NAME)].map((match) => match[0])),
    );
    for (const name of named) expect(TOOL_NAMES, `${locale}: ${name}`).toContain(name);
    for (const name of [
      "get_workspace_context",
      "manage_connected_accounts",
      "get_messaging_threads",
      "get_calendars",
      "connect_messaging_account",
      "import_crm_records",
      "manage_conversation_records",
      "manage_data_views",
      "manage_widgets",
      "configure_record_model",
      "manage_record_detail_layout",
    ])
      expect(named, `${locale}: ${name}`).toContain(name);
  });

  it("asks for sharing settings and identities the tools accept", () => {
    expect(DATA_VIEW_VISIBILITIES).toContain("workspace");
    expect(toolSource("manage_data_views")).toContain('"share"');
    expect(toolSource("manage_widgets")).toMatch(/isTemplate: z\.boolean\(\)/u);
    expect(toolSource("import_crm_records")).toContain("identities");
    expect(toolSource("configure_record_model")).toContain("valueType channels");
    expect(toolSource("get_workspace_context")).toContain("connectedAccounts");
    expect(toolSource("manage_connected_accounts")).toContain("list returns the caller's connected accounts");
  });
});
