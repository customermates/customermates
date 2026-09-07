import Ajv from "ajv";
import { asSchema } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setTag: vi.fn(), setUser: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => {
    const translator = Object.assign((key: string) => key, { raw: (key: string) => `localized:${key}` });
    return Promise.resolve(translator);
  },
  getLocale: () => Promise.resolve("en"),
}));

import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";

import { getAgentAiToolDefinitions, getAgentAiTools, type AgentToolDeps } from "../agent-tools";

type JsonRecord = Record<string, unknown>;

const UNSUPPORTED_IN_PATTERN = /\(\?=|\(\?!|\(\?<=|\(\?<!/;

function deps(): AgentToolDeps {
  return {
    runUiCommand: () => Promise.resolve({ ok: true, result: "" }),
    requestApproval: () => Promise.resolve("approve"),
    resolveApprovalContext: (_toolName, input) => Promise.resolve({ ok: true, input }),
    createSupportTicket: () => Promise.resolve({ ok: true, result: "" }),
    runExactlyOnce: (_toolCallId, _toolName, run) => run(),
    runInCallerContext: (run) => run(),
    resultMaxChars: 6000,
  };
}

function walk(node: unknown, path: string, visit: (schema: JsonRecord, path: string) => void) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((entry, index) => walk(entry, `${path}[${index}]`, visit));
    return;
  }

  visit(node as JsonRecord, path);
  for (const [key, value] of Object.entries(node as JsonRecord)) walk(value, `${path}.${key}`, visit);
}

function collect(node: unknown, predicate: (schema: JsonRecord) => boolean) {
  const found: { path: string; schema: JsonRecord }[] = [];
  walk(node, "$", (schema, path) => {
    if (predicate(schema)) found.push({ path, schema });
  });
  return found;
}

const shippedSchemas = getAgentAiToolDefinitions().map((definition) => ({
  name: definition.name,
  schema: definition.inputSchema,
}));

describe("provider-safe tool schemas", () => {
  it("compiles every tool with the bare Ajv that the workflow runtime uses", () => {
    const ajv = new Ajv();
    const failures = shippedSchemas.flatMap(({ name, schema }) => {
      try {
        ajv.compile(schema as never);
        return [];
      } catch (error) {
        return [`${name}: ${(error as Error).message}`];
      }
    });

    expect(shippedSchemas.length).toBeGreaterThanOrEqual(46);
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("emits no format keyword anywhere, because that Ajv has no format support", () => {
    const offending = shippedSchemas.flatMap(({ name, schema }) =>
      collect(schema, (node) => typeof node.format === "string").map(({ path }) => `${name} ${path}`),
    );

    expect(offending, offending.join("\n")).toEqual([]);
  });

  it("leaves every field that carried a format still constrained by a pattern", () => {
    const uuid = "3f7c1a54-9b2e-4c31-8f6a-2b5d7e9c1a04";
    const census = new Map<string, number>();

    for (const mcp of ALL_MCP_TOOLS) {
      const withFormats = z.toJSONSchema(mcp.inputSchema as never, { io: "input", target: "draft-07" });
      const formatted = collect(withFormats, (node) => typeof node.format === "string");
      if (formatted.length === 0) continue;

      const shipped = shippedSchemas.find((entry) => entry.name === mcp.name);
      for (const { path, schema } of formatted) {
        const format = String(schema.format);
        census.set(format, (census.get(format) ?? 0) + 1);

        const node = path
          .replace(/^\$\.?/, "")
          .split(/\.|\[/)
          .filter(Boolean)
          .reduce<unknown>(
            (current, segment) => (current as JsonRecord | undefined)?.[segment.replace(/\]$/, "")],
            shipped?.schema,
          ) as JsonRecord | undefined;

        expect(node, `${mcp.name} ${path} disappeared`).toBeDefined();
        expect(typeof node?.pattern, `${mcp.name} ${path} (${format}) lost every constraint`).toBe("string");
        expect(UNSUPPORTED_IN_PATTERN.test(node?.pattern as string), `${mcp.name} ${path} kept a lookahead`).toBe(
          false,
        );

        const validate = new Ajv().compile({ type: "string", pattern: node?.pattern as string });
        if (format === "uuid") {
          expect(validate(uuid), `${mcp.name} ${path} rejects a real uuid`).toBe(true);
          expect(validate("not-a-uuid"), `${mcp.name} ${path} accepts garbage`).toBe(false);
        }
        if (format === "email") {
          expect(validate("ada@example.com"), `${mcp.name} ${path} rejects a real address`).toBe(true);
          expect(validate("not-an-email"), `${mcp.name} ${path} accepts garbage`).toBe(false);
        }
        if (format === "uri") {
          expect(validate("https://example.com/x"), `${mcp.name} ${path} rejects a real url`).toBe(true);
          expect(validate("not a uri"), `${mcp.name} ${path} accepts garbage`).toBe(false);
        }
      }
    }

    expect(Object.fromEntries(census)).toEqual({ uuid: 82, "date-time": 3, email: 6, uri: 4 });
  });

  it("still enforces the real constraint through the tool's own validator", async () => {
    const tools = getAgentAiTools(deps()) as unknown as Record<string, { inputSchema: unknown }>;
    const validateSendEmail = asSchema(tools.send_email.inputSchema as never).validate;
    expect(validateSendEmail).toBeDefined();

    const base = { connectedAccountId: "3f7c1a54-9b2e-4c31-8f6a-2b5d7e9c1a04", subject: "Hi", body: "There" };
    const good = await validateSendEmail?.({ ...base, to: [{ identifier: "ada@example.com" }] });
    const bad = await validateSendEmail?.({ ...base, to: [{ identifier: "definitely not an address" }] });

    expect(good?.success).toBe(true);
    expect(bad?.success).toBe(false);
  });
});
