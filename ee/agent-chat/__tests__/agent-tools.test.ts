import { TOOL_TYPE_ID, TOOL_RECORD_ID, TOOL_CREATE_RECORD, TOOL_CREATE_TYPE } from "@/tests/helpers/record-tools";
import { describe, expect, it, vi } from "vitest";
import { generateText, stepCountIs, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const recordNavigationHarness = vi.hoisted(() => ({
  types: [] as Array<{
    id: string;
    label: string;
    pluralLabel: string;
    icon: string;
    canCreate: boolean;
    hasAuthorizationTasks: boolean;
  }>,
  canManageSchema: false,
}));
const mockUser = createMockUser();
const sentryMock = vi.hoisted(() => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env } }));
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getGetRecordNavigationInteractor: () => ({
    invoke: () =>
      Promise.resolve({
        ok: true,
        data: { companyId: mockUser.companyId, schemaRevision: 1, ...recordNavigationHarness },
      }),
  }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => sentryMock);
vi.mock("next-intl/server", () => ({
  getTranslations: () => {
    const translator = Object.assign((key: string) => key, {
      raw: (key: string) => `localized:${key}`,
    });
    return Promise.resolve(translator);
  },
  getLocale: () => Promise.resolve("en"),
}));

import { getDocsPageTool, searchDocsTool } from "@/features/mcp-tools/docs.mcp-tools";
import { ALL_MCP_TOOLS, MCP_ALWAYS_ON_TOOLS } from "@/features/mcp-tools/tool-registry";

import {
  AGENT_TOOL_RESULT_TRUNCATED_MARK,
  agentContextTokensToBytes,
  agentRoundWorstCaseMicrocents,
  resolveAgentTurnBudget,
} from "../agent-budget-policy";
import { SendAgentMessageSchema } from "../agent-chat.schema";
import { conservativeAgentInitialContextBytes } from "../agent-provider-context";
import { toolsetsForRequest } from "../agent-toolset-routing";
import { ANALYZE_RECORDS_TOOL_NAME } from "../agent-toolset-routing";
import { WIKI_REFERENCE_MAX_BYTES, agentWikiReferenceBytes, serializeAgentWikiCatalog } from "../agent-wiki-context";
import { SHIPPED_AGENT_MODEL } from "../model-catalog";
import { buildAgentSystemPrompt } from "../system-prompt";
import { AGENT_UI_TARGETS, unopenedUiPrerequisite } from "../ui-targets";
import {
  AGENT_UI_TOOL_NAMES,
  agentToolDefinitionsForToolsets,
  agentToolDefinitionsForTurn,
  describeAgentAiTools,
  hasNonTransactionalEffect,
  getAgentAiToolDefinitions,
  getAgentAiTools,
  normalizeAgentAiToolInput,
  isAgentToolCancellation,
  type AgentToolDeps,
} from "../agent-tools";

function deps(overrides: Partial<AgentToolDeps> = {}): AgentToolDeps {
  return {
    runUiCommand: vi.fn().mockResolvedValue({ ok: true, result: "browser result" }),
    requestApproval: vi.fn().mockResolvedValue("approve"),
    resolveApprovalContext: vi.fn().mockImplementation((_toolName, input) => Promise.resolve({ ok: true, input })),
    createSupportTicket: vi.fn().mockResolvedValue({ ok: true, result: "created" }),
    runExactlyOnce: <T>(_toolCallId: string, _toolName: string, run: () => Promise<T>) => run(),
    runInCallerContext: (run) => run(),
    resultMaxChars: 6000,
    ...overrides,
  };
}

function schemaOf(tool: unknown) {
  return (
    tool as {
      inputSchema: {
        safeParse?: (value: unknown) => unknown;
        validate?: (value: unknown) => unknown;
      };
    }
  ).inputSchema;
}

function execute(tool: unknown, input: unknown, toolCallId = "call-1") {
  return (
    tool as {
      execute: (input: unknown, options: { toolCallId: string }) => unknown;
    }
  ).execute(input, { toolCallId });
}

