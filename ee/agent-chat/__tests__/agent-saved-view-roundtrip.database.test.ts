import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { SURFACE } from "@/core/data-view/data-view-keys";
import type { TenantUser } from "@/features/user/user.schema";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { createMockUser } from "@/tests/helpers/mock-user";

const authState = vi.hoisted(() => ({ user: null as TenantUser | null }));
const manageDataViewsInvoke = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    CLOUD_HOSTED: true,
    AGENT_CHAT_DISABLED: false,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    BASE_URL: "http://localhost:4000",
    AUTH_ALLOWED_HOSTS: ["localhost:4000"],
    AI_GATEWAY_API_KEY: undefined,
    HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS: null,
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: false,
    HOSTED_AI_PROVIDER_WORK_PAUSED: false,
  },
}));
vi.mock("@/core/di", () => ({
  getManageDataViewsInteractor: () => ({ invoke: manageDataViewsInvoke }),
  getUserService: () => ({
    getActiveUserOrThrow: () => {
      if (!authState.user) throw new Error("Test user is not configured.");
      return Promise.resolve(authState.user);
    },
  }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => ({
  getZodParseContext: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers({ origin: "http://localhost:4000" })),
}));

const { runWithoutTenant, runWithTenant } = await import("@/core/decorators/tenant-context");
const { prisma } = await import("@/prisma/db");
const { describeAgentTool } = await import("@/ee/agent-chat/agent-activity");
const { GetAgentConversationInteractor } = await import("@/ee/agent-chat/get-agent-conversation.interactor");
const { PrismaAgentChatRepo } = await import("@/ee/agent-chat/prisma-agent-chat.repository");
const { SendAgentMessageInteractor } = await import("@/ee/agent-chat/send-agent-message.interactor");
const { getAgentAiTools } = await import("@/ee/agent-chat/agent-tools");
const { AgentTurnTranscript } = await import("@/ee/agent-chat/agent-turn-transcript");
const { AgentUsageService } = await import("@/ee/agent-chat/agent-usage.service");
const { internalToolIdentity } = await import("@/ee/agent-chat/tool-identity");

const companyId = randomUUID();
const userId = randomUUID();
const tenantUser = createMockUser({
  id: userId,
  companyId,
  email: `saved-view-roundtrip-${userId}@example.com`,
});
const VIEW_ROUTE = `/en/contacts?view=__all__&viewSurface=${SURFACE.contacts}&viewAction=update`;
const VIEW_HREF = "/contacts?view=__all__";
const VIEW_CONTEXT = {
  reference: {
    kind: "dataView" as const,
    surfaceKey: SURFACE.contacts,
    viewKey: "__all__" as const,
    requestedAction: "update" as const,
  },
  label: "Contact view: All",
};
const TOOL_INPUT = {
  action: "update" as const,
  surfaceKey: SURFACE.contacts,
  viewKey: "__all__" as const,
  state: { viewMode: "card" as const },
};

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

function executeTool(tool: unknown, input: unknown, toolCallId: string) {
  return (
    tool as {
      execute: (value: unknown, options: { toolCallId: string }) => Promise<unknown>;
    }
  ).execute(input, { toolCallId });
}

describeDatabase("saved-view Assistant persistence round trip", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    const creditAnchor = new Date("2026-09-01T00:00:00.000Z");
    authState.user = tenantUser;
    manageDataViewsInvoke.mockResolvedValue({
      ok: true,
      data: {
        action: "update",
        surfaceKey: SURFACE.contacts,
        path: "/contacts",
        viewKey: "__all__",
        state: { viewMode: "card" },
        link: VIEW_HREF,
      },
    });

    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      await prisma.subscription.create({
        data: {
          companyId,
          status: "active",
          plan: "starter",
          agentCreditAnchorAt: creditAnchor,
        },
      });
      await prisma.user.create({
        data: {
          id: userId,
          companyId,
          email: tenantUser.email,
          firstName: tenantUser.firstName,
          lastName: tenantUser.lastName,
          status: "active",
          agentCreditActivatedAt: creditAnchor,
        },
      });
    });
  });

  afterAll(async () => {
    authState.user = null;
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  it("persists and hydrates the selected view context and completed saved-view activity", async () => {
    const repo = new PrismaAgentChatRepo();
    const clientRequestId = randomUUID();
    const toolCallId = randomUUID();
    const backgroundTasks = {
      dispatch: vi.fn().mockResolvedValue(undefined),
      dispatchTracked: vi.fn().mockResolvedValue("wrun_saved_view_roundtrip"),
      resume: vi.fn().mockResolvedValue(true),
    };
    const entitlements = mockEntitlementService();
    const admitted = await new SendAgentMessageInteractor(
      repo,
      new AgentUsageService(repo),
      entitlements,
      backgroundTasks as never,
      { getCustomColumns: () => Promise.resolve([]) } as never,
    ).invoke({
      clientRequestId,
      text: "Show this view as cards",
      contexts: [VIEW_CONTEXT],
      pageContext: { route: VIEW_ROUTE },
      locale: "en",
      retry: false,
    });
    expect(admitted).toMatchObject({ ok: true, data: { disposition: "run" } });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted agent turn.");
    const admittedRun = admitted.data;

    const tools = getAgentAiTools({
      runUiCommand: () => Promise.resolve({ ok: true, result: "not used" }),
      requestApproval: () => Promise.resolve("approve"),
      resolveApprovalContext: (_toolName, input) => Promise.resolve({ ok: true, input }),
      createSupportTicket: () => Promise.resolve({ ok: true, result: "not used" }),
      runExactlyOnce: (_callId, _toolName, run) => run(),
      runInCallerContext: (run) => runWithTenant(tenantUser, run),
      resultMaxChars: 6000,
      pageRoute: VIEW_ROUTE,
    });
    const output = await executeTool(tools.manage_data_views, TOOL_INPUT, toolCallId);
    expect(output).toMatchObject({
      ok: true,
      navigation: { kind: "saved-view", href: VIEW_HREF },
    });
    expect(manageDataViewsInvoke).toHaveBeenCalledWith(TOOL_INPUT);

    const transcript = new AgentTurnTranscript(() => undefined);
    transcript.beginToolCall({
      toolCallId,
      toolName: "manage_data_views",
      activity: describeAgentTool(internalToolIdentity("manage_data_views"), TOOL_INPUT),
    });
    transcript.completeToolCall({
      toolCallId,
      toolName: "manage_data_views",
      status: "done",
      failed: false,
      output: { type: "json", value: output },
    });

    const finalized = await repo.finalizeAgentTurnOrThrowUnscoped({
      turnRequestId: admittedRun.turnRequestId,
      conversationId: admittedRun.conversationId,
      companyId,
      userId,
      runId: admittedRun.runId,
      parts: transcript.replyParts,
      terminalCode: "completed",
      stopReason: null,
      affectedResources: transcript.affectedResources,
      usageSettlement: null,
    });
    const hydrated = await new GetAgentConversationInteractor(repo, entitlements).invoke({
      conversationId: admittedRun.conversationId,
    });

    expect(hydrated.ok).toBe(true);
    if (!hydrated.ok) throw new Error("Expected the persisted conversation to hydrate.");
    expect(hydrated.data.activeTurn).toBe(false);
    expect(hydrated.data.messages).toHaveLength(2);
    expect(hydrated.data.messages[0]).toMatchObject({
      id: admittedRun.userMessageId,
      role: "user",
      parts: [
        { type: "context", context: VIEW_CONTEXT },
        { type: "text", text: "Show this view as cards" },
      ],
      turn: {
        clientRequestId,
        status: "completed",
        assistantMessageId: finalized.assistantMessage.id,
        terminalCode: "completed",
        stopReason: null,
      },
    });
    expect(hydrated.data.messages[1]).toMatchObject({
      id: finalized.assistantMessage.id,
      role: "assistant",
      parts: [
        {
          type: "activity",
          id: toolCallId,
          status: "done",
          activity: {
            kind: "views.configure",
            risk: "write",
            viewSurfaceKey: SURFACE.contacts,
            viewAction: "update",
            viewKey: "__all__",
            viewHref: VIEW_HREF,
          },
        },
      ],
      turn: null,
    });

    const persistedTurn = await runWithoutTenant(() =>
      prisma.agentTurnRequest.findUniqueOrThrow({ where: { id: admittedRun.turnRequestId } }),
    );
    expect(persistedTurn).toMatchObject({
      status: "completed",
      assistantMessageId: finalized.assistantMessage.id,
      terminalCode: "completed",
      stopReason: null,
    });
  });
});
