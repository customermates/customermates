import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, walkFiles } from "./walk";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const ENFORCED = true;

const TOOL_NAME_PATTERN = /^ {2}name: ["']([a-z0-9_]+)["'],?$/gm;
const TOOL_EXPORT_PATTERN = /export const [A-Za-z0-9]+Tool = \{/g;
const CATALOG_TOOL_PATTERN = /`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g;
const RETIRED_TOOL_NAMES = [
  "append_entity_notes",
  "create_widget",
  "filter_entity",
  "get_entities",
  "link_entities",
  "update_entity_notes",
  "update_widget",
] as const;
const CATALOG_LOCALES = CONTENT_LOCALES;
const REQUIRED_ANNOTATIONS = [
  "readOnlyHint",
  "idempotentHint",
  "destructiveHint",
  "openWorldHint",
];

function toolFiles(): string[] {
  return walkFiles(join(REPO_ROOT, "features", "mcp-tools"), (path) =>
    path.endsWith(".mcp-tools.ts"),
  );
}

function registeredToolNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const file of toolFiles()) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(TOOL_NAME_PATTERN)) {
      names.set(match[1], file.slice(REPO_ROOT.length + 1));
    }
  }
  return names;
}

function routeToolBindings(): number {
  const registryText = readFileSync(
    join(REPO_ROOT, "features", "mcp-tools", "tool-registry.ts"),
    "utf8",
  );
  const registration = registryText.slice(
    registryText.indexOf("export const MCP_TOOL_GROUPS"),
  );
  const bindings = [...registration.matchAll(/\b[A-Za-z0-9]+Tool\b/g)]
    .map((match) => match[0])
    .filter((name) => name !== "McpTool");
  return new Set(bindings).size;
}

function catalogPath(locale: string): string {
  return join("content", "docs", locale, "mcp.mdx");
}

function catalogText(locale: string): string {
  return readFileSync(join(REPO_ROOT, catalogPath(locale)), "utf8");
}

describe("MCP tool catalog fidelity", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "extracts one name and title per exported tool",
    () => {
      let total = 0;
      for (const file of toolFiles()) {
        const text = readFileSync(file, "utf8");
        const label = file.slice(REPO_ROOT.length + 1);
        const exportCount = [...text.matchAll(TOOL_EXPORT_PATTERN)].length;
        const nameCount = [...text.matchAll(TOOL_NAME_PATTERN)].length;
        const titleCount = [...text.matchAll(/^ {2}title: ["']/gm)].length;
        expect(
          nameCount,
          `${label}: name literals must match exported *Tool consts`,
        ).toBe(exportCount);
        expect(titleCount, `${label}: every exported tool needs a title`).toBe(
          exportCount,
        );
        for (const annotation of REQUIRED_ANNOTATIONS) {
          const annotationCount = [
            ...text.matchAll(new RegExp(`\\b${annotation}:`, "g")),
          ].length;
          expect(
            annotationCount,
            `${label}: every tool must set ${annotation}`,
          ).toBe(exportCount);
        }
        total += nameCount;
      }
      expect(
        routeToolBindings(),
        "tool-registry.ts MCP_TOOL_GROUPS + MCP_ALWAYS_ON_TOOLS must register every exported tool",
      ).toBe(total);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "documents every registered tool in both catalogs",
    () => {
      const registered = registeredToolNames();
      const missing: string[] = [];
      for (const locale of CATALOG_LOCALES) {
        const text = catalogText(locale);
        for (const [name, file] of registered) {
          if (!text.includes(`\`${name}\``))
            missing.push(
              `${name} (${file}) is missing from ${catalogPath(locale)}`,
            );
        }
      }
      expect(missing).toEqual([]);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "documents no tool that is not registered",
    () => {
      const registered = registeredToolNames();
      const stale: string[] = [];
      for (const locale of CATALOG_LOCALES) {
        for (const match of catalogText(locale).matchAll(
          CATALOG_TOOL_PATTERN,
        )) {
          if (!registered.has(match[1]))
            stale.push(
              `${match[1]} in ${catalogPath(locale)} matches no registered tool`,
            );
        }
      }
      expect(stale).toEqual([]);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "publishes no retired MCP tool name anywhere in product content",
    () => {
      const stale: string[] = [];
      const files = walkFiles(join(REPO_ROOT, "content"), (path) =>
        path.endsWith(".mdx"),
      );
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        for (const name of RETIRED_TOOL_NAMES)
          if (new RegExp(`\\b${name}\\b`).test(text))
            stale.push(`${file.slice(REPO_ROOT.length + 1)}: ${name}`);
      }
      expect(stale, stale.join("\n")).toEqual([]);
    },
  );
});
