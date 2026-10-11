import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import type { SetupCrawlState } from "../workspace-setup.repo";
import type { WorkspaceSetupPatch, WorkspaceSetupRecord } from "../workspace-setup.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { agencyPlan } from "@/features/workspace-setup/__tests__/setup-plan-fixtures";
import { SETUP_COMPANY_ID, workspacePreset } from "@/features/workspace-setup/__tests__/setup-harness";
import { createMockUser } from "@/tests/helpers/mock-user";

import {
  StoredSetupCreatedSchema,
  StoredSetupInterviewSchema,
  StoredSetupResultsSchema,
} from "../workspace-setup.schema";
import { WorkspaceSetupInterviewService } from "../workspace-setup-interview.service";
import { planToWire } from "./setup-wire-fixtures";

const owner = createMockUser({ companyId: SETUP_COMPANY_ID });
const blank = { choice: null, choices: [], custom: [], items: [], min: null, max: null, text: null };

function harness(overrides: Partial<WorkspaceSetupRecord> = {}, crawl: Partial<SetupCrawlState> = {}) {
  let setup: WorkspaceSetupRecord = {
    id: "setup-1",
    userId: owner.id,
    status: "interview",
    websiteUrl: "https://studio.example/",
    crawlId: "crawl-1",
    answers: {},
    interview: StoredSetupInterviewSchema.parse({}),
    plan: null,
    planRevision: 0,
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
  const repo = {
    get: vi.fn(() => Promise.resolve(setup)),
    mutate: vi.fn((_id: string, change: (current: WorkspaceSetupRecord) => WorkspaceSetupPatch | null) => {
      const patch = change(setup);
      if (patch) setup = { ...setup, ...patch } as WorkspaceSetupRecord;
      return Promise.resolve({ setup, changed: Boolean(patch) });
    }),
    crawlState: vi.fn(() =>
      Promise.resolve({
        status: "synthesizing",
        failureReason: null,
        homepageUrl: "https://studio.example/",
        registrableDomain: "studio.example",
        topics: [],
        ...crawl,
      }),
    ),
    crawlSources: vi.fn(() =>
      Promise.resolve([{ url: "https://studio.example/", title: "Studio", text: "We design websites in Berlin." }]),
    ),
    readSpreadsheet: vi.fn(() => Promise.resolve(null)),
  };
  const models = { generate: vi.fn(), drainWarnings: () => [] };
  const records = { getModel: vi.fn(() => workspacePreset()) };
  const preview = { invoke: vi.fn(() => Promise.resolve({ ok: true, data: { valid: true, issues: [] } })) };
  const service = new WorkspaceSetupInterviewService(
    repo as never,
    models as never,
    records as never,
    preview as never,
  );
  const run = <T>(fn: () => Promise<T>) => runWithTenant(owner, fn);
  return { service, repo, models, preview, run, setup: () => setup };
}

describe("workspace setup interview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("waits while the website is still being read, then pre-fills without touching the owner's answers", async () => {
    const { service, models, run, setup, repo } = harness({
      answers: { companyName: { source: "user", confidence: 1, value: { format: "shortText", value: "Mine" } } },
    });
    repo.crawlState.mockResolvedValueOnce({ ...(await repo.crawlState()), status: "fetching" });
    expect(await run(() => service.prefill("setup-1", false))).toBe("wait");
    expect(models.generate).not.toHaveBeenCalled();

    models.generate.mockResolvedValue({
      ok: true,
      value: {
        answers: [
          { ...blank, part: "companyName", confidence: 0.99, text: "Studio Example" },
          { ...blank, part: "customerKind", confidence: 0.9, choice: "businesses" },
          { ...blank, part: "industries", confidence: 0.4, choices: [], custom: [] },
        ],
      },
    });
    expect(await run(() => service.prefill("setup-1", false))).toBe("done");
    expect(models.generate.mock.calls[0][0]).toMatchObject({ purpose: "setupDrafting" });
    expect(models.generate.mock.calls[0][0].prompt).toContain("<<<UNTRUSTED_RECORD_TEXT>>>\n# Studio");
    expect(setup().interview.prefill).toBe("completed");
    expect(setup().answers.companyName?.value).toEqual({ format: "shortText", value: "Mine" });
    expect(setup().answers.customerKind).toMatchObject({ source: "website", confidence: 0.9 });
    expect(await run(() => service.prefill("setup-1", false))).toBe("done");
    expect(models.generate).toHaveBeenCalledTimes(1);
  });

  it("returns to the interview with at most three follow-up questions", async () => {
    const { service, models, run, setup } = harness({ status: "planning" });
    models.generate.mockResolvedValue({
      ok: true,
      value: {
        questions: [
          {
            label: "Do renewals run monthly or yearly?",
            format: "singleChoice",
            options: [
              { id: "monthly", label: "Monthly" },
              { id: "yearly", label: "Yearly" },
            ],
            allowCustom: false,
            winChance: false,
            maxItems: null,
            maxPicks: null,
            suggestions: [],
            unit: null,
            single: false,
            min: null,
            max: null,
            maxLength: null,
          },
        ],
      },
    });
    expect(await run(() => service.followUps("setup-1"))).toBe("asked");
    expect(models.generate.mock.calls[0][0]).toMatchObject({ purpose: "setupPlanning" });
    expect(setup().status).toBe("interview");
    expect(setup().interview.followUpQuestions.map((question) => question.id)).toEqual(["followUp1"]);
    expect(await run(() => service.followUps("setup-1"))).toBe("skip");
  });

  it("repairs a rejected plan once with the issues, then stores the valid plan", async () => {
    const { service, models, run, setup } = harness({
      status: "planning",
      planRevision: 1,
      interview: StoredSetupInterviewSchema.parse({ plan: "queued", followUps: "completed" }),
    });
    const invalid = planToWire(agencyPlan);
    invalid.listDefaults[0].list = "nowhere";
    models.generate
      .mockResolvedValueOnce({ ok: true, value: invalid })
      .mockResolvedValueOnce({ ok: true, value: planToWire(agencyPlan) });
    await run(() => service.plan("setup-1"));
    expect(models.generate).toHaveBeenCalledTimes(2);
    expect(models.generate.mock.calls[1][0].prompt).toContain("listDefaults.0.list");
    expect(setup().status).toBe("planned");
    expect(setup().plan?.recordModel.lists[0].key).toBe("project");
    expect(setup().interview).toMatchObject({ plan: "completed", planError: null });
  });

  it("gives up as an invalid plan after the repair and leaves the owner in the interview", async () => {
    const { service, models, run, setup, preview } = harness({
      status: "planning",
      planRevision: 1,
      interview: StoredSetupInterviewSchema.parse({ plan: "queued", followUps: "completed" }),
    });
    preview.invoke.mockResolvedValue({ ok: true, data: { valid: false, issues: [{ code: "cycle" }] } } as never);
    models.generate.mockResolvedValue({ ok: true, value: planToWire(agencyPlan) });
    await run(() => service.plan("setup-1"));
    expect(models.generate).toHaveBeenCalledTimes(2);
    expect(setup()).toMatchObject({ status: "interview", plan: null });
    expect(setup().interview).toMatchObject({ plan: "failed", planError: "invalidPlan" });
  });

  it("stops planning at the spend cap without a repair call", async () => {
    const { service, models, run, setup } = harness({
      status: "planning",
      planRevision: 1,
      interview: StoredSetupInterviewSchema.parse({ plan: "queued", followUps: "completed" }),
    });
    models.generate.mockResolvedValue({ ok: false, failure: "spendCap" });
    await run(() => service.plan("setup-1"));
    expect(models.generate).toHaveBeenCalledTimes(1);
    expect(setup().interview).toMatchObject({ plan: "failed", planError: "spendCap" });
  });
});
