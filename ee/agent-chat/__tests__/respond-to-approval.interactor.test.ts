import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUserWithPermissions([]);

vi.mock("@/env", () => ({
  env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" as const },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { RespondToApprovalInteractor } from "../respond-to-approval.interactor";
import { agentApprovalHookToken } from "../agent-approval-resume";

const conversationId = "00000000-0000-4000-8000-000000000001";
const requestId = "turn-1:tool-1";

function repoWith(resolved: object | null, order: string[] = []) {
  return {
    findConversation: vi.fn().mockResolvedValue({ id: conversationId }),
    resolvePendingApprovalRequest: vi.fn().mockImplementation(() => {
      order.push("resolve");
      return Promise.resolve(resolved);
    }),
  };
}

describe("RespondToApprovalInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists the decision before waking the workflow and reports accepted delivery", async () => {
    const order: string[] = [];
    const repo = repoWith({ toolName: "create_contacts", resolved: true }, order);
    const backgroundTasks = {
      resume: vi.fn().mockImplementation(() => {
        order.push("resume");
        return Promise.resolve(true);
      }),
    };

    const result = await new RespondToApprovalInteractor(
      repo as never,
      mockEntitlementService(),
      backgroundTasks as never,
    ).invoke({ conversationId, requestId, decision: "approve" });

    expect(result).toEqual({
      ok: true,
      data: { resolved: true, resumed: true },
    });
    expect(order).toEqual(["resolve", "resume"]);
    expect(MOCK_PRISMA_DB_MODULE.prisma.$transaction).not.toHaveBeenCalled();
    expect(backgroundTasks.resume).toHaveBeenCalledWith(agentApprovalHookToken(conversationId), { requestId });
  });

  it("returns a saved decision even when the durable wake must be retried", async () => {
    const repo = repoWith({ toolName: "create_contacts", resolved: true });
    const backgroundTasks = { resume: vi.fn().mockResolvedValue(false) };

    const result = await new RespondToApprovalInteractor(
      repo as never,
      mockEntitlementService(),
      backgroundTasks as never,
    ).invoke({ conversationId, requestId, decision: "reject" });

    expect(result).toEqual({
      ok: true,
      data: { resolved: true, resumed: false },
    });
  });

  it("does not wake a missing, expired, or conflicting approval", async () => {
    const repo = repoWith(null);
    const backgroundTasks = { resume: vi.fn() };

    const result = await new RespondToApprovalInteractor(
      repo as never,
      mockEntitlementService(),
      backgroundTasks as never,
    ).invoke({ conversationId, requestId, decision: "approve" });

    expect(result).toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "agentApprovalUnavailable" } }] },
    });
    expect(backgroundTasks.resume).not.toHaveBeenCalled();
  });

  it("propagates an unexpected workflow delivery failure after the decision is durable", async () => {
    const repo = repoWith({ toolName: "create_contacts", resolved: true });
    const backgroundTasks = {
      resume: vi.fn().mockRejectedValue(new Error("queue unavailable")),
    };

    await expect(
      new RespondToApprovalInteractor(repo as never, mockEntitlementService(), backgroundTasks as never).invoke({
        conversationId,
        requestId,
        decision: "approve",
      }),
    ).rejects.toThrow("queue unavailable");
  });
});
