import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ appMode: "cloud" }));
vi.mock("@/env", () => ({
  env: {
    get APP_MODE() {
      return state.appMode;
    },
  },
}));

import { isTenantGuardBypassed, runWithTenant } from "@/core/decorators/tenant-context";
import { DemoModeError } from "@/core/errors/app-errors";
import { createMockUser } from "@/tests/helpers/mock-user";
import { FailWikiWebsiteCrawlInteractor } from "../fail-wiki-website-crawl.interactor";

const input = {
  crawlId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  workflowRunId: "run-owner",
};

beforeEach(() => {
  state.appMode = "cloud";
});

describe("FailWikiWebsiteCrawlInteractor", () => {
  it("enters system cleanup without resolving an active user and retains immutable identities", async () => {
    const failWorkflowUnscoped = vi.fn(() => {
      expect(isTenantGuardBypassed()).toBe(true);
      return Promise.resolve();
    });
    const interactor = new FailWikiWebsiteCrawlInteractor({ failWorkflowUnscoped });
    await interactor.invoke(input);
    await runWithTenant(createMockUser(), async () => {
      await interactor.invoke(input);
    });
    expect(failWorkflowUnscoped).toHaveBeenNthCalledWith(1, input);
    expect(failWorkflowUnscoped).toHaveBeenNthCalledWith(2, input);
    expect(failWorkflowUnscoped).toHaveBeenCalledTimes(2);
  });

  it.each([
    { ...input, crawlId: "invalid" },
    { ...input, userId: "invalid" },
    { ...input, workflowRunId: "" },
  ])("rejects invalid cleanup identity before storage", async (invalid) => {
    const failWorkflowUnscoped = vi.fn();
    const interactor = new FailWikiWebsiteCrawlInteractor({ failWorkflowUnscoped });
    await expect(async () => interactor.invoke(invalid)).rejects.toThrow();
    expect(failWorkflowUnscoped).not.toHaveBeenCalled();
  });

  it("propagates storage failure instead of swallowing failed cleanup", async () => {
    const failure = new Error("Cleanup storage unavailable.");
    const failWorkflowUnscoped = vi.fn().mockRejectedValue(failure);
    await expect(new FailWikiWebsiteCrawlInteractor({ failWorkflowUnscoped }).invoke(input)).rejects.toBe(failure);
    expect(failWorkflowUnscoped).toHaveBeenCalledExactlyOnceWith(input);
  });

  it("retains the standard demo restriction", async () => {
    state.appMode = "demo";
    const failWorkflowUnscoped = vi.fn();
    const interactor = new FailWikiWebsiteCrawlInteractor({ failWorkflowUnscoped });
    await expect(async () => interactor.invoke(input)).rejects.toBeInstanceOf(DemoModeError);
    expect(failWorkflowUnscoped).not.toHaveBeenCalled();
  });
});
