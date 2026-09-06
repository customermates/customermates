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

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" as const } }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { CancelAgentTurnInteractor } from "../cancel-agent-turn.interactor";
import { agentApprovalHookToken } from "../agent-approval-resume";
import { agentUiCommandHookToken } from "../agent-ui-command";

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";

function repoWith(cancelling: boolean) {
  return {
    findUserConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
    requestAgentTurnCancellation: vi.fn().mockResolvedValue(cancelling),
    findRunningAgentTurnForCancellation: vi.fn().mockResolvedValue(null),
    reconcileInterruptedAgentTurnUnscoped: vi.fn().mockResolvedValue({ reconciled: true }),
  };
}

describe("stopping a durable agent turn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wakes a run suspended on an approval", async () => {
    const repo = repoWith(true);
    const backgroundTasks = { resume: vi.fn().mockResolvedValue(true) };

    const result = await new CancelAgentTurnInteractor(
      repo as never,
      mockEntitlementService(),
      backgroundTasks as never,
    ).invoke({ conversationId: CONVERSATION_ID });

    expect(result.ok && result.data.cancelling).toBe(true);
    expect(backgroundTasks.resume).toHaveBeenCalledTimes(1);
    expect(backgroundTasks.resume).toHaveBeenCalledWith(agentApprovalHookToken(CONVERSATION_ID), { cancelled: true });
  });

  it("falls back to the interface hook when the run is waiting on the panel instead", async () => {
    const repo = repoWith(true);
    const backgroundTasks = { resume: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true) };

    await new CancelAgentTurnInteractor(repo as never, mockEntitlementService(), backgroundTasks as never).invoke({
      conversationId: CONVERSATION_ID,
    });

    expect(backgroundTasks.resume).toHaveBeenNthCalledWith(1, agentApprovalHookToken(CONVERSATION_ID), {
      cancelled: true,
    });
    expect(backgroundTasks.resume).toHaveBeenNthCalledWith(2, agentUiCommandHookToken(CONVERSATION_ID), {
      cancelled: true,
    });
  });

  it("wakes nothing when there was no running turn to stop", async () => {
    const repo = repoWith(false);
    const backgroundTasks = { resume: vi.fn().mockResolvedValue(true) };

    const result = await new CancelAgentTurnInteractor(
      repo as never,
      mockEntitlementService(),
      backgroundTasks as never,
    ).invoke({ conversationId: CONVERSATION_ID });

    expect(result.ok && result.data.cancelling).toBe(false);
    expect(backgroundTasks.resume).not.toHaveBeenCalled();
  });
});

describe("stopping an already-terminated workflow", () => {
  const turn = {
    id: "turn-1",
    conversationId: CONVERSATION_ID,
    companyId: "company-1",
    userId: "user-1",
    runId: "attempt-1",
    externalRunId: "workflow-1",
  };

  it("reconciles a confirmed terminal workflow using its exact recorded identity", async () => {
    const repo = repoWith(true);
    repo.findRunningAgentTurnForCancellation.mockResolvedValue(turn);
    const backgroundTasks = {
      resume: vi.fn().mockResolvedValue(false),
      isWorkflowTerminal: vi.fn().mockResolvedValue(true),
    };

    const result = await new CancelAgentTurnInteractor(
      repo as never,
      mockEntitlementService(),
      backgroundTasks as never,
    ).invoke({ conversationId: CONVERSATION_ID });

    expect(result.ok && result.data.cancelling).toBe(true);
    expect(backgroundTasks.isWorkflowTerminal).toHaveBeenCalledWith("workflow-1");
    expect(repo.reconcileInterruptedAgentTurnUnscoped).toHaveBeenCalledWith({
      turnRequestId: turn.id,
      conversationId: turn.conversationId,
      companyId: turn.companyId,
      userId: turn.userId,
      runId: turn.runId,
      externalRunId: turn.externalRunId,
    });
    expect(backgroundTasks.resume).not.toHaveBeenCalled();
  });

  it.each(["running", "unavailable"])("does not settle when status is %s", async (status) => {
    const repo = repoWith(true);
    repo.findRunningAgentTurnForCancellation.mockResolvedValue(turn);
    const backgroundTasks = {
      resume: vi.fn().mockResolvedValue(true),
      isWorkflowTerminal:
        status === "running"
          ? vi.fn().mockResolvedValue(false)
          : vi.fn().mockRejectedValue(new Error("status unavailable")),
    };

    await new CancelAgentTurnInteractor(repo as never, mockEntitlementService(), backgroundTasks as never).invoke({
      conversationId: CONVERSATION_ID,
    });

    expect(repo.reconcileInterruptedAgentTurnUnscoped).not.toHaveBeenCalled();
    expect(backgroundTasks.resume).toHaveBeenCalledWith(agentApprovalHookToken(CONVERSATION_ID), { cancelled: true });
  });
});
