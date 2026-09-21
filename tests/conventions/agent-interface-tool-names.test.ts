import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AGENT_PANEL_TOOL_NAMES } from "@/ee/agent-chat/agent-ui-command";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const INTERFACE_TOOL_NAMES = ["list_ui_targets", ...AGENT_PANEL_TOOL_NAMES] as const;
const RETIRED_INTERFACE_TOOL_NAMES = ["open_record", "click_ui_target"] as const;
const BACKTICKED_IDENTIFIER = /`([a-z][a-z0-9_]*)`/g;

const assistantPages = CONTENT_LOCALES.map((locale) => ({
  locale,
  path: `content/docs/${locale}/app-assistant.mdx`,
}));

describe("agent interface tool names in the assistant documentation", () => {
  it.each(assistantPages)("names every interface tool in $locale", ({ path }) => {
    const source = read(path);
    for (const name of INTERFACE_TOOL_NAMES) expect(source).toContain(`\`${name}\``);
  });

  it.each(assistantPages)("names no retired interface tool in $locale", ({ path }) => {
    const source = read(path);
    for (const name of RETIRED_INTERFACE_TOOL_NAMES) expect(source).not.toContain(`\`${name}\``);
  });

  it.each(assistantPages)("uses no near-miss interface tool name in $locale", ({ path }) => {
    const source = read(path);
    const nearMisses = [...source.matchAll(BACKTICKED_IDENTIFIER)]
      .map((match) => match[1])
      .filter((identifier) =>
        INTERFACE_TOOL_NAMES.some(
          (name) => name !== identifier && (name.startsWith(`${identifier}_`) || name.endsWith(`_${identifier}`)),
        ),
      );
    expect(nearMisses).toEqual([]);
  });
});
