import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" } }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import type { WorkspaceSetupPatch, WorkspaceSetupRecord } from "../workspace-setup.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes } from "@/core/validation/validation.utils";

import {
  StoredSetupCreatedSchema,
  StoredSetupInterviewSchema,
  StoredSetupResultsSchema,
} from "../workspace-setup.schema";
import { UseStandardWorkspaceSetupInteractor } from "../use-standard-workspace-setup.interactor";
import { canUseStandardSetup } from "../workspace-setup-status";

const owner = createMockUser();
const SETUP_ID = "00000000-0000-4000-8000-000000000001";
const phase = (status: "pending" | "running" | "completed") => ({
  status,
  error: null,
  attempts: status === "pending" ? 0 : 1,
  claimedAt: status === "running" ? new Date().toISOString() : null,
  startedAt: null,
  finishedAt: null,
});

function record(overrides: Partial<WorkspaceSetupRecord>): WorkspaceSetupRecord {
  return {
    id: SETUP_ID,
    userId: owner.id,
    status: "planned",
    websiteUrl: null,
    crawlId: "crawl-1",
    answers: {},
    interview: StoredSetupInterviewSchema.parse({ plan: "running" }),
    plan: null,
    planRevision: 1,
    phases: {},
    artifacts: {},
    created: StoredSetupCreatedSchema.parse({}),
    results: StoredSetupResultsSchema.parse({}),
    spreadsheetName: null,
    hasSpreadsheet: false,
    workflowRunId: null,
    startedAt: new Date(),
    confirmedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function harness(initial: WorkspaceSetupRecord) {
  let current = initial;
  const calls: string[] = [];
  const repo = {
    get: vi.fn(() => Promise.resolve(current)),
    mutate: vi.fn((_id: string, change: (setup: WorkspaceSetupRecord) => WorkspaceSetupPatch | null) => {
      calls.push("mutate");
      const patch = change(current);
      if (patch) current = { ...current, ...patch };
      return Promise.resolve({ setup: current, changed: patch !== null });
    }),
    stopCrawl: vi.fn(() => {
      calls.push("stopCrawl");
      return Promise.resolve();
    }),
    knowledgeBasePages: vi.fn(() => Promise.resolve([{ id: "page-1", title: "About", updatedAt: new Date() }])),
  };
  const interactor = new UseStandardWorkspaceSetupInteractor(repo as never);
  return {
    repo,
    calls,
    current: () => current,
    invoke: () => runWithTenant(owner, () => interactor.invoke({ setupId: SETUP_ID })),
  };
}

describe("standard setup", () => {
  it("is offered until the data model is applied", () => {
    expect(canUseStandardSetup(record({}))).toBe(true);
    expect(canUseStandardSetup(record({ status: "building", phases: { dataModel: phase("pending") } }))).toBe(true);
    expect(canUseStandardSetup(record({ status: "building", phases: { dataModel: phase("running") } }))).toBe(false);
    expect(canUseStandardSetup(record({ status: "failed", phases: { dataModel: phase("completed") } }))).toBe(false);
    expect(canUseStandardSetup(record({ status: "completed" }))).toBe(false);
  });

  it("completes the setup as standard first, then stops its import and keeps the pages written", async () => {
    const setup = harness(
      record({ status: "building", phases: { knowledgeBase: phase("running"), dataModel: phase("pending") } }),
    );
    expect(await setup.invoke()).toEqual({ ok: true, data: { setupId: SETUP_ID } });
    expect(setup.calls).toEqual(["mutate", "stopCrawl", "mutate"]);
    expect(setup.current()).toMatchObject({
      status: "completed",
      interview: { plan: "idle", planClaimedAt: null },
      phases: { knowledgeBase: { status: "stopped", claimedAt: null }, dataModel: { status: "stopped" } },
      created: { pages: ["page-1"] },
      results: { standard: true, pages: [{ id: "page-1", title: "About" }] },
    });
    expect(await setup.invoke()).toEqual({ ok: true, data: { setupId: SETUP_ID } });
    expect(setup.repo.stopCrawl).toHaveBeenCalledOnce();
  });

  it("refuses once the data model is being applied and changes nothing", async () => {
    const setup = harness(record({ status: "building", phases: { dataModel: phase("running") } }));
    const result = await setup.invoke();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceSetupConflict]);
    expect(setup.repo.mutate).not.toHaveBeenCalled();
    expect(setup.repo.stopCrawl).not.toHaveBeenCalled();
  });
});
