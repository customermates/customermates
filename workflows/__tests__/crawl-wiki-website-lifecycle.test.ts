import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tenantCalls: 0,
  failTenantAt: 0,
  ownerFailure: new Error("Website import owner is no longer active."),
  claimWorkflow: vi.fn(),
  discover: vi.fn(),
  fetchBatch: vi.fn(),
  importSources: vi.fn(),
  finish: vi.fn(),
  plan: vi.fn(),
  writeTopic: vi.fn(),
  settle: vi.fn(),
  failWorkflowUnscoped: vi.fn(),
  reportFailure: vi.fn(),
  reportWarning: vi.fn(),
  warnings: [] as string[][],
}));

vi.mock("workflow", () => ({ getWorkflowMetadata: () => ({ workflowRunId: "run-owner" }) }));
vi.mock("@/core/decorators/background-tenant", () => ({
  runAsBackgroundTenant: async (_userId: string, run: () => Promise<unknown>) => {
    state.tenantCalls += 1;
    if (state.tenantCalls === state.failTenantAt) throw state.ownerFailure;
    return await run();
  },
}));
vi.mock("@/core/di", () => ({
  getWikiWebsiteCrawlService: () => ({
    claimWorkflow: state.claimWorkflow,
    discover: state.discover,
    fetchBatch: state.fetchBatch,
    importSources: state.importSources,
    finish: state.finish,
  }),
  getWikiWebsiteSynthesisService: () => ({
    plan: state.plan,
    writeTopic: state.writeTopic,
    settle: state.settle,
    drainWarnings: () => state.warnings.shift() ?? [],
  }),
  getFailWikiWebsiteCrawlInteractor: () => ({ invoke: state.failWorkflowUnscoped }),
}));
vi.mock("../capture-failure", () => ({
  toWorkflowFailure: (error: Error) => ({ name: error.name, message: error.message, stack: error.stack }),
  reportFailure: state.reportFailure,
  reportWarning: state.reportWarning,
}));

import { crawlWikiWebsite } from "../crawl-wiki-website";

const payload = {
  crawlId: "crawl-owner",
  userId: "user-owner",
  tenant: { userId: "user-owner", companyId: "company-owner" },
};

beforeEach(() => {
  vi.resetAllMocks();
  state.tenantCalls = 0;
  state.failTenantAt = 0;
  state.ownerFailure = new Error("Website import owner is no longer active.");
  state.claimWorkflow.mockResolvedValue(true);
  state.discover.mockResolvedValue(1);
  state.fetchBatch.mockResolvedValue(undefined);
  state.importSources.mockResolvedValue(undefined);
  state.finish.mockResolvedValue(undefined);
  state.plan.mockResolvedValue(2);
  state.writeTopic.mockResolvedValue(undefined);
  state.settle.mockResolvedValue(undefined);
  state.failWorkflowUnscoped.mockResolvedValue(undefined);
  state.reportFailure.mockResolvedValue(undefined);
  state.reportWarning.mockResolvedValue(undefined);
  state.warnings = [];
});

