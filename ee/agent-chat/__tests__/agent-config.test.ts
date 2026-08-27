import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUserWithPermissions([]);

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    APP_MODE: "cloud" as const,
  },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { GetAgentConfigInteractor } from "../get-agent-config.interactor";

const COUNTS = {
  contacts: true,
  organizations: false,
  deals: true,
  services: false,
  tasks: true,
  connectedAccounts: false,
};

describe("GetAgentConfigInteractor", () => {
  let repo: {
    normalizeExpiredAgentRunLease: ReturnType<typeof vi.fn>;
    getSuggestionSignals: ReturnType<typeof vi.fn>;
    findMyConversation: ReturnType<typeof vi.fn>;
    listConversationPage: ReturnType<typeof vi.fn>;
  };
  const usageService = {
    getUsageSummary: vi.fn().mockResolvedValue({
      creditsUsed: 0,
      creditsRemaining: 500,
      creditsLimit: 500,
      usedPct: 0,
      plan: "pro",
      periodStart: new Date(),
      resetAt: new Date(),
      recentTurnCredits: null,
      blockedReason: null,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      getSuggestionSignals: vi.fn().mockResolvedValue(COUNTS),
      findMyConversation: vi.fn().mockResolvedValue({ id: "conv-1" }),
      listConversationPage: vi.fn().mockResolvedValue({ conversations: [], nextCursor: null }),
    };
  });

  it("returns the per-entity suggestion signals alongside the existing config", async () => {
    const result: any = await new GetAgentConfigInteractor(
      repo as never,
      usageService as never,
      mockEntitlementService(),
    ).invoke();

    expect(result.ok).toBe(true);
    expect(result.data.counts).toEqual(COUNTS);
    expect(result.data).not.toHaveProperty("preAuthorizedTools");
    expect(usageService.getUsageSummary).toHaveBeenCalledWith(mockUser.id);
    expect(mockUser.role?.isSystemRole).toBe(false);
    expect(mockUser.role?.permissions).toEqual([]);
  });

  it("normalizes expired leases with the canonical model before reading usage or config", async () => {
    let finishNormalization: (() => void) | undefined;
    const normalization = new Promise<void>((resolve) => {
      finishNormalization = resolve;
    });
    repo.normalizeExpiredAgentRunLease.mockReturnValue(normalization);

    const invocation = new GetAgentConfigInteractor(
      repo as never,
      usageService as never,
      mockEntitlementService(),
    ).invoke();
    await vi.waitFor(() => expect(repo.normalizeExpiredAgentRunLease).toHaveBeenCalledTimes(1));

    expect(repo.normalizeExpiredAgentRunLease).toHaveBeenCalledWith(expect.any(Date), "openai/gpt-5.6-luna");
    expect(usageService.getUsageSummary).not.toHaveBeenCalled();
    expect(repo.getSuggestionSignals).not.toHaveBeenCalled();
    expect(repo.findMyConversation).not.toHaveBeenCalled();
    expect(repo.listConversationPage).not.toHaveBeenCalled();

    finishNormalization?.();
    await invocation;

    expect(usageService.getUsageSummary).toHaveBeenCalledWith(mockUser.id);
  });

  it("preserves a disabled denial before reading usage or repository state", async () => {
    const denial = {
      ok: false as const,
      error: new z.ZodError([{ code: "custom", path: [], message: "The Assistant is unavailable." }]),
      code: "agentChatDisabled" as const,
    };
    const entitlements = { require: vi.fn().mockResolvedValue(denial) };

    const result = await new GetAgentConfigInteractor(
      repo as never,
      usageService as never,
      entitlements as never,
    ).invoke();

    expect(result).toEqual({ ok: true, data: { enabled: false } });
    expect(entitlements.require).toHaveBeenCalledWith("agentChat");
    expect(repo.normalizeExpiredAgentRunLease).not.toHaveBeenCalled();
    expect(usageService.getUsageSummary).not.toHaveBeenCalled();
    expect(repo.getSuggestionSignals).not.toHaveBeenCalled();
    expect(repo.findMyConversation).not.toHaveBeenCalled();
    expect(repo.listConversationPage).not.toHaveBeenCalled();
  });
});