describe("agent tools", () => {
  it("enrolls a mutation in an exactly-once receipt but never an effect it cannot roll back", async () => {
    const enrolled: string[] = [];
    const runExactlyOnce = <T>(toolCallId: string, toolName: string, run: () => Promise<T>) => {
      enrolled.push(`${toolName}:${toolCallId}`);
      return run();
    };
    const tools = getAgentAiTools(deps({ runExactlyOnce })) as unknown as Record<
      string,
      {
        execute: (input: unknown, options: { toolCallId: string }) => Promise<unknown>;
      }
    >;
    const ignoringOutcome = (call: Promise<unknown>) => call.catch(() => undefined);

    await ignoringOutcome(tools.mutate_crm_record.execute(TOOL_CREATE_RECORD, { toolCallId: "call-write" }));
    await ignoringOutcome(tools.send_email.execute({}, { toolCallId: "call-email" }));
    await ignoringOutcome(tools.query_crm_records.execute({ typeId: TOOL_TYPE_ID }, { toolCallId: "call-read" }));

    expect(enrolled).toEqual(["mutate_crm_record:call-write"]);
  });

  it("runs every tool through the caller's context, so none can execute without an identity", async () => {
    const entered: string[] = [];
    const runInCallerContext = async <T>(run: () => Promise<T>) => {
      entered.push("enter");
      try {
        return await run();
      } finally {
        entered.push("exit");
      }
    };
    const tools = getAgentAiTools(deps({ runInCallerContext })) as unknown as Record<
      string,
      {
        execute?: (input: unknown, options: { toolCallId: string }) => Promise<unknown>;
      }
    >;

    const executable = Object.entries(tools).filter(([, agentTool]) => typeof agentTool.execute === "function");
    expect(executable.length).toBeGreaterThanOrEqual(46);

    for (const [name, agentTool] of executable) {
      entered.length = 0;
      await agentTool.execute?.({}, { toolCallId: `call-${name}` }).catch(() => undefined);
      expect(entered, `${name} executed outside the caller context`).toEqual(["enter", "exit"]);
    }
  });

  it("classifies every tool that reaches a system it cannot roll back", () => {
    for (const name of [
      "send_email",
      "send_chat_message",
      "save_message_draft",
      "connect_messaging_account",
      "manage_social_relations",
      "linkedin_manage_sales_lists",
    ])
      expect(hasNonTransactionalEffect(name), name).toBe(true);

    for (const name of ["mutate_crm_record", "configure_record_model", "manage_widgets"])
      expect(hasNonTransactionalEffect(name), name).toBe(false);
  });

  it("exposes the MCP registry without the deep-research pair, plus the interface tools, load_toolset and analyze_records", () => {
    const names = Object.keys(getAgentAiTools(deps()));
    const deepResearch = new Set(MCP_ALWAYS_ON_TOOLS.map((agentTool) => agentTool.name));
    const expected = new Set([
      ...ALL_MCP_TOOLS.filter((agentTool) => !deepResearch.has(agentTool.name)).map((agentTool) => agentTool.name),
      ...AGENT_UI_TOOL_NAMES,
      "load_toolset",
      ANALYZE_RECORDS_TOOL_NAME,
    ]);

    expect(names.toSorted()).toEqual([...expected].toSorted());
    expect(names).not.toContain("search");
    expect(names).not.toContain("fetch");
    expect(names).toContain("load_toolset");
    expect(names).not.toContain("click_ui_target");
    expect(names.filter((name) => name === "request_support")).toHaveLength(1);
    expect(names.every((name) => !name.startsWith("discover_") || name === "discover_record_types")).toBe(true);
  });

  it("completes more than sixteen sequential tool rounds inside the extended turn", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const lookup = vi.fn().mockResolvedValue({ ok: true });
    const provider = createOpenAI({
      apiKey: "test-key",
      fetch: vi.fn((_input, init) => {
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        const round = requestBodies.length;
        const output =
          round <= 18
            ? [
                {
                  type: "function_call",
                  id: `fc_lookup_${round}`,
                  call_id: `call_lookup_${round}`,
                  name: "lookup",
                  arguments: JSON.stringify({ round }),
                  status: "completed",
                },
              ]
            : [
                {
                  type: "message",
                  role: "assistant",
                  id: "msg_complete",
                  content: [
                    {
                      type: "output_text",
                      text: "All eighteen checks are complete.",
                      annotations: [],
                    },
                  ],
                },
              ];
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: `resp_${round}`,
              created_at: 1_787_206_400,
              error: null,
              model: "gpt-5.6-luna",
              output,
              incomplete_details: null,
              usage: {
                input_tokens: 10,
                input_tokens_details: {
                  cached_tokens: 0,
                  cache_write_tokens: 0,
                },
                output_tokens: 2,
                output_tokens_details: { reasoning_tokens: 0 },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }) as never,
    });

    const result = await generateText({
      model: provider("gpt-5.6-luna"),
      prompt: "Run eighteen independent checks, then summarize them.",
      stopWhen: stepCountIs(20),
      tools: {
        lookup: tool({
          description: "Run one check.",
          inputSchema: z.object({ round: z.number().int().positive() }),
          execute: lookup,
        }),
      },
    });

    expect(lookup).toHaveBeenCalledTimes(18);
    expect(requestBodies).toHaveLength(19);
    expect(requestBodies.length).toBeGreaterThan(16);
    expect(result.text).toBe("All eighteen checks are complete.");
    expect(result.finishReason).toBe("stop");
  });

  it("keeps the request's initially active tools inside the conservative provider envelope", () => {
    const model = SHIPPED_AGENT_MODEL;
    const contextLimitBytes = agentContextTokensToBytes(model.maxContextTokens);
    const systemPrompt = buildAgentSystemPrompt({
      userName: "Ada Lovelace",
      locale: "en",
      surface: "chat",
    });
    const definitions = getAgentAiToolDefinitions();
    expect(definitions).toEqual(describeAgentAiTools(getAgentAiTools(deps())));
    const toolDefinitions = agentToolDefinitionsForToolsets(
      agentToolDefinitionsForTurn({ servingProvider: model.servingProvider, surface: "chat" }),
      [
        ...toolsetsForRequest({
          text: "Create Projects with calculated budget",
          pageRoute: "/en/records",
          contexts: [],
        }),
      ],
    );
    expect(toolDefinitions.length).toBeLessThan(definitions.length);

    const maxMessageChars = SendAgentMessageSchema.shape.text.maxLength;
    expect(maxMessageChars).toBe(20_000);
    const requiredContextBytes = conservativeAgentInitialContextBytes({
      systemPrompt,
      currentText: "Decide yourself and create the complete dataset.",
      pageRoute: "/en/records/10000000-0000-4000-8000-000000000102",
      toolDefinitions,
    });
    expect(requiredContextBytes).not.toBeNull();
    expect(
      requiredContextBytes,
      JSON.stringify(
        toolDefinitions
          .map(({ name, inputSchema }) => ({ name, bytes: JSON.stringify(inputSchema).length }))
          .sort((a, b) => b.bytes - a.bytes),
      ),
    ).toBeLessThan(contextLimitBytes);
    const contextHeadroomFloorBytes = 20_000;
    expect(contextLimitBytes - (requiredContextBytes ?? 0)).toBeGreaterThan(contextHeadroomFloorBytes);
    const funded = resolveAgentTurnBudget({
      model,
      availableMicrocents: agentRoundWorstCaseMicrocents(model),
      requiredContextBytes: requiredContextBytes ?? 0,
    });
    expect(funded).not.toBeNull();
    expect(funded?.maxContextBytes).toBeGreaterThanOrEqual(requiredContextBytes ?? Number.POSITIVE_INFINITY);
    expect(funded?.maxOutputTokens).toBe(model.maxOutputTokens);
  });

  it.each([
    ["chat", false],
    ["routine", false],
    ["chat", true],
    ["routine", true],
  ] as const)(
    "admits a full Unicode catalog on %s with the supported prompt limit on every catalog model (web search %s)",
    (surface, webSearchEnabled) => {
      const catalog = serializeAgentWikiCatalog({
        guide: {
          id: "00000000-0000-4000-8000-000000000099",
          title: "漢".repeat(120),
          url: "https://example.com/wiki",
          markdown: '漢"\\'.repeat(400),
          nextOffset: 1200,
        },
        procedures: {
          items: Array.from({ length: 20 }, (_, index) => ({
            id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
            title: "漢".repeat(120),
            url: "https://example.com/wiki",
            whenToUse: '漢"\\'.repeat(100),
          })),
          total: 40,
          truncated: true,
        },
        items: Array.from({ length: 10 }, (_, index) => ({
          id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          title: "漢".repeat(120),
          excerpt: '漢"\\'.repeat(50),
          url: `https://example.com/wiki?page=00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          kind: "knowledge" as const,
          whenToUse: null,

          createdAt: new Date("2026-09-13T00:00:00.000Z"),
          updatedAt: new Date("2026-09-13T00:00:00.000Z"),
        })),
        total: 20,
        page: 1,
        nextPage: 2,
        truncated: true,
      });
      expect(agentWikiReferenceBytes(catalog)).toBeGreaterThan(WIKI_REFERENCE_MAX_BYTES - 500);
      expect(agentWikiReferenceBytes(catalog)).toBeLessThanOrEqual(WIKI_REFERENCE_MAX_BYTES);
      const states = [
        { wikiCatalog: catalog, wikiWebsiteSetup: false },
        { wikiCatalog: null, wikiWebsiteSetup: true },
      ];
      for (const model of [SHIPPED_AGENT_MODEL]) {
        for (const { wikiCatalog, wikiWebsiteSetup } of states) {
          const label = `${model.modelId} catalog=${Boolean(wikiCatalog)} website=${wikiWebsiteSetup}`;
          const toolDefinitions = getAgentAiToolDefinitions(model.servingProvider, {
            surface,
            webSearchEnabled,
            wikiWebsiteSetup,
          });
          expect(toolDefinitions.some(({ name }) => name === "web_search")).toBe(webSearchEnabled);
          expect(
            toolDefinitions.some(({ name }) => name === "import_website"),
            label,
          ).toBe(wikiWebsiteSetup && surface === "chat");
          const requiredContextBytes = conservativeAgentInitialContextBytes({
            systemPrompt: buildAgentSystemPrompt({
              userName: "Test",
              locale: "en",
              surface,
              webSearchEnabled,
              wikiWebsiteSetup,
            }),
            currentText: "x".repeat(surface === "routine" ? 5000 : 20000),
            pageRoute: null,
            toolDefinitions: agentToolDefinitionsForToolsets(
              agentToolDefinitionsForTurn({
                servingProvider: model.servingProvider,
                surface,
                webSearchEnabled,
                wikiWebsiteSetup,
              }),
              ["record-model"],
            ),
            wikiCatalog,
          });
          expect(requiredContextBytes, label).not.toBeNull();
          const fits =
            (requiredContextBytes ?? Number.POSITIVE_INFINITY) <= agentContextTokensToBytes(model.maxContextTokens) &&
            resolveAgentTurnBudget({
              model,
              availableMicrocents: agentRoundWorstCaseMicrocents(model),
              requiredContextBytes: requiredContextBytes ?? undefined,
            }) !== null;
          expect(fits, label).toBe(true);
        }
      }
    },
  );

  it("rejects a tool name outside the catalog without running it", async () => {
    expect(await normalizeAgentAiToolInput("unknown_tool", {}, 6000)).toMatchObject({
      ok: false,
      result: expect.stringContaining("The requested tool is not available."),
    });
  });

  it("publishes fresh-state and minimal-patch instructions for saved-view updates", () => {
    const definition = getAgentAiToolDefinitions().find(({ name }) => name === "manage_data_views");
    const schema = definition?.inputSchema as { properties?: Record<string, unknown> } | undefined;
    const state = schema?.properties?.state as { description?: string } | undefined;

    expect(state?.description).toContain("call list immediately before every update");
    expect(state?.description).toContain("include only keys the user asked to change");
    expect(state?.description).toContain("Never copy old conversation/full state");
    expect(definition?.description).toContain(
      "never create a custom column to manufacture a missing saved-view filter",
    );
    expect(getAgentAiToolDefinitions().find(({ name }) => name === "configure_record_model")?.description).toContain(
      "Do not create or change a field only to manufacture an unsupported saved-view filter",
    );
    for (const field of ["section", "page", "pageSize", "query"]) expect(schema?.properties).toHaveProperty(field);
    expect(JSON.stringify(schema)).not.toContain("operator-users");
    expect(JSON.stringify(schema)).not.toContain("operator-workspaces");
    expect(JSON.stringify(schema)).not.toContain("operator-audit");
  });

  it.each([
    { action: "update", surfaceKey: "records:10000000-0000-4000-8000-000000000101", viewKey: "__all__" },
    { action: "update", surfaceKey: "records:10000000-0000-4000-8000-000000000101", viewKey: "__all__", state: {} },
    { action: "create", surfaceKey: "operator-users", name: "Operator", state: {} },
    {
      action: "delete",
      surfaceKey: "operator-users",
      viewKey: "00000000-0000-4000-8000-000000000001",
    },
  ])("rejects unsupported saved-view input during authoritative normalization: %j", async (input) => {
    await expect(
      normalizeAgentAiToolInput("manage_data_views", input, 6000, {
        pageRoute:
          "/en/records/10000000-0000-4000-8000-000000000101?view=__all__&viewSurface=records:10000000-0000-4000-8000-000000000101&viewAction=update",
      }),
    ).resolves.toMatchObject({
      ok: false,
      result: expect.stringContaining("Validation error"),
    });
  });

  it("gives the hosted agent a record-specific link for a timeline view created on a detail page", async () => {
    const viewKey = "00000000-0000-4000-8000-000000000001";
    const recordId = "00000000-0000-4000-8000-000000000002";
    const mcp = ALL_MCP_TOOLS.find(({ name }) => name === "manage_data_views");
    if (!mcp) throw new Error("manage_data_views is missing");
    const executeMcp = vi.spyOn(mcp, "execute").mockResolvedValue({
      text: `surfaceKey: entity-timeline\nviewKey: ${viewKey}\nlink: null`,
      structuredContent: {
        action: "create",
        surfaceKey: "entity-timeline",
        viewKey,
        link: null,
        selected: true,
      },
    });

    try {
      const result = await execute(
        getAgentAiTools(
          deps({
            pageRoute: `/en/records/10000000-0000-4000-8000-000000000101/${recordId}?view=__all__&viewSurface=entity-timeline`,
          }),
        ).manage_data_views,
        { action: "create", surfaceKey: "entity-timeline", name: "Contact created", state: {} },
      );

      expect(result).toMatchObject({ ok: true });
      expect(result).toMatchObject({
        navigation: {
          kind: "saved-view",
          href: `/records/10000000-0000-4000-8000-000000000101/${recordId}?view=${viewKey}&viewSurface=entity-timeline`,
        },
      });
      expect(JSON.stringify(result)).toContain(
        `/records/10000000-0000-4000-8000-000000000101/${recordId}?view=${viewKey}&viewSurface=entity-timeline`,
      );
      expect(JSON.stringify(result)).not.toContain("link: null");
    } finally {
      executeMcp.mockRestore();
    }
  });

  it("projects a validated saved-view destination outside the truncatable model result", async () => {
    const mcp = ALL_MCP_TOOLS.find(({ name }) => name === "manage_data_views");
    if (!mcp) throw new Error("manage_data_views is missing");
    const executeMcp = vi.spyOn(mcp, "execute").mockResolvedValue({
      text: "A deliberately long result that will not fit in the hosted model result budget.",
      structuredContent: {
        action: "update",
        surfaceKey: "records:10000000-0000-4000-8000-000000000101",
        viewKey: "__all__",
        link: "/records/10000000-0000-4000-8000-000000000101?view=__all__",
      },
    });

    try {
      const result = await execute(
        getAgentAiTools(
          deps({
            pageRoute:
              "/en/records/10000000-0000-4000-8000-000000000101?view=__all__&viewSurface=records:10000000-0000-4000-8000-000000000101&viewAction=update",
            resultMaxChars: 1,
          }),
        ).manage_data_views,
        {
          action: "update",
          surfaceKey: "records:10000000-0000-4000-8000-000000000101",
          viewKey: "__all__",
          state: { viewMode: "card" },
        },
      );

      expect(result).toMatchObject({
        ok: true,
        navigation: { kind: "saved-view", href: "/records/10000000-0000-4000-8000-000000000101?view=__all__" },
      });
    } finally {
      executeMcp.mockRestore();
    }
  });

  it("never projects navigation for saved-view reads or deletion", async () => {
    const viewKey = "00000000-0000-4000-8000-000000000001";
    const mcp = ALL_MCP_TOOLS.find(({ name }) => name === "manage_data_views");
    if (!mcp) throw new Error("manage_data_views is missing");
    const executeMcp = vi
      .spyOn(mcp, "execute")
      .mockResolvedValueOnce({
        text: "listed",
        structuredContent: {
          action: "list",
          surfaceKey: "records:10000000-0000-4000-8000-000000000101",
          link: `/records/10000000-0000-4000-8000-000000000101?view=${viewKey}`,
        },
      })
      .mockResolvedValueOnce({
        text: "deleted",
        structuredContent: {
          action: "delete",
          surfaceKey: "records:10000000-0000-4000-8000-000000000101",
          viewKey,
          deleted: true,
          link: `/records/10000000-0000-4000-8000-000000000101?view=${viewKey}`,
        },
      });

    try {
      const tools = getAgentAiTools(deps());
      const listed = await execute(tools.manage_data_views, {
        action: "list",
        surfaceKey: "records:10000000-0000-4000-8000-000000000101",
      });
      const deleted = await execute(tools.manage_data_views, {
        action: "delete",
        surfaceKey: "records:10000000-0000-4000-8000-000000000101",
        viewKey,
      });

      expect(listed).not.toHaveProperty("navigation");
      expect(deleted).not.toHaveProperty("navigation");
    } finally {
      executeMcp.mockRestore();
    }
  });

  it.each([
    { action: "create", surfaceKey: "records:10000000-0000-4000-8000-000000000103", name: "Linked deals", state: {} },
    {
      action: "update",
      surfaceKey: "records:10000000-0000-4000-8000-000000000103",
      viewKey: "__all__",
      state: { viewMode: "card" },
    },
    {
      action: "create",
      surfaceKey: "records:10000000-0000-4000-8000-000000000101",
      name: "Unexpected new view",
      state: {},
    },
    {
      action: "update",
      surfaceKey: "records:10000000-0000-4000-8000-000000000101",
      viewKey: "00000000-0000-4000-8000-000000000001",
      state: { viewMode: "card" },
    },
    {
      action: "delete",
      surfaceKey: "records:10000000-0000-4000-8000-000000000101",
      viewKey: "00000000-0000-4000-8000-000000000001",
    },
  ])("rejects a different target before approval or execution: $action $surfaceKey", async (input) => {
    const mcp = ALL_MCP_TOOLS.find(({ name }) => name === "manage_data_views");
    if (!mcp) throw new Error("manage_data_views is missing");
    const executeMcp = vi.spyOn(mcp, "execute");
    const dependencies = deps({
      pageRoute:
        "/en/records/10000000-0000-4000-8000-000000000101?view=__all__&viewSurface=records:10000000-0000-4000-8000-000000000101&viewAction=update",
      runExactlyOnce: vi.fn(),
    });
    try {
      const result = await execute(getAgentAiTools(dependencies).manage_data_views, input);
      expect(result).toMatchObject({
        ok: false,
        result: expect.stringContaining("surfaceKey=records:10000000-0000-4000-8000-000000000101"),
      });
      expect(executeMcp).not.toHaveBeenCalled();
      expect(dependencies.runExactlyOnce).not.toHaveBeenCalled();
      expect(dependencies.resolveApprovalContext).not.toHaveBeenCalled();
      await expect(
        normalizeAgentAiToolInput("manage_data_views", input, 6000, {
          pageRoute: dependencies.pageRoute,
        }),
      ).resolves.toEqual(result);
    } finally {
      executeMcp.mockRestore();
    }
  });

  it.each([
    [
      {
        action: "update",
        surfaceKey: "records:10000000-0000-4000-8000-000000000101",
        viewKey: "__all__",
        state: { viewMode: "card" },
      },
      "/en/records/10000000-0000-4000-8000-000000000101?view=__all__&viewSurface=records:10000000-0000-4000-8000-000000000101&viewAction=update",
    ],
    [
      { action: "create", surfaceKey: "entity-timeline", name: "My view", state: {} },
      "/en/records/10000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000001?view=__all__&viewSurface=entity-timeline&viewAction=create",
    ],
    [
      { action: "config", surfaceKey: "records:10000000-0000-4000-8000-000000000101" },
      "/en/records/10000000-0000-4000-8000-000000000101?view=__all__&viewSurface=records:10000000-0000-4000-8000-000000000101&viewAction=update",
    ],
    [
      { action: "list", surfaceKey: "records:10000000-0000-4000-8000-000000000101" },
      "/en/records/10000000-0000-4000-8000-000000000101?view=__all__&viewSurface=records:10000000-0000-4000-8000-000000000101&viewAction=update",
    ],
    [
      { action: "surfaces" },
      "/en/records/10000000-0000-4000-8000-000000000101?view=__all__&viewSurface=records:10000000-0000-4000-8000-000000000101&viewAction=update",
    ],
    [
      { action: "create", surfaceKey: "records:10000000-0000-4000-8000-000000000103", name: "My view", state: {} },
      null,
    ],
  ] as const)("keeps valid $0.action requests on the existing MCP execution path", async (input, pageRoute) => {
    const mcp = ALL_MCP_TOOLS.find(({ name }) => name === "manage_data_views");
    if (!mcp) throw new Error("manage_data_views is missing");
    const executeMcp = vi.spyOn(mcp, "execute").mockResolvedValue({ text: "Saved view operation completed." });
    try {
      const result = await execute(getAgentAiTools(deps({ pageRoute })).manage_data_views, input);
      expect(result).toMatchObject({ ok: true });
      expect(executeMcp).toHaveBeenCalledOnce();
    } finally {
      executeMcp.mockRestore();
    }
  });

  it("rejects a custom-field mutation from an Ask AI view request before approval or execution", async () => {
    const mcp = ALL_MCP_TOOLS.find(({ name }) => name === "configure_record_model");
    if (!mcp) throw new Error("configure_record_model is missing");
    const executeMcp = vi.spyOn(mcp, "execute");
    const input = TOOL_CREATE_TYPE;
    const dependencies = deps({
      pageRoute:
        "/en/records/10000000-0000-4000-8000-000000000101?view=__all__&viewSurface=records:10000000-0000-4000-8000-000000000101&viewAction=update",
      runExactlyOnce: vi.fn(),
    });
    try {
      const result = await execute(getAgentAiTools(dependencies).configure_record_model, input);
      expect(result).toMatchObject({
        ok: false,
        result: expect.stringContaining("Use only filter fields returned by manage_data_views config"),
      });
      expect(executeMcp).not.toHaveBeenCalled();
      expect(dependencies.runExactlyOnce).not.toHaveBeenCalled();
      expect(dependencies.resolveApprovalContext).not.toHaveBeenCalled();
      await expect(
        normalizeAgentAiToolInput("configure_record_model", input, 6000, { pageRoute: dependencies.pageRoute }),
      ).resolves.toEqual(result);
    } finally {
      executeMcp.mockRestore();
    }
  });

  it("accepts only exact navigation target ids and rejects URL-like model input", async () => {
    const tools = getAgentAiTools(deps());
    const validate = schemaOf(tools.navigate).validate;

    expect(await validate?.({ targetId: "nav-dashboard" })).toMatchObject({ success: true });
    for (const targetId of [
      "nav-contacts",
      "nav-deals",
      "javascript:alert(1)",
      "https://example.com",
      "//example.com",
      "/records/10000000-0000-4000-8000-000000000101",
    ])
      expect(await validate?.({ targetId }), targetId).toMatchObject({ success: false });
  });

  it("opens an existing record's page through navigate and rejects drawer, path and URL forms", async () => {
    const tools = getAgentAiTools(deps());
    const validate = schemaOf(tools.navigate).validate;
    const typeId = "10000000-0000-4000-8000-000000000001";
    const recordId = "00000000-0000-4000-8000-000000000001";

    expect(await validate?.({ typeId, recordId })).toMatchObject({ success: true });
    for (const bad of [
      "new",
      "/records/10000000-0000-4000-8000-000000000103/abc",
      "javascript:alert(1)",
      "https://example.com",
      "abc",
      "1234",
    ])
      expect(await validate?.({ typeId, recordId: bad }), bad).toMatchObject({ success: false });
    expect(await validate?.({ typeId: "not-a-type-id", recordId })).toMatchObject({ success: false });
    expect(await validate?.({ typeId })).toMatchObject({ success: false });
    expect(await validate?.({ recordId })).toMatchObject({ success: false });
    expect(await validate?.({})).toMatchObject({ success: false });
    expect(await validate?.({ targetId: "nav-deals", typeId, recordId })).toMatchObject({ success: false });
    expect("open_record" in tools).toBe(false);
  });

  it("discovers renamed custom-list targets from current access without generating per-type tool schemas", async () => {
    const typeId = "40000000-0000-4000-8000-000000000001";
    recordNavigationHarness.types = [
      {
        id: typeId,
        label: "Project",
        pluralLabel: "Projects",
        icon: "folder",
        canCreate: false,
        hasAuthorizationTasks: false,
      },
    ];
    try {
      const tools = getAgentAiTools(deps());
      const first = String(await execute(tools.list_ui_targets, { query: "Projects" }));
      expect(first).toContain(`nav-records:${typeId}|/records/${typeId}`);
      expect(first).toContain(`records:${typeId}:search`);
      expect(first).not.toContain(`records:${typeId}:add`);
      expect(first).not.toContain(`records:${typeId}:configure`);
      recordNavigationHarness.types[0].pluralLabel = "Engagements";
      const renamed = String(await execute(tools.list_ui_targets, { query: "Engagements" }));
      expect(renamed).toContain(`nav-records:${typeId}`);
      recordNavigationHarness.types = [];
      expect(String(await execute(tools.list_ui_targets, { query: "Engagements" }))).not.toContain(typeId);
    } finally {
      recordNavigationHarness.types = [];
    }
  });

  it("pages the complete UI target catalog within the tool-result budget", async () => {
    const tools = getAgentAiTools(deps({ resultMaxChars: 6000 }));
    const pages: string[] = [];
    let cursor: number | undefined;
    for (let page = 0; page < AGENT_UI_TARGETS.length; page += 1) {
      const result = String(await execute(tools.list_ui_targets, cursor === undefined ? {} : { cursor }));
      pages.push(result);
      const match = /\nnextCursor=(\d+);total=(\d+)$/.exec(result);
      if (!match) break;
      cursor = Number(match[1]);
    }

    expect(pages.length).toBeLessThanOrEqual(2);
    for (const result of pages) {
      expect(result.length).toBeLessThanOrEqual(6000);
      expect(result.startsWith("actions n=navigate,h=highlight")).toBe(true);
      expect(result).not.toContain("c=click");
    }
    expect(pages.at(-1)?.endsWith("\nend")).toBe(true);
    const ids = pages.flatMap((result) =>
      result
        .split("\n")
        .filter((line) => line.includes("|"))
        .map((line) => line.split("|")[0]),
    );
    expect(ids).toEqual(AGENT_UI_TARGETS.map((target) => target.id));
  });

  it("keeps every highlight target discoverable through bounded queries and pages", async () => {
    const tools = getAgentAiTools(deps({ resultMaxChars: 512 }));

    for (const target of AGENT_UI_TARGETS) {
      const result = String(await execute(tools.list_ui_targets, { query: target.id }));
      expect(result.length).toBeLessThanOrEqual(512);
      expect(result).toContain(target.id);
      expect(result).toContain("\nend");
    }

    recordNavigationHarness.types = [
      {
        id: TOOL_TYPE_ID,
        label: "Deal",
        pluralLabel: "Deals",
        icon: "briefcase",
        canCreate: true,
        hasAuthorizationTasks: false,
      },
    ];
    const layout = String(await execute(tools.list_ui_targets, { query: `records:${TOOL_TYPE_ID}:layout-board` }));
    expect(layout).toContain(
      `records:${TOOL_TYPE_ID}:layout-board|/records/${TOOL_TYPE_ID}|nh|>records:${TOOL_TYPE_ID}:display-options`,
    );
    recordNavigationHarness.types = [];
    expect(layout.split("\n")[0]).toBe(
      "actions n=navigate,h=highlight; >X is what the user must open first: a target id or a named row or card",
    );

    const seen: string[] = [];
    let cursor: number | undefined;
    for (let page = 0; page < AGENT_UI_TARGETS.length; page += 1) {
      const result = String(await execute(tools.list_ui_targets, cursor === undefined ? {} : { cursor }));
      expect(result.length).toBeLessThanOrEqual(512);
      seen.push(
        ...result
          .split("\n")
          .filter((line) => line.includes("|"))
          .map((line) => line.split("|")[0]),
      );
      const match = /nextCursor=(\d+);total=(\d+)/.exec(result);
      if (!match) break;
      cursor = Number(match[1]);
    }
    expect(seen).toEqual(AGENT_UI_TARGETS.map((target) => target.id));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("shows the assistant what the user must open before each dialog control", async () => {
    const tools = getAgentAiTools(deps({ resultMaxChars: 6000 }));
    const lineOf = async (id: string) =>
      String(await execute(tools.list_ui_targets, { query: id }))
        .split("\n")
        .find((line) => line.startsWith(`${id}|`));

    expect(await lineOf("member-modal-role")).toBe("member-modal-role|/settings/members|nh|>a member row");
    expect(await lineOf("member-modal-save")).toContain("|>a member row");
    expect(await lineOf("webhook-modal-delete")).toContain("|>a webhook row");
    expect(await lineOf("role-modal-delete")).toContain("|>a role row");
    expect(await lineOf("api-key-delete")).toContain("|>an API key card");
    expect(await lineOf("webhook-delivery-modal-resend")).toContain("|>a delivery row");
    expect(await lineOf("connected-account-disconnect")).toContain("|>a channel card");
    expect(await lineOf("connected-account-signature")).toContain("|>connected-account-tab-email");
    expect(await lineOf("widget-modal-save")).toBe("widget-modal-save|/dashboard|nh|>widget-modal-kind");
    expect(await lineOf("widget-modal-kind")).toBe("widget-modal-kind|/dashboard|nh|>dashboard-add-widget");
    expect(await lineOf("nav-settings-members")).toBe("nav-settings-members|/settings/members|nh");
    expect(await lineOf("nav-settings-api-keys")).toBe("nav-settings-api-keys|/settings/api-keys|nh");
    expect(await lineOf("widget-modal-reset")).toContain("|>a widget card");
    expect(await lineOf("webhook-modal-url")).toContain("|>company-webhooks-add");
  });

  it("answers one query that spans several pages, because the prompt asks for a single focused query", async () => {
    const contactId = "40000000-0000-4000-8000-000000000011";
    const dealId = "40000000-0000-4000-8000-000000000012";
    recordNavigationHarness.types = [
      {
        id: contactId,
        label: "Contact",
        pluralLabel: "Contacts",
        icon: "user",
        canCreate: true,
        hasAuthorizationTasks: false,
      },
      {
        id: dealId,
        label: "Deal",
        pluralLabel: "Deals",
        icon: "briefcase",
        canCreate: true,
        hasAuthorizationTasks: false,
      },
    ];
    const tools = getAgentAiTools(deps({ resultMaxChars: 4096 }));
    const result = String(
      await execute(tools.list_ui_targets, {
        query: "contacts, deals, and the dashboard",
      }),
    );

    expect(result).toContain(`nav-records:${contactId}`);
    expect(result).toContain(`nav-records:${dealId}`);
    expect(result).toContain("nav-dashboard");
    expect(result).not.toContain("nav-settings-webhooks");
    expect(result).not.toContain("nav-contacts|");
    recordNavigationHarness.types = [];
  });

  it("answers an unmatched query with an explicit miss and id prefixes instead of the whole catalog", async () => {
    const tools = getAgentAiTools(deps({ resultMaxChars: 4096 }));
    const result = String(await execute(tools.list_ui_targets, { query: "zzzz" }));

    expect(result).toContain('No interface target matches "zzzz"');
    expect(result).toContain("Target names are English");
    expect(result).toContain("nav-");
    expect(result).not.toContain(AGENT_UI_TARGETS[0].id);
    expect(result.length).toBeLessThan(600);
  });

  it("matches the sidebar's page names in the app's other languages", async () => {
    recordNavigationHarness.types = [
      {
        id: TOOL_TYPE_ID,
        label: "Aufgabe",
        pluralLabel: "Aufgaben",
        icon: "check",
        canCreate: true,
        hasAuthorizationTasks: false,
      },
    ];
    const tools = getAgentAiTools(deps({ resultMaxChars: 6000 }));
    const invite = String(await execute(tools.list_ui_targets, { query: "Mitglieder einladen" }));
    const inbox = String(await execute(tools.list_ui_targets, { query: "Posteingang" }));
    const tasks = String(await execute(tools.list_ui_targets, { query: "Aufgaben" }));

    expect(invite).not.toContain("No interface target matches");
    for (const id of ["nav-settings-members", "company-members-add", "invite-modal-tab-email", "invite-modal-send"])
      expect(invite, id).toContain(`${id}|`);
    expect(invite).not.toContain("nav-deals|");
    expect(inbox).toContain("nav-inbox|/inbox|nh");
    expect(tasks).toContain(`nav-records:${TOOL_TYPE_ID}|/records/${TOOL_TYPE_ID}|nh`);
    expect(tasks).toContain(`records:${TOOL_TYPE_ID}:add|/records/${TOOL_TYPE_ID}|nh`);
    recordNavigationHarness.types = [];
  });

  it.each([
    ["Workspace-Menü", "nav-workspace-menu"],
    ["Persönliches Menü", "nav-personal-menu"],
    ["Suchen", "nav-search"],
    ["perfil", "nav-settings-profile"],
    ["Miembros", "nav-settings-members"],
    ["Facturation", "nav-settings-billing"],
    ["profilo", "nav-settings-profile"],
    ["Kanäle", "nav-settings-channels"],
    ["Buscar", "nav-search"],
    ["Rechercher", "nav-search"],
    ["Cerca", "nav-search"],
    ["Menú personal", "nav-personal-menu"],
    ["Menu personnel", "nav-personal-menu"],
  ])("matches the localized sidebar name %s of a group or utility entry", async (query, id) => {
    const tools = getAgentAiTools(deps({ resultMaxChars: 6000 }));
    const result = String(await execute(tools.list_ui_targets, { query }));

    expect(result).toContain(`\n${id}|`);
  });

  it.each([
    ["leads", "add"],
    ["Clients", "search"],
    ["Accounts", "add"],
    ["Opportunities", "add"],
    ["Products", "add"],
    ["To-dos", "add"],
    ["Aufträge", "filter"],
    ["Cuentas", "filter"],
  ])("matches the renamed record type %s to its page", async (query, control) => {
    recordNavigationHarness.types = [
      {
        id: TOOL_TYPE_ID,
        label: query,
        pluralLabel: query,
        icon: "folder",
        canCreate: true,
        hasAuthorizationTasks: false,
      },
    ];
    const tools = getAgentAiTools(deps({ resultMaxChars: 6000 }));
    const result = String(await execute(tools.list_ui_targets, { query }));

    expect(result).toContain(`\nnav-records:${TOOL_TYPE_ID}|`);
    expect(result).toContain(`\nrecords:${TOOL_TYPE_ID}:${control}|`);
    recordNavigationHarness.types = [];
  });

  it.each([
    ["Posta in arrivo", "nav-inbox"],
    ["Bandeja de entrada", "nav-inbox"],
    ["Boîte de réception", "nav-inbox"],
    ["Tableau de bord", "nav-dashboard"],
    ["Menú personal", "nav-personal-menu"],
    ["Chiavi API", "nav-settings-api-keys"],
    ["Clés API", "nav-settings-api-keys"],
    ["Menu del workspace", "nav-workspace-menu"],
  ])("answers the multi-word page name %s with that page instead of most of the catalog", async (query, id) => {
    const tools = getAgentAiTools(deps({ resultMaxChars: 6000 }));
    const result = String(await execute(tools.list_ui_targets, { query }));
    const ids = result.split("\n").filter((line) => line.includes("|"));

    expect(result).toContain(`\n${id}|`);
    expect(ids.length).toBeLessThanOrEqual(10);
  });

  it("lists an exact id first and still lists the targets it prefixes", async () => {
    const tools = getAgentAiTools(deps({ resultMaxChars: 6000 }));
    const lines = String(await execute(tools.list_ui_targets, { query: "nav-settings-webhooks" }))
      .split("\n")
      .filter((line) => line.includes("|"))
      .map((line) => line.split("|")[0]);
    const prefixed = String(await execute(tools.list_ui_targets, { query: "nav-settings-" }))
      .split("\n")
      .filter((line) => line.includes("|"))
      .map((line) => line.split("|")[0]);
    const subLinks = AGENT_UI_TARGETS.filter((target) => target.id.startsWith("nav-settings-")).map(
      (target) => target.id,
    );

    expect(lines[0]).toBe("nav-settings-webhooks");
    expect(prefixed).toEqual(subLinks);

    recordNavigationHarness.types = [
      {
        id: TOOL_TYPE_ID,
        label: "Deal",
        pluralLabel: "Deals",
        icon: "briefcase",
        canCreate: true,
        hasAuthorizationTasks: false,
      },
    ];
    const layout = String(await execute(tools.list_ui_targets, { query: `records:${TOOL_TYPE_ID}:layout-table` }))
      .split("\n")
      .filter((line) => line.includes("|"))
      .map((line) => line.split("|")[0]);
    expect(layout[0]).toBe(`records:${TOOL_TYPE_ID}:layout-table`);
    recordNavigationHarness.types = [];
  });

  it("discovers the connected-account destination and walkthrough control together", async () => {
    const tools = getAgentAiTools(deps({ resultMaxChars: 512 }));
    const workflow = String(await execute(tools.list_ui_targets, { query: "connected accounts" }));
    const provider = String(await execute(tools.list_ui_targets, { query: "WhatsApp" }));

    expect(workflow).toContain("nav-settings-channels");
    expect(workflow).toContain("profile-connected-accounts-connect");
    expect(workflow).toMatch(/\n(?:end|nextCursor=\d+;total=\d+)$/);
    expect(provider).toContain("profile-connected-accounts-connect");
    expect(
      await schemaOf(tools.highlight_element).validate?.({
        targetId: "profile-connected-accounts-connect",
      }),
    ).toMatchObject({ success: true });
  });

  it.each([
    ["navigate", { targetId: "nav-contacts" }, "navigation failed"],
    ["highlight_element", { targetId: "contacts-add" }, "highlight failed"],
    [
      "start_tour",
      {
        steps: [
          {
            targetId: "nav-contacts",
            note: "Contacts are the people you work with.",
          },
          { targetId: "contacts-add", note: "Add a contact from here." },
        ],
      },
      "tour failed",
    ],
  ] as const)("awaits the browser's exact result for %s", async (name, input, result) => {
    const outcome = { ok: false, result };
    const runUiCommand = vi.fn().mockResolvedValue(outcome);
    const tools = getAgentAiTools(deps({ runUiCommand }));

    await expect(execute(tools[name], input)).resolves.toEqual(outcome);
    expect(runUiCommand).toHaveBeenCalledWith("call-1", name, input);
  });

  it("refuses a highlight or tour that skips a target's opener, and passes one that goes through it", async () => {
    const runUiCommand = vi.fn().mockResolvedValue({ ok: true, result: "shown" });
    const tools = getAgentAiTools(deps({ runUiCommand }));
    const refusal =
      "company-webhooks-layout-board is inside company-webhooks-display-options, which the user must open first, so nothing was shown. Highlight company-webhooks-display-options and tell the user to open it, or run start_tour with company-webhooks-display-options as the step before company-webhooks-layout-board.";

    await expect(execute(tools.highlight_element, { targetId: "company-webhooks-layout-board" })).resolves.toEqual({
      ok: false,
      result: refusal,
    });
    await expect(
      execute(tools.start_tour, {
        steps: [
          { targetId: "nav-settings-webhooks", note: "Open webhooks." },
          { targetId: "company-webhooks-layout-board", note: "Switch to the board." },
        ],
      }),
    ).resolves.toEqual({ ok: false, result: refusal });
    expect(runUiCommand).not.toHaveBeenCalled();

    const throughOpener = {
      steps: [
        {
          targetId: "company-webhooks-display-options",
          note: "Open the display options.",
        },
        { targetId: "company-webhooks-layout-board", note: "Switch to the board." },
      ],
    };
    await expect(execute(tools.highlight_element, { targetId: "company-webhooks-display-options" })).resolves.toEqual({
      ok: true,
      result: "shown",
    });
    await expect(execute(tools.start_tour, throughOpener)).resolves.toEqual({
      ok: true,
      result: "shown",
    });
    const namedRow = AGENT_UI_TARGETS.find(
      (target) =>
        target.prerequisite !== undefined && !AGENT_UI_TARGETS.some((other) => other.id === target.prerequisite),
    );
    if (!namedRow) throw new Error("expected a target whose opener is a named row");
    await expect(execute(tools.highlight_element, { targetId: namedRow.id })).resolves.toEqual({
      ok: true,
      result: "shown",
    });
    expect(runUiCommand.mock.calls.map(([, name, input]) => [name, input])).toEqual([
      ["highlight_element", { targetId: "company-webhooks-display-options" }],
      ["start_tour", throughOpener],
      ["highlight_element", { targetId: namedRow.id }],
    ]);
  });

  it("requires every opener in a chain, in order, before the target inside it", () => {
    for (const target of AGENT_UI_TARGETS.filter((candidate) => candidate.prerequisite)) {
      const opener = AGENT_UI_TARGETS.find((candidate) => candidate.id === target.prerequisite);
      if (!opener) {
        expect(unopenedUiPrerequisite(target.id)).toBeNull();
        continue;
      }
      expect(unopenedUiPrerequisite(target.id)).toBe(opener.id);
      expect(unopenedUiPrerequisite(target.id, [opener.id])).toBeNull();
      expect(unopenedUiPrerequisite(target.id, ["nav-deals"])).toBe(opener.id);
    }
  });

  it("caps browser command results to the admitted per-tool context budget and says it truncated", async () => {
    const runUiCommand = vi.fn().mockResolvedValue({ ok: true, result: "x".repeat(1000) });
    const tools = getAgentAiTools(deps({ runUiCommand, resultMaxChars: 512 }));

    const outcome = (await execute(tools.navigate, {
      targetId: "nav-contacts",
    })) as { ok: boolean; result: string };
    expect(outcome.ok).toBe(true);
    expect(outcome.result.length).toBeLessThanOrEqual(512);
    expect(outcome.result).toContain(AGENT_TOOL_RESULT_TRUNCATED_MARK);
    expect(outcome.result).toContain("of 1000 characters");
  });

  it("preserves Zod defaults while sending a provider-safe JSON schema", async () => {
    const result = await schemaOf(getAgentAiTools(deps()).search_docs).validate?.({ query: "contacts" });

    expect(result).toEqual({
      success: true,
      value: { query: "contacts", locale: "en", source: "docs" },
    });
  });

  it.each([
    ["list_users", { searchTerm: "Sofia" }, { searchTerm: "Sofia", page: 1, pageSize: 25 }],
    ["list_users", { searchTerm: "Sofia", pageSize: " 12 " }, { searchTerm: "Sofia", page: 1, pageSize: 12 }],
    [
      "list_users",
      { searchTerm: "Sofia", page: "2", pageSize: " 10 " },
      { searchTerm: "Sofia", page: 2, pageSize: 10 },
    ],
    ["search_crm_records", { searchTerm: "Project" }, { searchTerm: "Project", limit: 40, cursor: null }],
    [
      "read_crm_record",
      { typeId: TOOL_TYPE_ID, recordId: TOOL_RECORD_ID },
      { typeId: TOOL_TYPE_ID, recordId: TOOL_RECORD_ID },
    ],
    ["search_docs", { query: "contacts" }, { query: "contacts", locale: "en", source: "docs" }],
  ])("restores authoritative defaults and coercions for durable %s input", async (name, input, expected) => {
    const serialized = JSON.parse(JSON.stringify(input));
    await expect(normalizeAgentAiToolInput(name, serialized, 6000)).resolves.toEqual({
      ok: true,
      input: expected,
    });
    expect(serialized).toEqual(input);
  });

  it("applies panel refinements and transforms before a command can be emitted", async () => {
    await expect(normalizeAgentAiToolInput("navigate", {}, 6000)).resolves.toMatchObject({ ok: false });
    await expect(
      normalizeAgentAiToolInput(
        "start_tour",
        {
          steps: [
            { targetId: "nav-routines", note: " Routines " },
            { targetId: "routines-add", note: " Add " },
          ],
        },
        6000,
      ),
    ).resolves.toEqual({
      ok: true,
      input: {
        steps: [
          { targetId: "nav-routines", note: "Routines" },
          { targetId: "routines-add", note: "Add" },
        ],
      },
    });
    await expect(
      normalizeAgentAiToolInput(
        "start_tour",
        {
          steps: [
            { targetId: "nav-routines", note: "   " },
            { targetId: "routines-add", note: " Add " },
          ],
        },
        6000,
      ),
    ).resolves.toMatchObject({ ok: false });
  });

  it.each(["not-a-tool", "__proto__", "constructor"])("rejects unknown tool identity %s", async (name) => {
    await expect(normalizeAgentAiToolInput(name, {}, 6000)).resolves.toEqual({
      ok: false,
      result: "The requested tool is not available.",
    });
  });

  it("returns bounded validation failures without executing a mutation", async () => {
    const target = ALL_MCP_TOOLS.find((item) => item.name === "mutate_crm_record");
    if (!target) throw new Error("Missing mutate_crm_record tool.");
    const mutation = vi.spyOn(target, "execute");
    const result = await normalizeAgentAiToolInput("mutate_crm_record", { mutation: { action: "create" } }, 32);

    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("Invalid tool input passed.");
    expect(result.result.length).toBeLessThanOrEqual(32);
    expect(mutation).not.toHaveBeenCalled();
    mutation.mockRestore();
  });

  it("rejects invalid decimal values before a write can execute", async () => {
    await expect(
      normalizeAgentAiToolInput(
        "mutate_crm_record",
        {
          ...TOOL_CREATE_RECORD,
          mutation: {
            ...TOOL_CREATE_RECORD.mutation,
            fields: [{ fieldId: TOOL_TYPE_ID, value: { kind: "decimal", value: "NaN", currency: "EUR" } }],
          },
        },
        6000,
      ),
    ).resolves.toMatchObject({
      ok: false,
    });
  });

  it("keeps the head of a documentation result inside the admitted 512-character tool result", async () => {
    const tools = getAgentAiTools(deps({ resultMaxChars: 512 }));
    const excerpt = `## How do I connect a channel?\nOpen #nav-settings-channels, then #profile-connected-accounts-connect and choose WhatsApp.\n${"More detail. ".repeat(80)}`;
    vi.spyOn(searchDocsTool, "execute").mockResolvedValueOnce({
      text: `matches:\ndocs:app-profile#how-do-i-connect-a-channel\ndocs:app-inbox#do-i-need-a-connected-channel\ntotal=2\nbest=http://localhost:4000/en/docs/app-profile\nexcerpt=\n${excerpt}`,
      structuredContent: { results: [], total: 2 },
    });
    vi.spyOn(getDocsPageTool, "execute").mockResolvedValueOnce({
      text: `${excerpt}\n\nSource: Profile\nURL: http://localhost:4000/en/docs/app-profile`,
      structuredContent: {
        title: "Profile",
        url: "http://localhost:4000/en/docs/app-profile",
        markdown: excerpt,
        excerpt: true,
      },
    });
    const query = "Walk me through connecting WhatsApp to the Customermates inbox.";
    const searchResult = (await execute(tools.search_docs, {
      query,
      locale: "en",
      source: "docs",
    })) as {
      ok: boolean;
      result: string;
    };
    const pageResult = (await execute(tools.get_docs_page, {
      slug: "app-profile",
      query,
      locale: "en",
      source: "docs",
    })) as { ok: boolean; result: string };

    expect(searchResult).toMatchObject({ ok: true });
    expect(searchResult.result.length).toBeLessThanOrEqual(512);
    expect(searchResult.result).toContain("app-inbox");
    expect(searchResult.result).toContain("app-profile");
    expect(pageResult).toMatchObject({ ok: true });
    expect(pageResult.result.length).toBeLessThanOrEqual(512);
    expect(pageResult.result).toContain("nav-settings-channels");
    expect(pageResult.result).toContain("profile-connected-accounts-connect");
    expect(pageResult.result).toContain("WhatsApp");
  });

  it("keeps runtime validation for sanitized CRM schemas", async () => {
    const result = await schemaOf(getAgentAiTools(deps()).mutate_crm_record).validate?.({
      mutation: { action: "create" },
    });

    expect(result).toMatchObject({ success: false });
  });

  it("leaves unexpected CRM error capture to the runner and exposes only a stable tool failure", async () => {
    const secretError = new Error("postgres password=do-not-disclose");
    vi.spyOn(searchDocsTool, "execute").mockImplementationOnce(() => {
      throw secretError;
    });
    const tools = getAgentAiTools(deps());

    let failure: unknown;
    try {
      await execute(tools.search_docs, {
        query: "contacts",
        locale: "en",
        source: "docs",
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({
      message: "The assistant tool could not be completed.",
    });
    expect((failure as Error).cause).toBeUndefined();
    expect((failure as Error).stack).not.toContain("do-not-disclose");
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("returns a structured failure for validation errors instead of marking the activity done", async () => {
    vi.spyOn(searchDocsTool, "execute").mockResolvedValueOnce("Validation error: invalid docs query" as never);
    const tools = getAgentAiTools(deps());

    await expect(
      execute(tools.search_docs, {
        query: "contacts",
        locale: "en",
        source: "docs",
      }),
    ).resolves.toEqual({
      ok: false,
      result: "Validation error: invalid docs query",
      failure: {
        kind: "validation",
        issues: [{ code: "custom", path: [], message: "invalid docs query" }],
      },
    });
  });

  it("shows request_support as an approval-gated action before sending an email", async () => {
    const input = {
      subject: "Need help",
      body: "Please connect me with a human.",
    };
    const requestApproval = vi.fn().mockResolvedValue("approve");
    const createSupportTicket = vi.fn().mockResolvedValue({ ok: true, result: "request emailed" });
    const tools = getAgentAiTools(deps({ requestApproval, createSupportTicket }));

    await expect(execute(tools.request_support, input, "support-1")).resolves.toEqual({
      ok: true,
      result: "request emailed",
    });
    expect(requestApproval).toHaveBeenCalledWith("support-1", "request_support", input);
    expect(createSupportTicket).toHaveBeenCalledWith("support-1", input.subject, input.body);
  });

  it.each([
    ["mutate_crm_record", { mutation: { action: "delete" } }],
    ["configure_record_model", { action: "apply", change: { operations: [{ operation: "publishSummary" }] } }],
    ["manage_widgets", { action: "delete" }],
    ["manage_webhooks", { action: "delete" }],
    ["manage_team", { action: "invite" }],
    ["manage_webhooks", { action: "resend_delivery" }],
    ["configure_record_model", {}],
    ["manage_widgets", {}],
    ["manage_webhooks", {}],
  ] as [string, Record<string, unknown>][])(
    "requires an approval for destructive call %s %j",
    async (toolName, input) => {
      const requestApproval = vi.fn().mockResolvedValue("reject");
      const tools = getAgentAiTools(deps({ requestApproval }));

      await expect(execute(tools[toolName], input, `sensitive-${toolName}`)).resolves.toMatchObject({
        agentToolStatus: "cancelled",
        reason: "rejected",
      });
      expect(requestApproval).toHaveBeenCalledWith(`sensitive-${toolName}`, toolName, input);
    },
  );

  it("verifies an external target against the provider even though the call no longer asks", async () => {
    const input = {
      action: "invite",
      connectedAccountId: "account-1",
      identifier: "provider-ada",
    };
    const resolveApprovalContext = vi.fn().mockResolvedValue({
      ok: true,
      input: { ...input, targetLabel: "Ada Lovelace" },
    });
    const requestApproval = vi.fn().mockResolvedValue("reject");
    const tools = getAgentAiTools(deps({ requestApproval, resolveApprovalContext }));

    await Promise.resolve(execute(tools.manage_social_relations, input, "social-approval")).catch(() => undefined);

    expect(resolveApprovalContext).toHaveBeenCalledWith("manage_social_relations", input);
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("does not request approval when authoritative external context cannot be resolved", async () => {
    const resolveApprovalContext = vi.fn().mockResolvedValue({
      ok: false,
      result: "The external target could not be verified.",
    });
    const requestApproval = vi.fn().mockResolvedValue("approve");
    const tools = getAgentAiTools(deps({ requestApproval, resolveApprovalContext }));

    await expect(
      execute(
        tools.linkedin_manage_sales_lists,
        {
          action: "save",
          connectedAccountId: "account-1",
          listId: "list-1",
          providerId: "lead-1",
        },
        "sales-approval",
      ),
    ).resolves.toEqual({
      ok: false,
      result: "The external target could not be verified.",
    });
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("returns approval-context permission failures as bounded tool results without capturing Sentry", async () => {
    const accessError = new ForbiddenError("inactive raw detail", AppErrorCode.inactiveUser);
    const resolveApprovalContext = vi.fn().mockRejectedValue(
      new Error("outer approval adapter", {
        cause: new Error("inner approval adapter", { cause: accessError }),
      }),
    );
    const requestApproval = vi.fn().mockResolvedValue("approve");
    const tools = getAgentAiTools(deps({ requestApproval, resolveApprovalContext, resultMaxChars: 512 }));

    await expect(
      execute(
        tools.manage_social_relations,
        {
          action: "invite",
          connectedAccountId: "account-1",
          identifier: "provider-ada",
        },
        "social-approval",
      ),
    ).resolves.toEqual({
      ok: false,
      result: "localized:userInactive",
      failure: {
        kind: "authorization",
        issues: [{ code: "custom", path: [], message: "localized:userInactive", customCode: "userInactive" }],
      },
    });
    expect(requestApproval).not.toHaveBeenCalled();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("does not expose unbounded structured MCP payloads to the hosted model", async () => {
    vi.spyOn(searchDocsTool, "execute")
      .mockImplementationOnce(
        () =>
          Promise.resolve({
            text: "done",
            structuredContent: { rows: ["x".repeat(20_000)] },
          }) as never,
      )
      .mockImplementationOnce(
        () =>
          Promise.resolve({
            text: "x".repeat(20_000),
            failure: {
              kind: "validation",
              issues: Array.from({ length: 100 }, (_, index) => ({
                code: "custom",
                path: ["rows", index],
                message: "x".repeat(1_000),
              })),
            },
          }) as never,
      );
    const tools = getAgentAiTools(deps({ resultMaxChars: 512 }));

    await expect(
      execute(tools.search_docs, {
        query: "contacts",
        locale: "en",
        source: "docs",
      }),
    ).resolves.toEqual({
      ok: true,
      result: "done",
    });

    const failed = (await execute(tools.search_docs, {
      query: "contacts",
      locale: "en",
      source: "docs",
    })) as {
      ok: boolean;
      result: string;
    };
    expect(failed.ok).toBe(false);
    expect(failed.result.length).toBeLessThanOrEqual(512);
    expect(failed.result).toContain(AGENT_TOOL_RESULT_TRUNCATED_MARK);
    expect(JSON.stringify(failed).length).toBeLessThan(600);
  });

  it.each([
    ["mutate_crm_record", TOOL_CREATE_RECORD],
    ["mutate_crm_record", { mutation: { action: "update" } }],
    ["mutate_crm_record", { mutation: { action: "link" } }],
    ["mutate_crm_record", { mutation: { action: "unlink" } }],
    ["save_message_draft", {}],
    ["discard_message_draft", {}],
    ["update_messaging_thread", {}],
    ["update_workspace_settings", {}],
    ["manage_team", { action: "update_member" }],
    ["connect_messaging_account", {}],
    ["configure_record_model", { action: "preview" }],
    ["manage_widgets", { action: "list" }],
    ["manage_webhooks", { action: "list" }],
    ["manage_social_relations", { action: "list" }],
    ["linkedin_manage_sales_lists", { action: "list" }],
    ["linkedin_manage_sales_lists", { action: "browse" }],
    ["linkedin_manage_sales_lists", { action: "save" }],
    ["manage_social_relations", { action: "invite" }],
    ["manage_social_relations", { action: "accept" }],
    ["manage_social_relations", { action: "cancel" }],
  ] as [string, Record<string, unknown>][])(
    "runs ordinary CRM call %s %j without asking for approval",
    async (toolName, input) => {
      const requestApproval = vi.fn().mockResolvedValue("reject");
      const tools = getAgentAiTools(deps({ requestApproval }));

      await Promise.resolve(execute(tools[toolName], input, `free-${toolName}`)).catch(() => undefined);

      expect(requestApproval).not.toHaveBeenCalled();
    },
  );

  it.each(["reject", "timeout"] as const)("does not email support when escalation resolves to %s", async (decision) => {
    const requestApproval = vi.fn().mockResolvedValue(decision);
    const createSupportTicket = vi.fn().mockResolvedValue({ ok: true, result: "request emailed" });
    const tools = getAgentAiTools(deps({ requestApproval, createSupportTicket }));

    const result = await execute(tools.request_support, { subject: "Need help", body: "Human please" }, "support-2");

    expect(isAgentToolCancellation(result)).toBe(true);
    expect(result).toMatchObject({
      agentToolStatus: "cancelled",
      reason: decision === "reject" ? "rejected" : "timeout",
    });
    expect(createSupportTicket).not.toHaveBeenCalled();
  });

  it.each([
    ["chat", "got no answer in time"],
    ["routine", "Nobody is watching this run"],
  ] as const)("words an unanswered approval for the %s surface", async (surface, wording) => {
    const requestApproval = vi.fn().mockResolvedValue("timeout");
    const tools = getAgentAiTools(deps({ requestApproval }), { surface });

    const result = await execute(tools.request_support, { subject: "Need help", body: "Human please" }, "support-3");

    expect(result).toMatchObject({
      agentToolStatus: "cancelled",
      message: expect.stringContaining(wording),
    });
  });

  it("gives the model truthful, neutral capability and approval instructions", () => {
    const prompt = buildAgentSystemPrompt({
      userName: "Ada",
      locale: "en",
      surface: "chat",
    });

    expect(prompt).not.toMatch(/Always allow/i);
    expect(prompt).not.toContain("onboarding copilot");
    expect(prompt).not.toContain("Do not attempt heavy multi-step automation");
    expect(prompt).toContain("load the matching tool set");
    expect(prompt).toContain(
      "Authorization, entitlements, connected-account state, and approval are enforced when a tool runs",
    );
    expect(prompt).toContain("current page is context, never a capability boundary");
    expect(prompt).toContain("Never infer that a capability is unavailable");
    expect(prompt).toContain("Ordinary CRM work also runs immediately");
    expect(prompt).toContain("require a fresh explicit approval every time; there is no standing permission to offer");
    expect(prompt).toContain("Destructive actions");
    expect(prompt).toContain("team invitations");
    expect(prompt).toContain("workspace settings, custom fields");
    expect(prompt).toContain("webhook delivery resends");
    expect(prompt).toContain("If an approval is declined or times out, nothing changed");
    expect(prompt).toContain("A support email is sent only after that approval is granted");
    expect(prompt).toContain("use the available tools directly");
    expect(prompt).toContain("connected definitions in one atomic bundle");
    expect(prompt).toContain("one focused search_docs call");
    expect(prompt).toContain("using its nonempty returned anchor as anchor and the original question as query");
    expect(prompt).toContain("omit anchor and query when its anchor is empty");
    expect(prompt).toContain("For a different detail, omit anchor and pass that exact detail as query");
    expect(prompt).toContain("Make one focused list_ui_targets query");
    expect(prompt).toContain("A tour navigates to each step itself");
    expect(prompt).toContain("never click or activate interface controls");
    expect(prompt).toContain("asks to walk them through or show them how to connect an account");
    expect(prompt).toContain("configure_record_model");
    expect(prompt).toContain("stable relationship ids");
    expect(prompt).toContain("page_context includes requestedAction");
    expect(prompt).toContain("linked-record filters never change that target");
    expect(prompt).toContain("follow the user's explicit named-view action");
    expect(prompt).toContain("create from All only when they ask for a new view");
    expect(prompt).toContain("do not repeat or construct their URLs in prose");
    expect(prompt).toContain("On stale revision, read and preview again");
    expect(prompt).toContain("Never print or imitate tool-call syntax as text");
    expect(prompt).toContain("keep working while credits remain");
    expect(prompt).toContain("a credit limit, provider error, content filter, hosted-AI unavailability");
    expect(prompt).not.toContain("time, approval, output, or no-progress bound");
  });
});

describe("system prompt reply language", () => {
  it("names the interface language so workspace data cannot decide it", () => {
    const german = buildAgentSystemPrompt({
      userName: "Ada",
      locale: "de",
      surface: "chat",
    });
    const english = buildAgentSystemPrompt({
      userName: "Ada",
      locale: "en",
      surface: "chat",
    });

    expect(german).toContain("Write every reply in German");
    expect(english).toContain("Write every reply in English");
    expect(english).toContain("whatever language the workspace data happens to be in");
  });
});
