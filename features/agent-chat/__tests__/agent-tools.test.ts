import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const sentryMock = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => sentryMock);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));

import { searchDocsTool } from "@/features/mcp-tools/docs.mcp-tools";

import { resolveAgentTurnBudget } from "../agent-budget-policy";
import { conservativeAgentInitialContextBytes } from "../agent-provider-context";
import { buildAgentSystemPrompt } from "../system-prompt";
import {
  describeAgentAiTools,
  getAgentAiToolDefinitions,
  getAgentAiTools,
  isAgentToolCancellation,
  selectAgentToolNames,
  type AgentToolDeps,
} from "../agent-tools";

function deps(overrides: Partial<AgentToolDeps> = {}): AgentToolDeps {
  return {
    runUiCommand: vi.fn().mockResolvedValue({ ok: true, result: "browser result" }),
    requestApproval: vi.fn().mockResolvedValue("approve"),
    createSupportTicket: vi.fn().mockResolvedValue({ ok: true, result: "created" }),
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
  it("selects a deterministic, request-relevant hosted tool profile", () => {
    const contactTools = selectAgentToolNames({
      text: "Create a contact and add a note",
      pageRoute: "/en/dashboard",
    });
    expect(contactTools).toEqual(
      expect.arrayContaining(["get_record_schema", "create_contacts", "update_contacts", "update_record_notes"]),
    );
    expect(contactTools).not.toContain("create_deals");
    expect(contactTools).not.toContain("send_email");

    const inboxTools = selectAgentToolNames({
      text: "Reply to this message",
      pageRoute: "/de/inbox",
    });
    expect(inboxTools).toEqual(expect.arrayContaining(["get_messaging_threads", "send_chat_message", "send_email"]));
  });

  it("recognises the everyday German phrasings for creating and editing records", () => {
    const phrasings = [
      'Lege einen Kontakt namens "Loeschtest Mueller" an.',
      "Kannst du bitte eine Organisation anlegen?",
      "Erfasse eine neue Aufgabe für morgen.",
      "Trage einen Deal für Roche ein.",
      "Speichere die Telefonnummer bei diesem Kontakt.",
    ];

    for (const text of phrasings) {
      const tools = selectAgentToolNames({ pageRoute: "/de/dashboard", text });
      const writeTools = tools.filter((name) => name.startsWith("create_") || name.startsWith("update_"));

      expect(writeTools.length).toBeGreaterThan(0);
    }
  });

  it("reaches the record write tools from every app locale, not only English and German", () => {
    const phrasings: Record<string, { create: string; ask: string; tool: string }> = {
      es: {
        create: "Crea un contacto nuevo para Ana Ruiz.",
        ask: "¿Cuántos contactos tengo?",
        tool: "create_contacts",
      },
      fr: {
        create: "Ajoute une nouvelle tâche pour demain.",
        ask: "Combien de tâches me restent-ils ?",
        tool: "create_tasks",
      },
      it: {
        create: "Aggiungi una nuova azienda chiamata Rossi Srl.",
        ask: "Quante aziende ho?",
        tool: "create_organizations",
      },
    };

    for (const [locale, phrasing] of Object.entries(phrasings)) {
      expect(selectAgentToolNames({ pageRoute: `/${locale}/dashboard`, text: phrasing.create })).toContain(
        phrasing.tool,
      );
      expect(selectAgentToolNames({ pageRoute: `/${locale}/dashboard`, text: phrasing.ask })).not.toContain(
        phrasing.tool,
      );
    }
  });

  it("does not read write intent into a plain German question", () => {
    const tools = selectAgentToolNames({
      pageRoute: "/de/contacts",
      text: "Wie viele Kontakte habe ich?",
    });

    expect(tools).not.toContain("create_contacts");
    expect(tools).not.toContain("update_contacts");
  });

  it("keeps action tools available through bounded conversational follow-ups", () => {
    const contactTools = selectAgentToolNames({
      text: "Alice Smith",
      pageRoute: "/en/contacts",
      priorUserTexts: ["Please create a contact for a new customer."],
    });
    expect(contactTools).toEqual(expect.arrayContaining(["create_contacts", "update_contacts"]));

    const messagingTools = selectAgentToolNames({
      text: "Yes, do it.",
      pageRoute: "/en/inbox",
      priorUserTexts: ["Send Maria an email once I confirm."],
    });
    expect(messagingTools).toEqual(expect.arrayContaining(["send_chat_message", "send_email"]));
  });

  it("does not carry action intent beyond the bounded follow-up window", () => {
    const tools = selectAgentToolNames({
      text: "What can you help with?",
      pageRoute: "/en/dashboard",
      priorUserTexts: ["Create a contact", "Thanks", "Show me around", "What is on my dashboard?"],
    });

    expect(tools).not.toContain("create_contacts");
  });

  it("admits measured real tool profiles without shrinking below their immutable context", () => {
    const systemPrompt = buildAgentSystemPrompt({
      userName: "Ada Lovelace",
      appBaseUrl: "https://app.example.com",
    });
    const coreNames = selectAgentToolNames({
      text: "Hello",
      pageRoute: "/en/dashboard",
    });
    const coreBytes = conservativeAgentInitialContextBytes({
      systemPrompt,
      currentText: "Hello",
      pageRoute: "/en/dashboard",
      toolDefinitions: getAgentAiToolDefinitions(coreNames),
    });
    expect(coreBytes).not.toBeNull();

    const oneCredit = resolveAgentTurnBudget({
      availableCredits: 1,
      modelSpec: "openai:gpt-5.6-luna",
      configuredMaxSteps: 8,
      configuredMaxOutputTokens: 2048,
      configuredMaxToolResultChars: 6000,
      requiredContextBytes: coreBytes ?? 0,
    });
    expect(oneCredit).toMatchObject({ reservedCredits: 1, maxSteps: 1 });
    expect(oneCredit?.maxContextBytes).toBeGreaterThanOrEqual(coreBytes ?? Number.POSITIVE_INFINITY);

    const threeCredits = resolveAgentTurnBudget({
      availableCredits: 3,
      modelSpec: "openai:gpt-5.6-luna",
      configuredMaxSteps: 8,
      configuredMaxOutputTokens: 2048,
      configuredMaxToolResultChars: 6000,
      requiredContextBytes: coreBytes ?? 0,
    });
    expect(threeCredits?.maxSteps).toBeGreaterThanOrEqual(2);
    if (threeCredits && coreBytes !== null && threeCredits.maxSteps > 1) {
      const boundedGrowth =
        (threeCredits.maxSteps - 1) * (threeCredits.maxOutputTokens * 4 + 1024 + threeCredits.maxToolResultChars * 4);
      expect(coreBytes + boundedGrowth).toBeLessThanOrEqual(threeCredits.maxContextBytes);
    }

    const allDefinitions = describeAgentAiTools(getAgentAiTools(deps()));
    const fullBytes = conservativeAgentInitialContextBytes({
      systemPrompt,
      currentText: "Hello",
      pageRoute: "/en/dashboard",
      toolDefinitions: allDefinitions,
    });
    expect(fullBytes).not.toBeNull();
    expect(
      resolveAgentTurnBudget({
        availableCredits: 1,
        modelSpec: "openai:gpt-5.6-luna",
        configuredMaxSteps: 8,
        configuredMaxOutputTokens: 2048,
        requiredContextBytes: fullBytes ?? 0,
      }),
    ).toBeNull();
    for (const availableCredits of [3, 19, 20]) {
      const budget = resolveAgentTurnBudget({
        availableCredits,
        modelSpec: "openai:gpt-5.6-luna",
        configuredMaxSteps: 8,
        configuredMaxOutputTokens: 2048,
        requiredContextBytes: fullBytes ?? 0,
      });
      expect(budget, `${availableCredits} credits`).not.toBeNull();
      expect(budget?.maxContextBytes).toBeGreaterThanOrEqual(fullBytes ?? Number.POSITIVE_INFINITY);
    }
  });

  it("accepts only exact navigation target ids and rejects URL-like model input", () => {
    const tools = getAgentAiTools(deps());
    const schema = schemaOf(tools.navigate);

    expect(schema.safeParse?.({ targetId: "nav-contacts" })).toMatchObject({
      success: true,
    });
    for (const targetId of ["javascript:alert(1)", "https://example.com", "//example.com", "/contacts"]) {
      expect(schema.safeParse?.({ targetId })).toMatchObject({
        success: false,
      });
    }
  });

  it.each([
    ["navigate", { targetId: "nav-contacts" }, "navigation failed"],
    ["highlight_element", { targetId: "contacts-add" }, "highlight failed"],
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

  it("preserves Zod defaults while sending a provider-safe JSON schema", async () => {
    const tools = getAgentAiTools(deps());
    const result = await schemaOf(tools.search_docs).validate?.({
      query: "contacts",
    });

    expect(result).toEqual({
      success: true,
      value: { query: "contacts", locale: "en", source: "docs" },
    });
  });

  it("keeps runtime validation for sanitized CRM schemas", async () => {
    const tools = getAgentAiTools(deps());
    const result = await schemaOf(tools.create_contacts).validate?.({
      contacts: [{ firstName: "Only" }],
    });

    expect(result).toMatchObject({ success: false });
  });

  it("captures raw CRM errors but exposes only a stable tool failure", async () => {
    const secretError = new Error("postgres password=do-not-disclose");
    vi.spyOn(searchDocsTool, "execute").mockImplementationOnce(() => {
      throw secretError;
    });
    const tools = getAgentAiTools(deps());

    await expect(
      execute(tools.search_docs, {
        query: "contacts",
        locale: "en",
        source: "docs",
      }),
    ).rejects.toThrow("The assistant tool could not be completed.");
    expect(sentryMock.captureException).toHaveBeenCalledWith(secretError);
  });

  it("returns a structured failure for validation errors instead of marking the activity done", async () => {
    vi.spyOn(searchDocsTool, "execute").mockResolvedValueOnce("Validation error: invalid docs query");
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
    });
  });

  it("shows request_support as an approval-gated action before opening a ticket", async () => {
    const input = {
      subject: "Need help",
      body: "Please connect me with a human.",
    };
    const requestApproval = vi.fn().mockResolvedValue("approve");
    const createSupportTicket = vi.fn().mockResolvedValue({ ok: true, result: "ticket opened" });
    const tools = getAgentAiTools(
      deps({
        requestApproval,
        createSupportTicket,
      }),
    );

    await expect(execute(tools.request_support, input, "support-1")).resolves.toEqual({
      ok: true,
      result: "ticket opened",
    });
    expect(requestApproval).toHaveBeenCalledWith("support-1", "request_support", input);
    expect(createSupportTicket).toHaveBeenCalledWith("support-1", input.subject, input.body);
  });

  it.each([
    "delete_records",
    "update_record_notes",
    "manage_record_links",
    "send_email",
    "send_chat_message",
    "save_message_draft",
    "discard_message_draft",
    "update_messaging_thread",
    "manage_custom_columns",
    "manage_widgets",
    "update_workspace_settings",
    "manage_team",
    "manage_webhooks",
    "connect_messaging_account",
  ])("requires an approval for sensitive tool %s", async (toolName) => {
    const requestApproval = vi.fn().mockResolvedValue("reject");
    const tools = getAgentAiTools(deps({ requestApproval }));

    await expect(execute(tools[toolName], {}, `sensitive-${toolName}`)).resolves.toMatchObject({
      agentToolStatus: "cancelled",
      reason: "rejected",
    });
    expect(requestApproval).toHaveBeenCalledWith(`sensitive-${toolName}`, toolName, {});
  });

  it.each(["reject", "timeout"] as const)("does not open support when escalation resolves to %s", async (decision) => {
    const requestApproval = vi.fn().mockResolvedValue(decision);
    const createSupportTicket = vi.fn().mockResolvedValue({ ok: true, result: "ticket opened" });
    const tools = getAgentAiTools(
      deps({
        requestApproval,
        createSupportTicket,
      }),
    );

    const result = await execute(tools.request_support, { subject: "Need help", body: "Human please" }, "support-2");

    expect(isAgentToolCancellation(result)).toBe(true);
    expect(result).toMatchObject({
      agentToolStatus: "cancelled",
      reason: decision === "reject" ? "rejected" : "timeout",
    });
    expect(createSupportTicket).not.toHaveBeenCalled();
  });

  it("gives the model truthful, narrow approval instructions", () => {
    const prompt = buildAgentSystemPrompt({
      userName: "Ada",
      appBaseUrl: "https://app.example.com",
    });

    expect(prompt).toContain("Offer Always allow only for create_contacts");
    expect(prompt).toContain(
      "support escalation, and every other sensitive action require a fresh explicit confirmation",
    );
    expect(prompt).toContain("If an action is declined or times out, nothing changed");
    expect(prompt).toContain("A support ticket is created only after the user explicitly confirms");
    expect(prompt).toContain("it does not apply changes");
  });
});
