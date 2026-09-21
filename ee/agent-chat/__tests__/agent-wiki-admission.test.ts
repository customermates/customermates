import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const definitions = vi.hoisted(() => vi.fn().mockReturnValue([]));

vi.mock("@/env", () => ({
  env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/ee/agent-chat/agent-tools", () => ({
  getAgentAiToolDefinitions: definitions,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
}));

import { SendAgentMessageInteractor } from "@/ee/agent-chat/send-agent-message.interactor";
import { resolveAgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import {
  conservativeAgentInitialContextBytes,
  buildAgentProviderContext,
} from "@/ee/agent-chat/agent-provider-context";
import {
  agentWikiContextMessages,
  serializeAgentWikiCatalog as serializeAgentWikiCatalogWithBaseUrl,
} from "@/ee/agent-chat/agent-wiki-context";
import { resolveAgentModel, type AgentModelEntry } from "@/ee/agent-chat/model-catalog";
import { buildAgentSystemPrompt } from "@/ee/agent-chat/system-prompt";
import { AGENT_WEB_SEARCH_RELEASED } from "@/ee/agent-chat/agent-web-search";
import type { AgentTurnWorkflowPayload } from "@/workflows/agent-turn";

const serializeAgentWikiCatalog = (value: Parameters<typeof serializeAgentWikiCatalogWithBaseUrl>[0]) =>
  serializeAgentWikiCatalogWithBaseUrl(value, "https://example.invalid");

const CLIENT_REQUEST_ID = "00000000-0000-4000-8000-000000000001";
const CONVERSATION_ID = "00000000-0000-4000-8000-000000000002";
const PAGE_ID = "00000000-0000-4000-8000-000000000003";
const RELEVANT_ID = "00000000-0000-4000-8000-000000000004";

function catalogData(excerpt = "Current workspace guidance", relevantMarkdown = "Read Voice before drafting replies.") {
  return {
    items: [
      {
        id: PAGE_ID,
        title: "Voice",
        excerpt,
        url: `http://localhost:4000/wiki?page=${PAGE_ID}`,
        createdAt: new Date("2026-09-01T12:00:00Z"),
        updatedAt: new Date("2026-09-13T12:00:00Z"),
      },
    ],
    relevantPages: [
      {
        id: RELEVANT_ID,
        title: "Reply guidance",
        excerpt: "Matched reply guidance",
        url: `http://localhost:4000/wiki?page=${RELEVANT_ID}`,
        markdownPreview: relevantMarkdown,
        previewOffset: 0,
        previewEnd: relevantMarkdown.length,
        totalChars: relevantMarkdown.length,
        createdAt: new Date("2026-09-01T12:00:00Z"),
        updatedAt: new Date("2026-09-13T12:00:00Z"),
      },
    ],
    total: 1,
    page: 1,
    nextPage: null,
    truncated: false,
  };
}

function fixture() {
  const catalog = {
    invoke: vi.fn().mockResolvedValue({ ok: true, data: catalogData() }),
  };
  const repo = {
    normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
    findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
    findConversation: vi.fn().mockResolvedValue({
      id: CONVERSATION_ID,
      origin: "routine",
      creditCeiling: 500,
    }),
    claimAgentRunLease: vi.fn().mockResolvedValue("claimed"),
    isAtAgentRunLimit: vi.fn().mockResolvedValue(false),
    createAgentConversationForRun: vi.fn().mockResolvedValue(undefined),
    deleteUnusedAgentConversation: vi.fn().mockResolvedValue(undefined),
    recordAgentTurnExternalRun: vi.fn().mockResolvedValue(undefined),
    releasePreProviderAdmissionOrThrowUnscoped: vi.fn().mockResolvedValue(undefined),
    admitAgentTurnOrThrow: vi.fn().mockImplementation((args) =>
      Promise.resolve({
        conversationId: args.conversationId,
        userMessageId: args.turn.userMessageId,
        recentMessages: [
          {
            id: args.turn.userMessageId,
            role: "user",
            parts: [{ type: "text", text: args.title }],
          },
        ],
      }),
    ),
  };
  const usage = {
    prepareTurn: vi
      .fn()
      .mockImplementation((_userId, _now, args: { model: AgentModelEntry; requiredContextBytes: number }) =>
        Promise.resolve({
          reservation: {
            budget: resolveAgentTurnBudget({
              ...args,
              availableCredits: 500,
            }),
            reservedCredits: 100,
            periodStart: new Date("2026-09-01T00:00:00Z"),
            periodEnd: new Date("2026-10-01T00:00:00Z"),
          },
        }),
      ),
    reserveUsage: vi.fn().mockResolvedValue(true),
  };
  const background = {
    dispatchTracked: vi.fn().mockResolvedValue("wrun_wiki_test"),
  };
  const interactor = new SendAgentMessageInteractor(
    repo as never,
    usage as never,
    mockEntitlementService(),
    background as never,
    catalog,
  );
  const payload = () => {
    const call = background.dispatchTracked.mock.calls.at(-1);
    if (!call) throw new Error("Expected an admitted turn.");
    return call[1] as AgentTurnWorkflowPayload;
  };
  return { catalog, repo, usage, background, interactor, payload };
}

describe("Workspace Wiki admission bootstrap", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["chat", "routine"] as const)("loads and measures the current catalog for a %s turn", async (surface) => {
    const state = fixture();
    const input = {
      clientRequestId: CLIENT_REQUEST_ID,
      text: "Draft with our voice",
      retry: false,
      locale: "en" as const,
    };
    const result = await (surface === "routine"
      ? runWithTenant(mockUser, () =>
          state.interactor.invokeRoutine({
            ...input,
            conversationId: CONVERSATION_ID,
          }),
        )
      : state.interactor.invoke(input));
    expect(result).toMatchObject({ ok: true, data: { disposition: "run" } });
    expect(state.catalog.invoke).toHaveBeenCalledExactlyOnceWith({
      page: 1,
      query: input.text,
    });
    const payload = state.payload();
    expect(payload.wikiCatalog).toBe(serializeAgentWikiCatalog(catalogData()));
    expect(payload.wikiCatalog).toContain("Read Voice before drafting replies.");
    expect(payload.surface).toBe(surface);
    const systemPrompt = buildAgentSystemPrompt({
      userName: payload.userName,
      appBaseUrl: payload.appBaseUrl,
      locale: payload.locale,
      surface,
      wikiHomepageSetup: false,
      webSearchEnabled: AGENT_WEB_SEARCH_RELEASED,
    });
    expect(systemPrompt).not.toContain("Current workspace guidance");
    const admission = state.usage.prepareTurn.mock.calls[0][2];
    expect(admission.requiredContextBytes).toBe(
      conservativeAgentInitialContextBytes({
        systemPrompt,
        currentText: input.text,
        pageRoute: null,
        toolDefinitions: [],
        wikiCatalog: payload.wikiCatalog,
      }),
    );
    const execution = buildAgentProviderContext(systemPrompt, payload.messages, [], payload.wikiCatalog);
    const referenceMessages = agentWikiContextMessages(payload.wikiCatalog);
    expect(execution.messages.slice(0, referenceMessages.length)).toEqual(referenceMessages);
    expect(definitions).toHaveBeenCalledWith(admission.model.servingProvider, {
      surface,
      wikiHomepageSetup: false,
      webSearchEnabled: AGENT_WEB_SEARCH_RELEASED,
    });
  });

  it.each(["chat", "routine"] as const)(
    "carries a query-matched page outside the first ten into a %s turn without promoting it to system instructions",
    async (surface) => {
      const state = fixture();
      const matchedId = "10000000-0000-4000-8000-000000000011";
      const linkedId = "20000000-0000-4000-8000-000000000012";
      const firstTen = Array.from({ length: 10 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        title: `Created page ${index + 1}`,
        excerpt: `General workspace page ${index + 1}`,
        url: `http://localhost:4000/wiki?page=00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        createdAt: new Date(`2026-09-${String(index + 1).padStart(2, "0")}T12:00:00Z`),
        updatedAt: new Date("2026-09-13T12:00:00Z"),
      }));
      const matchedMarkdown = [
        "Refunds above EUR 500 go to the support lead.",
        `Read [Refund exceptions](/wiki?page=${linkedId}) before answering.`,
      ].join("\n\n");
      state.catalog.invoke.mockResolvedValue({
        ok: true,
        data: {
          items: firstTen,
          relevantPages: [
            {
              id: matchedId,
              title: "Refund escalation",
              excerpt: "Refunds above EUR 500 go to the support lead.",
              url: `http://localhost:4000/wiki?page=${matchedId}`,
              markdownPreview: matchedMarkdown,
              previewOffset: 0,
              previewEnd: matchedMarkdown.length,
              totalChars: matchedMarkdown.length,
              createdAt: new Date("2026-09-20T12:00:00Z"),
              updatedAt: new Date("2026-09-20T12:00:00Z"),
            },
          ],
          total: 11,
          page: 1,
          nextPage: 2,
          truncated: true,
        },
      });
      const input = {
        clientRequestId: CLIENT_REQUEST_ID,
        text: "How should we handle a EUR 900 refund?",
        retry: false,
      };

      const result = await (surface === "routine"
        ? runWithTenant(mockUser, () =>
            state.interactor.invokeRoutine({
              ...input,
              conversationId: CONVERSATION_ID,
            }),
          )
        : state.interactor.invoke(input));

      expect(result).toMatchObject({ ok: true, data: { disposition: "run" } });
      expect(state.catalog.invoke).toHaveBeenCalledExactlyOnceWith({
        page: 1,
        query: input.text,
      });
      const payload = state.payload();
      const serialized = JSON.parse(payload.wikiCatalog ?? "null") as {
        wiki: {
          items: Array<{ id: string }>;
          relevantPages: Array<{ id: string; markdownPreview: string }>;
          total: number;
          nextPage: number | null;
          truncated: boolean;
        };
      };
      expect(serialized.wiki.items).toHaveLength(10);
      expect(serialized.wiki.items.map(({ id }) => id)).not.toContain(matchedId);
      expect(serialized.wiki.relevantPages).toEqual([
        expect.objectContaining({
          id: matchedId,
          markdownPreview: matchedMarkdown,
        }),
      ]);
      expect(serialized.wiki).toMatchObject({
        total: 11,
        nextPage: 2,
        truncated: true,
      });

      const systemPrompt = buildAgentSystemPrompt({
        userName: payload.userName,
        appBaseUrl: payload.appBaseUrl,
        locale: payload.locale,
        surface,
        wikiHomepageSetup: false,
        webSearchEnabled: AGENT_WEB_SEARCH_RELEASED,
      });
      expect(systemPrompt).toContain("follow useful Wiki links");
      expect(systemPrompt).toContain("Report gaps or conflicts");
      expect(systemPrompt).not.toContain("Refunds above EUR 500");
      expect(buildAgentProviderContext(systemPrompt, payload.messages, [], payload.wikiCatalog).messages[0]).toEqual(
        expect.objectContaining({ role: "user" }),
      );
    },
  );

  it("loads an edit on the next admission rather than reusing a cached catalog", async () => {
    const state = fixture();
    await state.interactor.invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "First request",
      retry: false,
    });
    const first = state.payload().wikiCatalog;
    state.catalog.invoke.mockResolvedValue({
      ok: true,
      data: catalogData("Edited guidance", "Read the updated Voice page first."),
    });
    await state.interactor.invoke({
      clientRequestId: PAGE_ID,
      text: "Next request",
      retry: false,
    });
    expect(first).toContain("Current workspace guidance");
    expect(state.payload().wikiCatalog).toContain("Edited guidance");
    expect(state.payload().wikiCatalog).toContain("Read the updated Voice page first.");
    expect(state.payload().wikiCatalog).not.toContain("Read Voice before drafting replies.");
    expect(state.payload().wikiCatalog).not.toContain("Current workspace guidance");
    expect(state.catalog.invoke).toHaveBeenCalledTimes(2);
  });

  it("continues without any catalog data when Wiki Read is denied", async () => {
    const state = fixture();
    state.catalog.invoke.mockRejectedValue(new ForbiddenError("Wiki Read denied"));
    const result = await state.interactor.invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "Hello",
      retry: false,
    });
    expect(result).toMatchObject({ ok: true, data: { disposition: "run" } });
    expect(state.payload().wikiCatalog).toBeNull();
    expect(JSON.stringify(state.payload())).not.toContain("Current workspace guidance");
  });

  it.each([new Error("Catalog unavailable"), new ForbiddenError("Inactive user", AppErrorCode.inactiveUser)])(
    "does not treat an unexpected catalog failure as missing Wiki permission: %s",
    async (error) => {
      const state = fixture();
      state.catalog.invoke.mockRejectedValue(error);
      await expect(
        state.interactor.invoke({
          clientRequestId: CLIENT_REQUEST_ID,
          text: "Hello",
          retry: false,
        }),
      ).rejects.toBe(error);
      expect(state.usage.prepareTurn).not.toHaveBeenCalled();
      expect(state.background.dispatchTracked).not.toHaveBeenCalled();
    },
  );

  it("stops on a catalog validation failure before credits or workflow dispatch", async () => {
    const state = fixture();
    const failure = {
      ok: false,
      error: new z.ZodError([{ code: "custom", path: [], message: "Invalid catalog" }]),
    };
    state.catalog.invoke.mockResolvedValue(failure);
    expect(
      await state.interactor.invoke({
        clientRequestId: CLIENT_REQUEST_ID,
        text: "Hello",
        retry: false,
      }),
    ).toBe(failure);
    expect(state.usage.prepareTurn).not.toHaveBeenCalled();
    expect(state.background.dispatchTracked).not.toHaveBeenCalled();
  });

  it("reserves and dispatches the same 8192-token setup model without loading the private catalog", async () => {
    const state = fixture();
    const result = await state.interactor.invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "Set up our Wiki from https://customermates.com/",
      retry: false,
      wikiHomepageSetupUrl: "https://customermates.com/",
      wikiHomepageSetupDomain: "customermates.com",
    });
    expect(result).toMatchObject({ ok: true, data: { disposition: "run" } });
    expect(state.catalog.invoke).not.toHaveBeenCalled();
    const admission = state.usage.prepareTurn.mock.calls[0][2];
    const payload = state.payload();
    expect(admission.model).toEqual({
      ...resolveAgentModel(),
      maxOutputTokens: 8_192,
    });
    expect(payload.turnBudget.maxOutputTokens).toBe(8_192);
    expect(payload.turnBudget.servingProvider).toBe(admission.model.servingProvider);
    expect(payload.wikiCatalog).toBeNull();
    expect(payload.wikiHomepageSetup).toMatchObject({
      url: "https://customermates.com/",
      registrableDomain: "customermates.com",
    });
    expect(definitions).toHaveBeenCalledWith(admission.model.servingProvider, {
      surface: "chat",
      wikiHomepageSetup: true,
      webSearchEnabled: AGENT_WEB_SEARCH_RELEASED,
    });
    expect(state.repo.createAgentConversationForRun).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Set up Workspace Wiki" }),
    );
  });

  it("execution reauthorizes the catalog but retains the measured snapshot and output allowance", () => {
    const workflow = readFileSync(resolve(process.cwd(), "workflows/agent-turn.ts"), "utf8");
    const authorization = workflow.slice(
      workflow.indexOf("async function authorizedWikiCatalog("),
      workflow.indexOf("authorizedWikiCatalog.maxRetries"),
    );
    expect(authorization).toContain("getGetWikiCatalogInteractor().invoke({ page: 1 })");
    expect(authorization).toContain("return payload.wikiCatalog ?? null");
    expect(authorization).toContain("AppErrorCode.permissionDenied) return null");
    expect(authorization).not.toContain("JSON.stringify(result.data)");
    expect(workflow).toContain("await authorizedWikiCatalog(payload)");
    expect(workflow).toContain("maxOutputTokens: payload.turnBudget.maxOutputTokens");
  });
});