describe("Website import workflow owner lifecycle", () => {
  it.each([
    ["claim", 1],
    ["discovery", 2],
    ["page reads", 3],
    ["page import", 4],
    ["completion", 5],
  ])("releases the active crawl when owner resolution fails before %s", async (_stage, failAt) => {
    state.failTenantAt = Number(failAt);
    await expect(crawlWikiWebsite(payload)).rejects.toBe(state.ownerFailure);
    expect(state.failWorkflowUnscoped).toHaveBeenCalledExactlyOnceWith({
      crawlId: payload.crawlId,
      userId: payload.userId,
      workflowRunId: "run-owner",
    });
    expect(state.reportFailure).toHaveBeenCalledExactlyOnceWith(
      "crawl-wiki-website",
      expect.objectContaining({ message: state.ownerFailure.message }),
      payload.tenant,
    );
    expect(state.tenantCalls).toBe(failAt);
    expect(state.claimWorkflow).toHaveBeenCalledTimes(Number(failAt) > 1 ? 1 : 0);
    expect(state.discover).toHaveBeenCalledTimes(Number(failAt) > 2 ? 1 : 0);
    expect(state.fetchBatch).toHaveBeenCalledTimes(Number(failAt) > 3 ? 1 : 0);
    expect(state.importSources).toHaveBeenCalledTimes(Number(failAt) > 4 ? 1 : 0);
    expect(state.finish).not.toHaveBeenCalled();
  });

  it("reports the original failure and propagates an unexpected cleanup storage failure", async () => {
    const storageFailure = new Error("Database unavailable during cleanup.");
    state.failTenantAt = 1;
    state.failWorkflowUnscoped.mockRejectedValueOnce(storageFailure);
    await expect(crawlWikiWebsite(payload)).rejects.toBe(storageFailure);
    expect(state.reportFailure).toHaveBeenCalledExactlyOnceWith(
      "crawl-wiki-website",
      expect.objectContaining({ message: state.ownerFailure.message }),
      payload.tenant,
    );
    expect(state.claimWorkflow).not.toHaveBeenCalled();
    expect(state.discover).not.toHaveBeenCalled();
    expect(state.fetchBatch).not.toHaveBeenCalled();
    expect(state.importSources).not.toHaveBeenCalled();
    expect(state.finish).not.toHaveBeenCalled();
  });

  it("stops after an empty discovery without reads or synthesis on replay", async () => {
    state.discover.mockResolvedValue(0);
    state.claimWorkflow.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await crawlWikiWebsite(payload);
    await crawlWikiWebsite(payload);
    expect(state.claimWorkflow).toHaveBeenCalledTimes(2);
    expect(state.discover).toHaveBeenCalledOnce();
    expect(state.fetchBatch).not.toHaveBeenCalled();
    expect(state.importSources).not.toHaveBeenCalled();
    expect(state.finish).not.toHaveBeenCalled();
    expect(state.failWorkflowUnscoped).not.toHaveBeenCalled();
    expect(state.reportFailure).not.toHaveBeenCalled();
  });

  it("does no further work when another workflow owns the crawl", async () => {
    state.claimWorkflow.mockResolvedValueOnce(false);
    await crawlWikiWebsite(payload);
    expect(state.claimWorkflow).toHaveBeenCalledExactlyOnceWith(payload.crawlId, "run-owner");
    expect(state.discover).not.toHaveBeenCalled();
    expect(state.failWorkflowUnscoped).not.toHaveBeenCalled();
    expect(state.reportFailure).not.toHaveBeenCalled();
  });

  it("reports content-free model warnings from planning and page steps", async () => {
    state.warnings = [["Website import model call failed: GatewayRateLimitError HTTP 429."], [], ["review unanswered"]];
    await crawlWikiWebsite(payload);
    expect(state.reportWarning.mock.calls.map(([, message]) => message)).toEqual([
      "Website import model call failed: GatewayRateLimitError HTTP 429.",
      "review unanswered",
    ]);
  });

  it("keeps all authorized work tenant-scoped, imports after every read batch, then writes each planned page", async () => {
    state.discover.mockResolvedValueOnce(2);
    await crawlWikiWebsite(payload);
    expect(state.tenantCalls).toBe(10);
    expect(state.writeTopic).toHaveBeenNthCalledWith(1, payload.crawlId, 0);
    expect(state.writeTopic).toHaveBeenNthCalledWith(2, payload.crawlId, 1);
    expect(state.finish.mock.invocationCallOrder[0]).toBeLessThan(state.plan.mock.invocationCallOrder[0]);
    expect(state.writeTopic.mock.invocationCallOrder[1]).toBeLessThan(state.settle.mock.invocationCallOrder[0]);
    expect(state.fetchBatch).toHaveBeenNthCalledWith(1, payload.crawlId, 0);
    expect(state.fetchBatch).toHaveBeenNthCalledWith(2, payload.crawlId, 1);
    expect(state.fetchBatch.mock.invocationCallOrder[1]).toBeLessThan(state.importSources.mock.invocationCallOrder[0]);
    expect(state.importSources.mock.invocationCallOrder[0]).toBeLessThan(state.finish.mock.invocationCallOrder[0]);
    expect(state.failWorkflowUnscoped).not.toHaveBeenCalled();
    expect(state.reportFailure).not.toHaveBeenCalled();
  });
});
