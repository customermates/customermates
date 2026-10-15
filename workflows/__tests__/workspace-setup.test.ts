import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  sleeps: 0,
  kbWaits: 2,
  prefill: vi.fn(),
  followUps: vi.fn(),
  claimPlan: vi.fn(),
  planPart: vi.fn(),
  finishPlan: vi.fn(),
  runPhase: vi.fn(),
  finish: vi.fn(),
  reportFailure: vi.fn(),
  reportWarning: vi.fn(),
}));

vi.mock("workflow", () => ({
  sleep: () => {
    state.sleeps += 1;
    return Promise.resolve();
  },
}));
vi.mock("@/core/decorators/background-tenant", () => ({
  runAsBackgroundTenant: (_userId: string, run: () => Promise<unknown>) => run(),
}));
vi.mock("@/core/di", () => ({
  getWorkspaceSetupInterviewService: () => ({
    prefill: state.prefill,
    followUps: state.followUps,
    claimPlan: state.claimPlan,
    planPart: state.planPart,
    finishPlan: state.finishPlan,
    drainWarnings: () => [],
  }),
  getWorkspaceSetupBuildService: () => ({
    runPhase: state.runPhase,
    finish: state.finish,
    drainWarnings: () => ["phase warning"],
  }),
}));
vi.mock("../capture-failure", () => ({
  toWorkflowFailure: (error: Error) => ({ name: error.name, message: error.message }),
  reportFailure: state.reportFailure,
  reportWarning: state.reportWarning,
}));

import { buildWorkspaceSetup, planWorkspaceSetup, prepareWorkspaceSetup } from "../workspace-setup";

const payload = { setupId: "setup-1", userId: "owner-1" };

beforeEach(() => {
  vi.resetAllMocks();
  state.calls = [];
  state.sleeps = 0;
  state.kbWaits = 2;
  state.claimPlan.mockResolvedValue({ status: "claimed", revision: 4 });
  state.planPart.mockResolvedValue("done");
  state.finishPlan.mockResolvedValue("planned");
  state.runPhase.mockImplementation((_setupId: string, phase: string) => {
    state.calls.push(phase);
    if (phase === "knowledgeBase" && state.kbWaits > 0) {
      state.kbWaits -= 1;
      return Promise.resolve("wait");
    }
    return Promise.resolve("settled");
  });
});

describe("workspace setup workflows", () => {
  it("waits for crawled text before pre-filling, then forces the pre-fill on the last round", async () => {
    state.prefill.mockResolvedValueOnce("wait").mockResolvedValueOnce("wait").mockResolvedValueOnce("done");
    await prepareWorkspaceSetup(payload);
    expect(state.prefill.mock.calls).toEqual([
      ["setup-1", false],
      ["setup-1", false],
      ["setup-1", false],
    ]);
    expect(state.sleeps).toBe(2);

    state.prefill.mockReset().mockResolvedValue("wait");
    await prepareWorkspaceSetup(payload);
    expect(state.prefill.mock.calls.at(-1)).toEqual(["setup-1", true]);
  });

  it("plans only when no follow-up question was asked, one durable step per plan part", async () => {
    state.followUps.mockReset().mockResolvedValueOnce("asked").mockResolvedValueOnce("none");
    await planWorkspaceSetup(payload);
    expect(state.claimPlan).not.toHaveBeenCalled();
    await planWorkspaceSetup(payload);
    expect(state.planPart.mock.calls).toEqual([
      ["setup-1", 4, "model"],
      ["setup-1", 4, "knowledge"],
      ["setup-1", 4, "views"],
    ]);
    expect(state.finishPlan).toHaveBeenCalledWith("setup-1", 4, false);
    expect(state.sleeps).toBe(0);
  });

  it("repeats a part attempt the planner asked to repair and skips views without a record model", async () => {
    state.followUps.mockResolvedValue("none");
    state.planPart.mockImplementation((_id: string, _revision: number, part: string) =>
      Promise.resolve(part === "model" ? "failed" : "done"),
    );
    state.planPart.mockResolvedValueOnce("retry");
    state.finishPlan.mockResolvedValue("failed");
    await planWorkspaceSetup(payload);
    expect(state.planPart.mock.calls.map(([, , part]) => part)).toEqual(["model", "knowledge", "model"]);
    expect(state.finishPlan).toHaveBeenCalledOnce();
  });

  it("drafts the plan a second time after a failed attempt and gives up after the last one", async () => {
    state.followUps.mockResolvedValue("none");
    state.finishPlan.mockResolvedValueOnce("retry").mockResolvedValueOnce("failed");
    await planWorkspaceSetup(payload);
    expect(state.finishPlan.mock.calls).toEqual([
      ["setup-1", 4, false],
      ["setup-1", 4, true],
    ]);
    expect(state.claimPlan).toHaveBeenCalledTimes(2);
    expect(state.sleeps).toBe(1);
  });

  it("waits for a fresh plan claim held by another run and stops when the setup moved on", async () => {
    state.followUps.mockResolvedValue("none");
    state.claimPlan.mockResolvedValueOnce({ status: "busy" }).mockResolvedValueOnce({ status: "skip" });
    await planWorkspaceSetup(payload);
    expect(state.planPart).not.toHaveBeenCalled();
    expect(state.finishPlan).not.toHaveBeenCalled();
    expect(state.sleeps).toBe(1);
  });

  it("runs the Knowledge Base beside the data model, then views, records and dashboard, then finishes", async () => {
    await buildWorkspaceSetup(payload);
    expect(state.calls.filter((phase) => phase === "knowledgeBase")).toHaveLength(3);
    expect(state.calls.indexOf("dataModel")).toBeLessThan(state.calls.indexOf("views"));
    expect(state.calls.indexOf("dataModel")).toBeLessThan(state.calls.indexOf("records"));
    expect(state.calls.indexOf("dataModel")).toBeLessThan(state.calls.indexOf("dashboard"));
    expect(state.calls.indexOf("dataModel")).toBeLessThan(state.calls.lastIndexOf("knowledgeBase"));
    expect(state.finish).toHaveBeenCalledWith("setup-1");
    expect(state.reportWarning).toHaveBeenCalledWith("build-workspace-setup", "phase warning", undefined);
  });

  it("reports and rethrows a failed build without finishing it", async () => {
    state.runPhase.mockRejectedValue(new Error("database down"));
    await expect(buildWorkspaceSetup(payload)).rejects.toThrow("database down");
    expect(state.finish).not.toHaveBeenCalled();
    expect(state.reportFailure).toHaveBeenCalledWith(
      "build-workspace-setup",
      { name: "Error", message: "database down" },
      undefined,
    );
  });
});
