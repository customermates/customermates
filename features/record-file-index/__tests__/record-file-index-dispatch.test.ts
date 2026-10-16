import type { RecordFileIndexRepo } from "../record-file-index.repo";

import { describe, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { BackgroundRecordFileIndexDispatcher } from "../background-record-file-index-dispatcher";
import { SweepRecordFileIndexInteractor } from "../sweep-record-file-index.interactor";

describe("record file index dispatch", () => {
  it("starts one indexing workflow for the workspace of newly attached files", async () => {
    const dispatch = vi.fn(() => Promise.resolve());
    const dispatcher = new BackgroundRecordFileIndexDispatcher({ dispatch });

    await dispatcher.dispatch({ companyId: "company-1", fileIds: ["file-1", "file-2"] });
    await dispatcher.dispatch({ companyId: "company-1", fileIds: [] });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("index-record-files", { companyId: "company-1" });
  });

  it("never fails the attach when the workflow cannot start, so the recovery sweep picks the file up", async () => {
    const dispatcher = new BackgroundRecordFileIndexDispatcher({
      dispatch: () => Promise.reject(new Error("queue down")),
    });

    await expect(dispatcher.dispatch({ companyId: "company-1", fileIds: ["file-1"] })).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

describe("record file index recovery sweep", () => {
  function sweep(companies: string[], dispatch: (id: string, payload: unknown) => Promise<void>) {
    const files = { companiesWithStalledFilesUnscoped: vi.fn(() => Promise.resolve(companies)) };
    return {
      files,
      interactor: new SweepRecordFileIndexInteractor(files as unknown as RecordFileIndexRepo, { dispatch }),
    };
  }

  it("restarts indexing for workspaces whose attached files have waited for ten minutes", async () => {
    const dispatch = vi.fn(() => Promise.resolve());
    const { files, interactor } = sweep(["company-1", "company-2"], dispatch);
    const before = Date.now();

    await expect(interactor.invoke()).resolves.toEqual({ fileIndexWorkspaces: 2 });
    const after = Date.now();
    const [pendingBefore, limit] = files.companiesWithStalledFilesUnscoped.mock.calls[0] as unknown as [Date, number];
    expect(pendingBefore.getTime()).toBeGreaterThanOrEqual(before - 10 * 60_000);
    expect(pendingBefore.getTime()).toBeLessThanOrEqual(after - 10 * 60_000);
    expect(limit).toBe(50);
    expect(dispatch.mock.calls).toEqual([
      ["index-record-files", { companyId: "company-1" }],
      ["index-record-files", { companyId: "company-2" }],
    ]);
  });

  it("fails loudly when a workflow could not be started so the next sweep retries", async () => {
    const { interactor } = sweep(["company-1"], () => Promise.reject(new Error("queue down")));
    await expect(interactor.invoke()).rejects.toThrow("next sweep will retry");
  });
});
