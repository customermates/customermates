import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tenant: "present" as "present" | "deleted" | "left",
  runPhase: vi.fn(),
  finish: vi.fn(),
  abandon: vi.fn(),
  abandonPlan: vi.fn(),
  followUps: vi.fn(),
  claimPlan: vi.fn(),
  planPart: vi.fn(),
  finishPlan: vi.fn(),
  notifyOnce: vi.fn(),
  reportFailure: vi.fn(),
  reportWarning: vi.fn(),
}));

vi.mock("workflow", () => ({
  getWorkflowMetadata: () => ({ workflowRunId: "run-1" }),
  sleep: () => Promise.resolve(),
}));
vi.mock("@/core/decorators/background-tenant", async () => {
  const { AppErrorCode: codes, ForbiddenError: Forbidden } = await import("@/core/errors/app-errors");
  const { Prisma } = await import("@/generated/prisma");
  return {
    runAsBackgroundTenant: (
      _userId: string,
      run: () => Promise<unknown>,
      options: { allowInactive?: boolean } = {},
    ) => {
      if (state.tenant === "deleted") {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError("No record was found", { code: "P2025", clientVersion: "test" }),
        );
      }
      if (state.tenant === "left" && !options.allowInactive)
        return Promise.reject(new Forbidden("User is not active", codes.inactiveUser));
      return run();
    },
  };
});
vi.mock("@/core/di", () => ({
  getWorkspaceSetupInterviewService: () => ({
    followUps: state.followUps,
    claimPlan: state.claimPlan,
    planPart: state.planPart,
    finishPlan: state.finishPlan,
    abandonPlan: state.abandonPlan,
    drainWarnings: () => [],
  }),
  getWorkspaceSetupBuildService: () => ({
    runPhase: state.runPhase,
    finish: state.finish,
    abandon: state.abandon,
    drainWarnings: () => [],
  }),
  getWorkspaceSetupRepo: () => ({}),
  getWorkspaceSetupNotifier: () => ({}),
}));
vi.mock("@/ee/workspace-setup/workspace-setup-notice-marker", () => ({ notifyWorkspaceSetupOnce: state.notifyOnce }));
vi.mock("../capture-failure", () => ({
  toWorkflowFailure: (error: Error) => ({ name: error.name, message: error.message }),
  reportFailure: state.reportFailure,
  reportWarning: state.reportWarning,
}));

import { buildWorkspaceSetup, planWorkspaceSetup } from "../workspace-setup";

const payload = { setupId: "setup-1", userId: "owner-1" };

beforeEach(() => {
  vi.resetAllMocks();
  state.tenant = "present";
  state.runPhase.mockResolvedValue("settled");
  state.finish.mockResolvedValue(true);
  state.notifyOnce.mockResolvedValue(null);
  state.followUps.mockResolvedValue("none");
  state.claimPlan.mockResolvedValue({ status: "claimed", revision: 2 });
  state.planPart.mockResolvedValue("done");
  state.finishPlan.mockResolvedValue("planned");
});

describe("workspace setup workflows when things go wrong", () => {
  it("passes its run id to every phase so a second run cannot take a claimed phase", async () => {
    await buildWorkspaceSetup(payload);
    expect(state.runPhase.mock.calls.map((call) => call[3])).toEqual(Array(5).fill("run-1"));
    expect(state.notifyOnce).toHaveBeenCalledWith({}, {}, "setup-1", "build");
  });

  it("mails that the workspace is ready while its Knowledge Base is still being written", async () => {
    let knowledgeBaseRounds = 0;
    state.runPhase.mockImplementation((_setupId: string, phase: string) => {
      if (phase !== "knowledgeBase") return Promise.resolve("settled");
      knowledgeBaseRounds += 1;
      return Promise.resolve(knowledgeBaseRounds < 5 ? "wait" : "settled");
    });
    const settledAt: number[] = [];
    state.notifyOnce.mockImplementation(() => {
      settledAt.push(knowledgeBaseRounds);
      return Promise.resolve("workspaceReady");
    });

    await buildWorkspaceSetup(payload);

    expect(settledAt).toHaveLength(1);
    expect(settledAt[0]).toBeLessThan(5);
    expect(knowledgeBaseRounds).toBe(5);
    expect(state.abandon).not.toHaveBeenCalled();
  });

  it("ends quietly without errors, release or mail when the workspace was deleted", async () => {
    state.tenant = "deleted";
    await expect(buildWorkspaceSetup(payload)).resolves.toBeUndefined();
    expect(state.runPhase).not.toHaveBeenCalled();
    expect(state.abandon).not.toHaveBeenCalled();
    expect(state.finish).not.toHaveBeenCalled();
    expect(state.notifyOnce).not.toHaveBeenCalled();
    expect(state.reportFailure).not.toHaveBeenCalled();

    await expect(planWorkspaceSetup(payload)).resolves.toBeUndefined();
    expect(state.claimPlan).not.toHaveBeenCalled();
    expect(state.reportFailure).not.toHaveBeenCalled();
  });

  it("releases the phases of an owner who left the workspace and sends them nothing", async () => {
    state.tenant = "left";
    await expect(buildWorkspaceSetup(payload)).resolves.toBeUndefined();
    expect(state.runPhase).not.toHaveBeenCalled();
    expect(state.abandon).toHaveBeenCalledWith("setup-1", "run-1");
    expect(state.notifyOnce).not.toHaveBeenCalled();
    expect(state.reportFailure).not.toHaveBeenCalled();
  });

  it("still fails a step whose own work found no record", async () => {
    state.runPhase.mockRejectedValue(Object.assign(new Error("Record gone"), { code: "P2025" }));
    await expect(buildWorkspaceSetup(payload)).rejects.toThrow("Record gone");
    expect(state.reportFailure).toHaveBeenCalled();
  });

  it("mails the outcome after releasing a failed build or plan run", async () => {
    state.runPhase.mockRejectedValue(new Error("database down"));
    await expect(buildWorkspaceSetup(payload)).rejects.toThrow("database down");
    expect(state.abandon).toHaveBeenCalledWith("setup-1", "run-1");
    expect(state.notifyOnce).toHaveBeenCalledWith({}, {}, "setup-1", "build");
    expect(state.abandon.mock.invocationCallOrder[0]).toBeLessThan(state.notifyOnce.mock.invocationCallOrder[0]);

    state.planPart.mockRejectedValue(new Error("database down"));
    await expect(planWorkspaceSetup(payload)).rejects.toThrow("database down");
    expect(state.abandonPlan).toHaveBeenCalledWith("setup-1", 2);
    expect(state.notifyOnce).toHaveBeenLastCalledWith({}, {}, "setup-1", "plan");
  });

  it("reports a notice that keeps failing instead of failing the build", async () => {
    state.notifyOnce.mockRejectedValue(new Error("mail down"));
    await expect(buildWorkspaceSetup(payload)).resolves.toBeUndefined();
    expect(state.finish).toHaveBeenCalledWith("setup-1");
    expect(state.reportWarning).toHaveBeenCalledWith(
      "build-workspace-setup",
      "Workspace setup notice failed: Error.",
      undefined,
    );
    expect(state.reportFailure).not.toHaveBeenCalled();
  });

  it("waits for a phase another step still settles before it mails the outcome", async () => {
    state.finish.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
    await buildWorkspaceSetup(payload);
    expect(state.finish).toHaveBeenCalledTimes(3);
    expect(state.finish.mock.invocationCallOrder[2]).toBeLessThan(state.notifyOnce.mock.invocationCallOrder[0]);
  });
});
