import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import type { SetupCrawlState } from "../workspace-setup.repo";
import type { WorkspaceSetupPatch, WorkspaceSetupRecord } from "../workspace-setup.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { agencyPlan } from "@/features/workspace-setup/__tests__/setup-plan-fixtures";
import { SETUP_COMPANY_ID } from "@/features/workspace-setup/__tests__/setup-harness";
import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";
import { createMockUser } from "@/tests/helpers/mock-user";

import {
  StoredSetupCreatedSchema,
  StoredSetupInterviewSchema,
  StoredSetupResultsSchema,
} from "../workspace-setup.schema";
import { WorkspaceSetupInterviewService } from "../workspace-setup-interview.service";

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
      Promise.resolve([
        { url: "https://studio.example/privacy", title: "Privacy", text: "We store cookies.", category: "policy" },
        { url: "https://studio.example/", title: "Studio", text: "We design websites in Berlin.", category: "about" },
      ]),
    ),
    readSpreadsheet: vi.fn(() => Promise.resolve(null)),
  };
  const models = { generate: vi.fn(), drainWarnings: () => [] };
  const planner = { plan: vi.fn() };
  const service = new WorkspaceSetupInterviewService(repo as never, models as never, planner as never);
  const run = <T>(fn: () => Promise<T>) => runWithTenant(owner, fn);
  return { service, repo, models, planner, run, setup: () => setup };
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

  it("reads the pricing and product pages before help and policy pages, and retries a malformed draft once", async () => {
    const { service, models, run, setup } = harness();
    models.generate
      .mockResolvedValueOnce({
        ok: false,
        failure: "generation",
        rejection: "answers: expected array, received string.",
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          answers: [
            { ...blank, part: "industries", confidence: 0.8, choices: ["Fashion brands"] },
            { ...blank, part: "companyName", confidence: 0.95, text: "Studio Example" },
          ],
        },
      });
    expect(await run(() => service.prefill("setup-1", false))).toBe("done");
    const [first, second] = models.generate.mock.calls.map(([call]) => (call as { prompt: string }).prompt);
    expect(first.indexOf("# Studio")).toBeLessThan(first.indexOf("# Privacy"));
    expect(first).toContain('"prefill":"suggested"');
    expect(second).toContain("answers: expected array, received string.");
    expect(setup().interview.prefill).toBe("completed");
    expect(setup().answers.industries?.value).toEqual({
      format: "multipleChoice",
      values: [],
      custom: ["Fashion brands"],
    });
  });

  it("stores the planner's plan with the setup's answers, language, currency and website", async () => {
    const { service, planner, run, setup } = harness({
      status: "planning",
      planRevision: 1,
      answers: {
        language: { source: "user", confidence: 1, value: { format: "singleChoice", value: "en" } },
        currency: { source: "user", confidence: 1, value: { format: "singleChoice", value: "CHF" } },
      },
      interview: StoredSetupInterviewSchema.parse({ plan: "queued", followUps: "completed" }),
    });
    const plan = SetupPlanSchema.parse(agencyPlan);
    planner.plan.mockResolvedValue({ ok: true, plan });
    await run(() => service.plan("setup-1"));
    expect(planner.plan).toHaveBeenCalledWith(
      expect.objectContaining({
        setupId: "setup-1",
        language: "en",
        currency: "CHF",
        sources: expect.arrayContaining([expect.objectContaining({ category: "about" })]),
      }),
    );
    expect(setup()).toMatchObject({ status: "planned", plan });
    expect(setup().interview).toMatchObject({ plan: "completed", planError: null });
  });

  it("returns the owner to the interview with the planner's failure", async () => {
    const { service, planner, run, setup } = harness({
      status: "planning",
      planRevision: 1,
      interview: StoredSetupInterviewSchema.parse({ plan: "queued", followUps: "completed" }),
    });
    planner.plan.mockResolvedValue({ ok: false, failure: "invalidPlan" });
    await run(() => service.plan("setup-1"));
    expect(setup()).toMatchObject({ status: "interview", plan: null });
    expect(setup().interview).toMatchObject({ plan: "failed", planError: "invalidPlan" });
  });
});
