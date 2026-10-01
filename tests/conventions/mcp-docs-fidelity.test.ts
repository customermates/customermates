import { beforeAll, describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, walkFiles } from "./walk";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const ENFORCED = true;

const CATALOG_TOOL_PATTERN = /^#### `([a-z][a-z0-9_]+)`$/gm;
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
const REQUIRED_ANNOTATIONS = ["readOnlyHint", "idempotentHint", "destructiveHint", "openWorldHint"];

let activeTools: typeof import("@/features/mcp-tools/tool-registry").ALL_MCP_TOOLS;
beforeAll(async () => {
  activeTools = (await import("@/features/mcp-tools/tool-registry")).ALL_MCP_TOOLS;
}, 120_000);

function registeredToolNames(): Set<string> {
  return new Set(activeTools.map((tool) => tool.name));
}

function catalogPath(locale: string): string {
  return join("content", "docs", locale, "mcp.mdx");
}

function catalogText(locale: string): string {
  return readFileSync(join(REPO_ROOT, catalogPath(locale)), "utf8");
}

/**
 * Only the generated catalog tables name tools. Prose elsewhere on the page legitimately
 * backticks other snake_case tokens, such as the failure kinds a refused call can carry.
 */
function catalogTableText(locale: string): string {
  return [...catalogText(locale).matchAll(/\{\/\* mcp-catalog:[a-z-]+ \*\/\}([\s\S]*?)\{\/\* \/mcp-catalog \*\/\}/g)]
    .map((match) => match[1])
    .join("\n");
}

describe("MCP catalog generation", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "keeps every checked-in catalog table a fixed point of the generator",
    async () => {
      const { applyCatalogTables } = await import("@/scripts/generate-mcp-catalog");
      for (const locale of CATALOG_LOCALES) {
        const summaries = JSON.parse(
          readFileSync(join(REPO_ROOT, "content", "docs", locale, "mcp-catalog-summaries.json"), "utf8"),
        ) as Record<string, string>;
        const path = join(REPO_ROOT, "content", "docs", locale, "mcp.mdx");
        const source = readFileSync(path, "utf8");
        expect(
          applyCatalogTables(source, locale, summaries),
          `${path} tables drifted; run yarn docs:generate-catalog`,
        ).toBe(source);
      }
    },
    120_000,
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "has a summary in every locale for every registered tool",
    async () => {
      const { CATALOG_SECTIONS } = await import("@/scripts/generate-mcp-catalog");
      const missing: string[] = [];
      for (const locale of CATALOG_LOCALES) {
        const summaries = JSON.parse(
          readFileSync(join(REPO_ROOT, "content", "docs", locale, "mcp-catalog-summaries.json"), "utf8"),
        ) as Record<string, string>;
        for (const tools of Object.values(CATALOG_SECTIONS))
          for (const tool of tools) if (!summaries[tool.name]) missing.push(`${tool.name} (${locale})`);
      }
      expect(missing).toEqual([]);
    },
    120_000,
  );
});

