import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SWITCH_KIT_CHECKED_ON, SWITCH_KIT_TOOLS } from "@/components/marketing/templates/switch-kit-tools";
import { TEMPLATE_FAMILIES } from "@/core/templates/template-spec.schema";
import { MARKETING_LOCALES } from "@/i18n/locale-registry";

const ROOT = process.cwd();
const DASH = /[–—]/u;
const TOOL_FIELDS = ["export", "moves", "name", "replaces", "stays"] as const;

type ToolCopy = Record<(typeof TOOL_FIELDS)[number], string>;
type TemplatePagesCopy = {
  families: Record<string, string>;
  switchKit: { tools: Record<string, ToolCopy> };
} & Record<string, unknown>;

function copyOf(locale: string): TemplatePagesCopy {
  const messages = JSON.parse(readFileSync(join(ROOT, "i18n", "locales", `${locale}.json`), "utf8")) as {
    TemplatePages: TemplatePagesCopy;
  };
  return messages.TemplatePages;
}

function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
  return [];
}

describe("template page copy", () => {
  it.each(MARKETING_LOCALES)("names every template family in %s", (locale) => {
    expect(Object.keys(copyOf(locale).families).sort()).toEqual([...TEMPLATE_FAMILIES].sort());
  });

  it.each(MARKETING_LOCALES)("has the same switch kit copy for every tool in %s", (locale) => {
    const tools = copyOf(locale).switchKit.tools;

    expect(Object.keys(tools).sort()).toEqual([...SWITCH_KIT_TOOLS].sort());
    for (const tool of SWITCH_KIT_TOOLS)
      for (const field of TOOL_FIELDS) expect(tools[tool][field]?.trim(), `${tool}.${field}`).toBeTruthy();
  });

  it.each(MARKETING_LOCALES)("uses no dash characters in the page copy in %s", (locale) => {
    const dashes = leaves(copyOf(locale))
      .filter(([, text]) => DASH.test(text))
      .map(([path]) => path);

    expect(dashes).toEqual([]);
  });

  it("dates the checked export steps", () => {
    expect(SWITCH_KIT_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });
});

describe("switch kits on compare pages", () => {
  const COMPARE_ROOT = join(ROOT, "content", "compare-pages");
  const USAGE = /<SwitchKit\s+tool="([^"]+)"\s*\/>/gu;

  function usage(locale: string): string[] {
    const directory = join(COMPARE_ROOT, locale);
    return readdirSync(directory)
      .filter((name) => name.endsWith(".mdx"))
      .flatMap((name) =>
        [...readFileSync(join(directory, name), "utf8").matchAll(USAGE)].map((match) => `${name}:${match[1]}`),
      )
      .sort();
  }

  it("names only tools it has copy for", () => {
    for (const entry of usage("en")) expect(SWITCH_KIT_TOOLS as readonly string[]).toContain(entry.split(":")[1]);
  });

  it("carries the notion switch kit on the notion compare page", () => {
    expect(usage("en")).toContain("notion-alternative.mdx:notion");
  });

  it.each(MARKETING_LOCALES)("places the same switch kits on the %s compare pages as on the English ones", (locale) => {
    expect(usage(locale)).toEqual(usage("en"));
  });
});
