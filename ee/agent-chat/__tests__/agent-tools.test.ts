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

const mockUser = createMockUser();
const sentryMock = vi.hoisted(() => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => sentryMock);
vi.mock("next-intl/server", () => ({
  getTranslations: () => {
    const translator = Object.assign((key: string) => key, { raw: (key: string) => `localized:${key}` });
    return Promise.resolve(translator);
  },
  getLocale: () => Promise.resolve("en"),
}));

import { searchDocsTool } from "@/features/mcp-tools/docs.mcp-tools";
import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";

import {
  AGENT_MIN_STEPS_WITH_FULL_TOOL_CATALOG,
  agentContextTokensToBytes,
  resolveAgentTurnBudget,
} from "../agent-budget-policy";
import { conservativeAgentInitialContextBytes } from "../agent-provider-context";
import { MODEL_CATALOG } from "../model-catalog";
import { buildAgentSystemPrompt } from "../system-prompt";
import { AGENT_CLICK_TARGETS, AGENT_UI_TARGETS } from "../ui-targets";
import {
  AGENT_UI_TOOL_NAMES,
  describeAgentAiTools,
  hasNonTransactionalEffect,
  getAgentAiToolDefinitions,
  getAgentAiTools,
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
      { execute: (input: unknown, options: { toolCallId: string }) => Promise<unknown> }
    >;
    const ignoringOutcome = (call: Promise<unknown>) => call.catch(() => undefined);

    await ignoringOutcome(tools.create_contacts.execute({ contacts: [] }, { toolCallId: "call-write" }));
    await ignoringOutcome(tools.send_email.execute({}, { toolCallId: "call-email" }));
    await ignoringOutcome(tools.list_records.execute({ entity: "contact" }, { toolCallId: "call-read" }));

    expect(enrolled).toEqual(["create_contacts:call-write"]);
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
      { execute?: (input: unknown, options: { toolCallId: string }) => Promise<unknown> }
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

    for (const name of ["create_contacts", "update_deals", "delete_records", "manage_widgets", "manage_custom_columns"])
      expect(hasNonTransactionalEffect(name), name).toBe(false);
  });

  it("exposes the complete MCP registry plus the interface tools on every turn", () => {
    const names = Object.keys(getAgentAiTools(deps()));
    const expected = new Set([...ALL_MCP_TOOLS.map((agentTool) => agentTool.name), ...AGENT_UI_TOOL_NAMES]);

    expect(names.toSorted()).toEqual([...expected].toSorted());
    expect(names).toContain("search");
    expect(names).toContain("fetch");
    expect(names.filter((name) => name === "request_support")).toHaveLength(1);
    expect(names.every((name) => !name.startsWith("discover_"))).toBe(true);
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
                  content: [{ type: "output_text", text: "All eighteen checks are complete.", annotations: [] }],
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
                input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
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
      stopWhen: stepCountIs(MODEL_CATALOG.balanced.maxSteps),
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

  it("keeps the stable full catalog inside the conservative provider envelope", () => {
    const systemPrompt = buildAgentSystemPrompt({
      userName: "Ada Lovelace",
      appBaseUrl: "https://app.example.com",
      locale: "en",
    });
    const definitions = getAgentAiToolDefinitions();
    expect(definitions).toEqual(describeAgentAiTools(getAgentAiTools(deps())));

    const requiredContextBytes = conservativeAgentInitialContextBytes({
      systemPrompt,
      currentText: "Decide yourself and create the complete dataset.",
      pageRoute: "/en/organizations",
      toolDefinitions: definitions,
    });

    const model = MODEL_CATALOG.balanced;
    expect(requiredContextBytes).not.toBeNull();
    expect(requiredContextBytes).toBeLessThan(agentContextTokensToBytes(model.maxContextTokens));
    expect(
      resolveAgentTurnBudget({
        model,
        availableCredits: 1,
        requiredContextBytes: requiredContextBytes ?? 0,
        minimumSteps: AGENT_MIN_STEPS_WITH_FULL_TOOL_CATALOG,
      }),
    ).toBeNull();
    const funded = resolveAgentTurnBudget({
      model,
      availableCredits: 44,
      requiredContextBytes: requiredContextBytes ?? 0,
      minimumSteps: AGENT_MIN_STEPS_WITH_FULL_TOOL_CATALOG,
    });
    expect(funded?.maxSteps).toBeGreaterThanOrEqual(AGENT_MIN_STEPS_WITH_FULL_TOOL_CATALOG);
    expect(funded?.maxContextBytes).toBeGreaterThanOrEqual(requiredContextBytes ?? Number.POSITIVE_INFINITY);

    const longFunded = resolveAgentTurnBudget({
      model,
      availableCredits: 500,
      requiredContextBytes: requiredContextBytes ?? 0,
      minimumSteps: AGENT_MIN_STEPS_WITH_FULL_TOOL_CATALOG,
    });
    expect(longFunded?.maxSteps).toBe(model.maxSteps);
    expect(longFunded?.maxOutputTokens).toBeGreaterThanOrEqual(800);
  });

  it("publishes the preferred custom-field option shape to the hosted provider", () => {
    const definition = getAgentAiToolDefinitions().find(({ name }) => name === "manage_custom_columns");
    const schema = definition?.inputSchema as { properties?: Record<string, unknown> } | undefined;
    const selectOptions = schema?.properties?.selectOptions as { type?: string; minItems?: number } | undefined;

    expect(selectOptions).toMatchObject({ type: "array", minItems: 1 });
    expect(JSON.stringify(schema?.properties?.id)).toContain('"null"');
  });

  it("accepts only exact navigation target ids and rejects URL-like model input", async () => {
    const tools = getAgentAiTools(deps());
    const validate = schemaOf(tools.navigate).validate;

    expect(await validate?.({ targetId: "nav-contacts" })).toMatchObject({ success: true });
    for (const targetId of ["javascript:alert(1)", "https://example.com", "//example.com", "/contacts"])
      expect(await validate?.({ targetId }), targetId).toMatchObject({ success: false });
  });

  it("accepts only real record ids in open_record and rejects paths and URLs", async () => {
    const tools = getAgentAiTools(deps());
    const validate = schemaOf(tools.open_record).validate;

    expect(await validate?.({ entity: "contact", recordId: "00000000-0000-4000-8000-000000000001" })).toMatchObject({
      success: true,
    });
    expect(await validate?.({ entity: "contact", recordId: "new" })).toMatchObject({ success: true });
    for (const recordId of ["/contacts/abc", "javascript:alert(1)", "https://example.com", "abc", "1234"])
      expect(await validate?.({ entity: "contact", recordId }), recordId).toMatchObject({ success: false });

    expect(await validate?.({ entity: "company", recordId: "00000000-0000-4000-8000-000000000001" })).toMatchObject({
      success: false,
    });
  });

  it("allows only reversible display controls through click_ui_target", async () => {
    const validate = schemaOf(getAgentAiTools(deps()).click_ui_target).validate;

    expect(await validate?.({ targetId: "deals-display-options" })).toMatchObject({ success: true });
    expect(await validate?.({ targetId: "deals-layout-kanban" })).toMatchObject({ success: true });
    for (const targetId of ["#deals-display-options", "nav-contacts", "company-settings-save", "deals-filter"])
      expect(await validate?.({ targetId }), targetId).toMatchObject({ success: false });
  });

  it("keeps the complete UI target catalog within the tool-result budget", async () => {
    const result = String(await execute(getAgentAiTools(deps()).list_ui_targets, {}));

    expect(result.length).toBeLessThanOrEqual(6000);
    expect(result).toContain("actions n=navigate,h=highlight,c=click");
    expect(result).toContain("\nend");
    for (const target of AGENT_UI_TARGETS) expect(result).toContain(target.id);
  });

  it("keeps every click target discoverable through bounded queries and pages", async () => {
    const tools = getAgentAiTools(deps({ resultMaxChars: 512 }));

    for (const target of AGENT_CLICK_TARGETS) {
      const result = String(await execute(tools.list_ui_targets, { query: target.id }));
      expect(result.length).toBeLessThanOrEqual(512);
      expect(result).toContain(target.id);
      expect(result).toContain("\nend");
    }

    const layout = String(await execute(tools.list_ui_targets, { query: "deals-layout-kanban" }));
    expect(layout).toContain("deals-layout-kanban|/deals|nhc|>deals-display-options");

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

  it("discovers the connected-account destination and walkthrough control together", async () => {
    const tools = getAgentAiTools(deps({ resultMaxChars: 512 }));
    const workflow = String(await execute(tools.list_ui_targets, { query: "connected accounts" }));
    const provider = String(await execute(tools.list_ui_targets, { query: "WhatsApp" }));

    expect(workflow).toContain("nav-profile-connected-accounts");
    expect(workflow).toContain("profile-connected-accounts-connect");
    expect(workflow).toContain("\nend");
    expect(provider).toContain("profile-connected-accounts-connect");
    expect(
      await schemaOf(tools.highlight_element).validate?.({ targetId: "profile-connected-accounts-connect" }),
    ).toMatchObject({ success: true });
    expect(
      await schemaOf(tools.click_ui_target).validate?.({ targetId: "profile-connected-accounts-connect" }),
    ).toMatchObject({ success: false });
  });

  it.each([
    ["navigate", { targetId: "nav-contacts" }, "navigation failed"],
    ["highlight_element", { targetId: "contacts-add" }, "highlight failed"],
    ["click_ui_target", { targetId: "contacts-display-options" }, "activation failed"],
    [
      "start_tour",
      {
        steps: [
          { targetId: "nav-contacts", note: "Contacts are the people you work with." },
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

  it("caps browser command results to the admitted per-tool context budget", async () => {
    const runUiCommand = vi.fn().mockResolvedValue({ ok: true, result: "x".repeat(1000) });
    const tools = getAgentAiTools(deps({ runUiCommand, resultMaxChars: 512 }));

    await expect(execute(tools.navigate, { targetId: "nav-contacts" })).resolves.toEqual({
      ok: true,
      result: "x".repeat(512),
    });
  });

  it("preserves Zod defaults while sending a provider-safe JSON schema", async () => {
    const result = await schemaOf(getAgentAiTools(deps()).search_docs).validate?.({ query: "contacts" });

    expect(result).toEqual({
      success: true,
      value: { query: "contacts", locale: "en", source: "docs" },
    });
  });

  it("keeps the WhatsApp documentation path usable inside the admitted 512-character tool result", async () => {
    const tools = getAgentAiTools(deps({ resultMaxChars: 512 }));
    const query = "Walk me through connecting WhatsApp to the Customermates inbox.";
    const searchResult = (await execute(tools.search_docs, { query, locale: "en", source: "docs" })) as {
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
    expect(pageResult.result).toContain("nav-profile-connected-accounts");
    expect(pageResult.result).toContain("profile-connected-accounts-connect");
    expect(pageResult.result).toContain("WhatsApp");
  });

  it("keeps runtime validation for sanitized CRM schemas", async () => {
    const result = await schemaOf(getAgentAiTools(deps()).create_contacts).validate?.({
      contacts: [{ firstName: "Only" }],
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
      await execute(tools.search_docs, { query: "contacts", locale: "en", source: "docs" });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ message: "The assistant tool could not be completed." });
    expect((failure as Error).cause).toBeUndefined();
    expect((failure as Error).stack).not.toContain("do-not-disclose");
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("returns a structured failure for validation errors instead of marking the activity done", async () => {
    vi.spyOn(searchDocsTool, "execute").mockResolvedValueOnce("Validation error: invalid docs query" as never);
    const tools = getAgentAiTools(deps());

    await expect(execute(tools.search_docs, { query: "contacts", locale: "en", source: "docs" })).resolves.toEqual({
      ok: false,
      result: "Validation error: invalid docs query",
    });
  });

  it("shows request_support as an approval-gated action before sending an email", async () => {
    const input = { subject: "Need help", body: "Please connect me with a human." };
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
    ["delete_records", {}],
    ["send_email", {}],
    ["send_chat_message", {}],
    ["discard_message_draft", {}],
    ["manage_custom_columns", { action: "delete" }],
    ["manage_widgets", { action: "delete" }],
    ["manage_webhooks", { action: "delete" }],
    ["manage_social_relations", { action: "invite", targetLabel: "Ada Lovelace" }],
    ["linkedin_manage_sales_lists", { action: "save", targetLabel: "Ada Lovelace", listLabel: "Priority Leads" }],
    ["manage_team", { action: "invite" }],
    ["manage_webhooks", { action: "resend_delivery" }],
    ["manage_custom_columns", {}],
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

  it("asks for external approval with authoritative context instead of model-authored labels", async () => {
    const input = { action: "invite", connectedAccountId: "account-1", identifier: "provider-ada" };
    const approvalInput = { ...input, targetLabel: "Ada Lovelace" };
    const resolveApprovalContext = vi.fn().mockResolvedValue({ ok: true, input: approvalInput });
    const requestApproval = vi.fn().mockResolvedValue("reject");
    const tools = getAgentAiTools(deps({ requestApproval, resolveApprovalContext }));

    await expect(execute(tools.manage_social_relations, input, "social-approval")).resolves.toMatchObject({
      agentToolStatus: "cancelled",
      reason: "rejected",
    });
    expect(resolveApprovalContext).toHaveBeenCalledWith("manage_social_relations", input);
    expect(requestApproval).toHaveBeenCalledWith("social-approval", "manage_social_relations", approvalInput);
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
        { action: "save", connectedAccountId: "account-1", listId: "list-1", providerId: "lead-1" },
        "sales-approval",
      ),
    ).resolves.toEqual({ ok: false, result: "The external target could not be verified." });
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
        { action: "invite", connectedAccountId: "account-1", identifier: "provider-ada" },
        "social-approval",
      ),
    ).resolves.toEqual({ ok: false, result: "localized:userInactive" });
    expect(requestApproval).not.toHaveBeenCalled();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("does not expose unbounded structured MCP payloads to the hosted model", async () => {
    vi.spyOn(searchDocsTool, "execute")
      .mockImplementationOnce(
        () => Promise.resolve({ text: "done", structuredContent: { rows: ["x".repeat(20_000)] } }) as never,
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

    await expect(execute(tools.search_docs, { query: "contacts", locale: "en", source: "docs" })).resolves.toEqual({
      ok: true,
      result: "done",
    });
    const failed = await execute(tools.search_docs, { query: "contacts", locale: "en", source: "docs" });
    expect(failed).toEqual({ ok: false, result: "x".repeat(512) });
    expect(JSON.stringify(failed).length).toBeLessThan(600);
  });

  it.each([
    ["create_contacts", {}],
    ["update_contacts", {}],
    ["update_record_notes", {}],
    ["manage_record_links", { action: "add" }],
    ["manage_record_links", { action: "remove" }],
    ["save_message_draft", {}],
    ["update_messaging_thread", {}],
    ["update_workspace_settings", {}],
    ["manage_team", { action: "update_member" }],
    ["connect_messaging_account", {}],
    ["manage_custom_columns", { action: "list" }],
    ["manage_widgets", { action: "list" }],
    ["manage_webhooks", { action: "list" }],
    ["manage_social_relations", { action: "list" }],
    ["linkedin_manage_sales_lists", { action: "list" }],
    ["linkedin_manage_sales_lists", { action: "browse" }],
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

  it("gives the model truthful, neutral capability and approval instructions", () => {
    const prompt = buildAgentSystemPrompt({
      userName: "Ada",
      appBaseUrl: "https://app.example.com",
      locale: "en",
    });

    expect(prompt).not.toMatch(/Always allow/i);
    expect(prompt).not.toContain("onboarding copilot");
    expect(prompt).not.toContain("Do not attempt heavy multi-step automation");
    expect(prompt).toContain("complete hosted Customermates tool catalog");
    expect(prompt).toContain("current page is context, never a capability boundary");
    expect(prompt).toContain("Never infer that a capability is unavailable");
    expect(prompt).toContain("Ordinary CRM work also runs immediately");
    expect(prompt).toContain("require a fresh explicit approval every time; there is no standing permission to offer");
    expect(prompt).toContain("Destructive actions");
    expect(prompt).toContain("team invitations");
    expect(prompt).toContain("webhook delivery resends");
    expect(prompt).toContain("If an approval is declined or times out, nothing changed");
    expect(prompt).toContain("A support email is sent only after the user explicitly confirms");
    expect(prompt).toContain("use the available tools directly");
    expect(prompt).toContain("batch each entity's records into one write call");
    expect(prompt).toContain("one focused search_docs call");
    expect(prompt).toContain("query set to the exact detail");
    expect(prompt).toContain("Make one focused list_ui_targets query");
    expect(prompt).toContain("A tour navigates to each step itself");
    expect(prompt).toContain("asks to walk them through or show them how to connect an account");
    expect(prompt).toContain("action=upsert, intent=create, and no id");
    expect(prompt).toContain("top-level selectOptions");
    expect(prompt).toContain("retry that tool once");
    expect(prompt).toContain("Never print or imitate tool-call syntax as text");
  });
});

describe("system prompt reply language", () => {
  it("names the interface language so workspace data cannot decide it", () => {
    const german = buildAgentSystemPrompt({
      userName: "Ada",
      appBaseUrl: "https://app.example.com",
      locale: "de",
    });
    const english = buildAgentSystemPrompt({
      userName: "Ada",
      appBaseUrl: "https://app.example.com",
      locale: "en",
    });

    expect(german).toContain("Write every reply in German");
    expect(english).toContain("Write every reply in English");
    expect(english).toContain("whatever language the workspace data happens to be in");
  });
});