describe("MCP tool description quality", () => {
  let registry: typeof import("@/features/mcp-tools/tool-registry").ALL_MCP_TOOLS;
  beforeAll(async () => {
    registry = (await import("@/features/mcp-tools/tool-registry")).ALL_MCP_TOOLS;
  }, 120_000);
  const loadRegistry = async () => registry;
  const CONNECTOR_MINIMUM_TOOLS = new Set(["search", "fetch"]);
  const REAL_SEND_TOOLS = new Set([
    "send_email",
    "send_chat_message",
    "manage_social_relations",
    "manage_team",
    "request_support",
  ]);
  const PAGINATION_ARGS = new Set(["page", "cursor", "offset"]);
  const PAGINATION_WORDS = /pagin|cursor|offset|page/i;
  const shapeOf = (schema: unknown): Record<string, unknown> => {
    const candidate = schema as { shape?: Record<string, unknown> };
    return candidate?.shape ?? {};
  };

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("declares an output schema on every tool", async () => {
    const missing = (await loadRegistry()).filter((tool) => !tool.outputSchema).map((tool) => tool.name);
    expect(missing).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "keeps every output schema an object so the MCP wire can carry it",
    async () => {
      const { z } = await import("zod");
      const nonObject = (await loadRegistry())
        .filter((tool) => tool.outputSchema && !(tool.outputSchema instanceof z.ZodObject))
        .map((tool) => tool.name);
      expect(nonObject, "tools/list silently drops a non-object outputSchema (unions cannot be registered)").toEqual(
        [],
      );
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "keeps every output schema serializable for MCP tools/list",
    async () => {
      const { z } = await import("zod");
      const failures: string[] = [];
      for (const tool of await loadRegistry()) {
        if (!tool.outputSchema) continue;
        try {
          z.toJSONSchema(tool.outputSchema, { io: "output" });
        } catch (error) {
          failures.push(`${tool.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      expect(failures).toEqual([]);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "keeps every description above the floor and every connector stub pointing at the real tool",
    async () => {
      const violations: string[] = [];
      for (const tool of await loadRegistry()) {
        if (CONNECTOR_MINIMUM_TOOLS.has(tool.name)) {
          if (!/prefer [a-z_]+/.test(tool.description))
            violations.push(`${tool.name}: connector stub must point interactive agents at the preferred tool`);
          continue;
        }
        if (tool.description.length < 200)
          violations.push(`${tool.name}: description is ${tool.description.length} chars; the floor is 200`);
      }
      expect(violations).toEqual([]);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("explains continuation on every paginated tool", async () => {
    const violations: string[] = [];
    for (const tool of await loadRegistry()) {
      const argNames = Object.keys(shapeOf(tool.inputSchema));
      if (!argNames.some((name) => PAGINATION_ARGS.has(name))) continue;
      if (!PAGINATION_WORDS.test(tool.description))
        violations.push(
          `${tool.name}: has ${argNames.filter((name) => PAGINATION_ARGS.has(name)).join("/")} but the description never mentions pagination`,
        );
    }
    expect(violations).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "marks destructive and real-send behavior in the description itself",
    async () => {
      const violations: string[] = [];
      for (const tool of await loadRegistry()) {
        if (tool.annotations?.destructiveHint && !/IRREVERSIBLE|permanently/.test(tool.description))
          violations.push(`${tool.name}: destructiveHint without IRREVERSIBLE/permanently in the description`);
        if (REAL_SEND_TOOLS.has(tool.name) && !/SIDE EFFECT|SENDS? (A )?REAL/.test(tool.description))
          violations.push(`${tool.name}: sends something real but the description carries no SIDE EFFECT marker`);
      }
      expect(violations).toEqual([]);
    },
  );
});

describe("MCP tool catalog fidelity", () => {
  it("keeps current app instructions in both locales free of retired CRM tool calls", async () => {
    const { RETIRED_RECORD_TOOLS } = await import("@/features/mcp-tools/retired-record-tools");
    const pages = ["app-assistant", "app-dashboard", "app-routines", "app-search", "webhooks"];
    const stale: string[] = [];
    for (const locale of CATALOG_LOCALES) {
      for (const page of pages) {
        const source = readFileSync(join(REPO_ROOT, "content", "docs", locale, `${page}.mdx`), "utf8");
        for (const name of Object.keys(RETIRED_RECORD_TOOLS))
          if (new RegExp(`\\b${name}\\b`).test(source)) stale.push(`${locale}/${page}: ${name}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("registers each active tool once with complete metadata and excludes retired write contracts", async () => {
    const { RETIRED_RECORD_TOOLS } = await import("@/features/mcp-tools/retired-record-tools");
    expect(registeredToolNames().size).toBe(activeTools.length);
    for (const tool of activeTools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]+$/);
      expect(tool.title?.trim()).toBeTruthy();
      for (const annotation of REQUIRED_ANNOTATIONS)
        expect(typeof tool.annotations?.[annotation as keyof NonNullable<typeof tool.annotations>]).toBe("boolean");
      expect(Object.hasOwn(RETIRED_RECORD_TOOLS, tool.name)).toBe(false);
    }
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("documents every registered tool in both catalogs", () => {
    const registered = registeredToolNames();
    const missing: string[] = [];
    for (const locale of CATALOG_LOCALES) {
      const text = catalogTableText(locale);
      const documented = [...text.matchAll(CATALOG_TOOL_PATTERN)].map((match) => match[1]);
      expect(new Set(documented).size, `${locale}: duplicate tool entries`).toBe(documented.length);
      for (const name of registered) {
        if (!documented.includes(name)) missing.push(`${name} is missing from ${catalogPath(locale)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("documents no tool that is not registered", () => {
    const registered = registeredToolNames();
    const stale: string[] = [];
    for (const locale of CATALOG_LOCALES) {
      for (const match of catalogTableText(locale).matchAll(CATALOG_TOOL_PATTERN)) {
        if (!registered.has(match[1])) stale.push(`${match[1]} in ${catalogPath(locale)} matches no registered tool`);
      }
    }
    expect(stale).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "publishes no retired MCP tool name anywhere in product content",
    () => {
      const stale: string[] = [];
      const files = walkFiles(join(REPO_ROOT, "content"), (path) => path.endsWith(".mdx"));
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        for (const name of RETIRED_TOOL_NAMES)
          if (new RegExp(`\\b${name}\\b`).test(text)) stale.push(`${file.slice(REPO_ROOT.length + 1)}: ${name}`);
      }
      expect(stale, stale.join("\n")).toEqual([]);
    },
  );
});
