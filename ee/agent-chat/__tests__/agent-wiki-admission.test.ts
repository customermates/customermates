import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { Action, Resource } from "@/generated/prisma";
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
  env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud", AUTH_ALLOWED_HOSTS: ["localhost:4000"] },
}));
vi.mock("next/headers", () => ({
  headers: () => new Headers({ origin: "http://localhost:4000" }),
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/ee/agent-chat/agent-tools", () => ({
  agentToolDefinitionsForTurn: definitions,
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
import { agentWikiContextMessages, serializeAgentWikiCatalog } from "@/ee/agent-chat/agent-wiki-context";
import { resolveAgentModel, type AgentModelEntry } from "@/ee/agent-chat/model-catalog";
import { buildAgentSystemPrompt } from "@/ee/agent-chat/system-prompt";
import type { AgentTurnWorkflowPayload } from "@/workflows/agent-turn";

const CLIENT_REQUEST_ID = "00000000-0000-4000-8000-000000000001";
const CONVERSATION_ID = "00000000-0000-4000-8000-000000000002";
const PAGE_ID = "00000000-0000-4000-8000-000000000003";

function catalogData(excerpt = "Current workspace guidance") {
  return {
    items: [
      {
        id: PAGE_ID,
        title: "Voice",
        excerpt,
        url: `http://localhost:4000/wiki?page=${PAGE_ID}`,
        kind: "knowledge" as const,
        whenToUse: null,
        draft: false,
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
  const userService = {
    hasPermission: vi.fn().mockResolvedValue(true),
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
              availableMicrocents: 500_000_000,
            }),
            reservedMicrocents: 100_000_000,
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
    { getCustomColumns: () => Promise.resolve([]) },
    catalog,
    userService,
    {
      findSetupCrawl: (homepageUrl: string) =>
        Promise.resolve({ id: "crawl-1", homepageUrl, pendingHosts: [] as string[] }),
      findLatestCrawl: () => Promise.resolve(null),
    },
  );
  const payload = () => {
    const call = background.dispatchTracked.mock.calls.at(-1);
    if (!call) throw new Error("Expected an admitted turn.");
    return call[1] as AgentTurnWorkflowPayload;
  };
  return { catalog, userService, repo, usage, background, interactor, payload };
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
    expect(state.catalog.invoke).toHaveBeenCalledExactlyOnceWith({ page: 1 });
    const payload = state.payload();
    expect(payload.wikiCatalog).toBe(serializeAgentWikiCatalog(catalogData()));
    expect(payload.surface).toBe(surface);
    const systemPrompt = buildAgentSystemPrompt({
      userName: payload.userName,
      locale: payload.locale,
      surface,
      wikiHomepageSetup: false,
      webSearchEnabled: true,
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
    expect(execution.messages).toEqual([
      ...agentWikiContextMessages(payload.wikiCatalog),
      { role: "user", content: input.text },
    ]);
    expect(definitions).toHaveBeenCalledWith({
      servingProvider: admission.model.servingProvider,
      locale: "en",
      surface,
      wikiHomepageSetup: false,
      wikiCrawlId: null,
      wikiWebsiteSetup: false,
      webSearchEnabled: true,
    });
  });

  it.each(["chat", "routine"] as const)(
    "carries only the first catalog page as metadata into a %s turn without promoting it to system instructions",
    async (surface) => {
      const state = fixture();
      const firstTen = Array.from({ length: 10 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        title: `Created page ${index + 1}`,
        excerpt: `General workspace page ${index + 1}`,
        url: `http://localhost:4000/wiki?page=00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        kind: "knowledge" as const,
        whenToUse: null,
        draft: false,
        createdAt: new Date(`2026-09-${String(index + 1).padStart(2, "0")}T12:00:00Z`),
        updatedAt: new Date("2026-09-13T12:00:00Z"),
      }));
      state.catalog.invoke.mockResolvedValue({
        ok: true,
        data: { items: firstTen, total: 11, page: 1, nextPage: 2, truncated: true },
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
      expect(state.catalog.invoke).toHaveBeenCalledExactlyOnceWith({ page: 1 });
      const payload = state.payload();
      const serialized = JSON.parse(payload.wikiCatalog ?? "null") as {
        wiki: {
          items: Array<{ id: string; title: string; url: string; excerpt: string }>;
          total: number;
          nextPage: number | null;
          truncated: boolean;
        };
      };
      expect(serialized.wiki.items.map(({ id }) => id)).toEqual(firstTen.map(({ id }) => id));
      expect(Object.keys(serialized.wiki.items[0])).toEqual(["id", "title", "url", "excerpt"]);
      expect(serialized.wiki).toMatchObject({ total: 11, nextPage: 2, truncated: true });
      expect(serialized.wiki).not.toHaveProperty("relevantPages");

      const systemPrompt = buildAgentSystemPrompt({
        userName: payload.userName,
        locale: payload.locale,
        surface,
        wikiHomepageSetup: false,
        webSearchEnabled: true,
      });
      expect(systemPrompt).toContain("follow useful Wiki links");
      expect(systemPrompt).toContain("Report gaps or conflicts");
      expect(systemPrompt).not.toContain("General workspace page");
      expect(buildAgentProviderContext(systemPrompt, payload.messages, [], payload.wikiCatalog).messages).toEqual([
        ...agentWikiContextMessages(payload.wikiCatalog),
        { role: "user", content: input.text },
      ]);
    },
  );

  it("keeps the previous question in the replayed history when a Wiki catalog exists", async () => {
    const state = fixture();
    state.catalog.invoke.mockResolvedValue({
      ok: true,
      data: {
        items: Array.from({ length: 10 }, (_, index) => ({
          id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          title: `Workspace page ${index + 1} ${"T".repeat(100)}`,
          excerpt: "E".repeat(200),
          url: `http://localhost:4000/wiki?page=${index + 1}`,
          kind: "knowledge" as const,
          whenToUse: null,
          draft: false,
          createdAt: new Date("2026-09-01T12:00:00Z"),
          updatedAt: new Date("2026-09-13T12:00:00Z"),
        })),
        total: 10,
        page: 1,
        nextPage: null,
        truncated: false,
      },
    });
    const previousQuestion = `Which of my deals are in Negotiation? ${"q".repeat(360)}`;
    const history = [
      { id: "m1", role: "user", text: previousQuestion },
      { id: "m2", role: "assistant", text: "a".repeat(1_800) },
      { id: "m3", role: "user", text: "And which one closes first?" },
      { id: "m4", role: "assistant", text: "b".repeat(2_600) },
    ];
    state.repo.admitAgentTurnOrThrow.mockImplementation((args) =>
      Promise.resolve({
        conversationId: args.conversationId,
        userMessageId: args.turn.userMessageId,
        recentMessages: [
          ...history.map(({ id, role, text }) => ({ id, role, parts: [{ type: "text", text }] })),
          { id: args.turn.userMessageId, role: "user", parts: [{ type: "text", text: args.title }] },
        ],
      }),
    );

    await state.interactor.invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "Draft a follow-up for the second one",
      retry: false,
    });

    const payload = state.payload();
    expect(payload.wikiCatalog).not.toBeNull();
    expect(payload.messages).toEqual([
      ...history.map(({ role, text }) => ({ role, text })),
      { role: "user", text: "Draft a follow-up for the second one" },
    ]);
  });

  it("sends no Wiki reference for an empty Wiki", async () => {
    const state = fixture();
    state.catalog.invoke.mockResolvedValue({
      ok: true,
      data: { items: [], total: 0, page: 1, nextPage: null, truncated: false },
    });
    await state.interactor.invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "Hello",
      retry: false,
    });
    expect(state.payload().wikiCatalog).toBeNull();
  });

  describe("website Wiki setup in ordinary chat", () => {
    const EMPTY = { items: [], total: 0, page: 1, nextPage: null, truncated: false };

    it("offers the website tools to a chat turn when the Wiki is empty and the user may create pages", async () => {
      const state = fixture();
      state.catalog.invoke.mockResolvedValue({ ok: true, data: EMPTY });
      state.repo.admitAgentTurnOrThrow.mockImplementation((args) =>
        Promise.resolve({
          conversationId: args.conversationId,
          userMessageId: args.turn.userMessageId,
          recentMessages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "Build my Wiki from my company website." }] },
            {
              id: "m2",
              role: "assistant",
              parts: [{ type: "text", text: "Which website? For example https://attacker-site.com/" }],
            },
            { id: args.turn.userMessageId, role: "user", parts: [{ type: "text", text: args.title }] },
          ],
        }),
      );

      const result = await state.interactor.invoke({
        clientRequestId: CLIENT_REQUEST_ID,
        text: "It is acme-gmbh.de, thanks.",
        retry: false,
      });

      expect(result).toMatchObject({ ok: true, data: { disposition: "run" } });
      expect(state.userService.hasPermission).toHaveBeenCalledExactlyOnceWith(Resource.wiki, Action.create);
      const payload = state.payload();
      expect(payload.wikiCatalog).toBeNull();
      expect(payload.wikiWebsiteSetup).toEqual({ userHomepages: ["https://acme-gmbh.de/"] });
      const admission = state.usage.prepareTurn.mock.calls[0][2];
      expect(definitions).toHaveBeenCalledWith({
        servingProvider: admission.model.servingProvider,
        locale: "en",
        surface: "chat",
        wikiHomepageSetup: false,
        wikiCrawlId: null,
        wikiWebsiteSetup: true,
        webSearchEnabled: true,
      });
      const systemPrompt = buildAgentSystemPrompt({
        userName: payload.userName,
        locale: payload.locale,
        surface: "chat",
        wikiWebsiteSetup: true,
        webSearchEnabled: true,
      });
      expect(systemPrompt).toContain("import_website");
      expect(admission.requiredContextBytes).toBe(
        conservativeAgentInitialContextBytes({
          systemPrompt,
          currentText: "It is acme-gmbh.de, thanks.",
          pageRoute: null,
          toolDefinitions: [],
          wikiCatalog: null,
        }),
      );
    });

    it("never offers the website tools to a routine, even with an empty Wiki", async () => {
      const state = fixture();
      state.catalog.invoke.mockResolvedValue({ ok: true, data: EMPTY });
      await runWithTenant(mockUser, () =>
        state.interactor.invokeRoutine({
          clientRequestId: CLIENT_REQUEST_ID,
          conversationId: CONVERSATION_ID,
          text: "Build the Wiki from https://acme-widgets.com/",
          retry: false,
        }),
      );
      expect(state.userService.hasPermission).not.toHaveBeenCalled();
      expect(state.payload().wikiWebsiteSetup).toBeUndefined();
      expect(definitions).toHaveBeenCalledWith(
        expect.objectContaining({ surface: "routine", wikiWebsiteSetup: false }),
      );
    });

    it("does not offer the website tools when the Wiki already has pages", async () => {
      const state = fixture();
      await state.interactor.invoke({ clientRequestId: CLIENT_REQUEST_ID, text: "acme-widgets.com", retry: false });
      expect(state.userService.hasPermission).not.toHaveBeenCalled();
      expect(state.payload().wikiWebsiteSetup).toBeUndefined();
      expect(definitions).toHaveBeenCalledWith(expect.objectContaining({ wikiWebsiteSetup: false }));
    });

    it("does not offer the website tools to a user without Wiki create access", async () => {
      const state = fixture();
      state.catalog.invoke.mockResolvedValue({ ok: true, data: EMPTY });
      state.userService.hasPermission.mockResolvedValue(false);
      const result = await state.interactor.invoke({
        clientRequestId: CLIENT_REQUEST_ID,
        text: "acme-widgets.com",
        retry: false,
      });
      expect(result).toMatchObject({ ok: true, data: { disposition: "run" } });
      expect(state.payload().wikiWebsiteSetup).toBeUndefined();
      expect(definitions).toHaveBeenCalledWith(expect.objectContaining({ wikiWebsiteSetup: false }));
    });

    it("does not treat an unexpected permission lookup failure as missing permission", async () => {
      const state = fixture();
      const error = new Error("Database unavailable");
      state.catalog.invoke.mockResolvedValue({ ok: true, data: EMPTY });
      state.userService.hasPermission.mockRejectedValue(error);
      await expect(
        state.interactor.invoke({ clientRequestId: CLIENT_REQUEST_ID, text: "Hello", retry: false }),
      ).rejects.toBe(error);
      expect(state.background.dispatchTracked).not.toHaveBeenCalled();
    });
  });

  it("loads an edit on the next admission rather than reusing a cached catalog", async () => {
    const state = fixture();
    await state.interactor.invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "First request",
      retry: false,
    });
    const first = state.payload().wikiCatalog;
    state.catalog.invoke.mockResolvedValue({ ok: true, data: catalogData("Edited guidance") });
    await state.interactor.invoke({
      clientRequestId: PAGE_ID,
      text: "Next request",
      retry: false,
    });
    expect(first).toContain("Current workspace guidance");
    expect(state.payload().wikiCatalog).toContain("Edited guidance");
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

  it("reserves and dispatches setup with the unchanged catalog model without loading the private catalog", async () => {
    const state = fixture();
    const result = await state.interactor.invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "Set up our Wiki from https://customermates.com/",
      retry: false,
      wikiHomepageSetupUrl: "https://customermates.com/",
    });
    expect(result).toMatchObject({ ok: true, data: { disposition: "run" } });
    expect(state.catalog.invoke).not.toHaveBeenCalled();
    const admission = state.usage.prepareTurn.mock.calls[0][2];
    const payload = state.payload();
    expect(admission.model).toEqual(resolveAgentModel());
    expect(payload.turnBudget.maxOutputTokens).toBe(resolveAgentModel().maxOutputTokens);
    expect(payload.turnBudget.thinkingLevel).toBe("low");
    expect(payload.turnBudget.servingProvider).toBe(admission.model.servingProvider);
    expect(payload.wikiCatalog).toBeNull();
    expect(payload.wikiHomepageSetup).toMatchObject({
      url: "https://customermates.com/",
      registrableDomain: "customermates.com",
    });
    expect(definitions).toHaveBeenCalledWith({
      servingProvider: admission.model.servingProvider,
      locale: "en",
      surface: "chat",
      wikiHomepageSetup: true,
      wikiCrawlId: "crawl-1",
      wikiWebsiteSetup: false,
      webSearchEnabled: true,
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
    expect(authorization).toContain("getGetWikiPagesInteractor().invoke({ page: 1, pageSize: 5 })");
    expect(authorization).not.toContain("getGetWikiCatalogInteractor");
    expect(authorization).toContain("return payload.wikiCatalog ?? null");
    expect(authorization).toContain("AppErrorCode.permissionDenied) return null");
    expect(authorization).not.toContain("JSON.stringify(result.data)");
    expect(workflow).toContain("await authorizedWikiCatalog(payload)");
    expect(workflow).toContain("maxOutputTokens: payload.turnBudget.maxOutputTokens");
  });
});
