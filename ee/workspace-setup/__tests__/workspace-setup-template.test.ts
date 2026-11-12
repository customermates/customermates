import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { SetupPlanInput } from "../workspace-setup-planner";
import type { WorkspaceSetupPatch, WorkspaceSetupRecord } from "../workspace-setup.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { TEMPLATE_SLUGS, getTemplateText, hasTemplateText } from "@/core/templates/template-registry";
import { templateSetupPlan } from "@/core/templates/template-setup-plan";
import { APP_LOCALES } from "@/i18n/locale-registry";
import { agencyPlan } from "@/features/workspace-setup/__tests__/setup-plan-fixtures";
import {
  SETUP_COMPANY_ID,
  emptyWorkspaceModel,
  prepareConfiguration,
} from "@/features/workspace-setup/__tests__/setup-harness";
import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";
import { createMockUser } from "@/tests/helpers/mock-user";

import {
  StoredSetupCreatedSchema,
  StoredSetupInterviewSchema,
  StoredSetupResultsSchema,
} from "../workspace-setup.schema";
import { StartWorkspaceSetupSchema } from "../workspace-setup-input.schema";
import { WorkspaceSetupInterviewService } from "../workspace-setup-interview.service";
import { WorkspaceSetupPlanner, emptySetupPlanPart } from "../workspace-setup-planner";

const owner = createMockUser({ companyId: SETUP_COMPANY_ID });

const input: SetupPlanInput = {
  setupId: "0f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f70",
  language: "en",
  answersLanguage: null,
  currency: "EUR",
  answers: { companyName: { source: "user", confidence: 1, value: { format: "shortText", value: "Studio" } } },
  followUps: [],
  sources: [],
  website: false,
  sheet: null,
  templateSlug: "sales-pipeline",
};

function planner() {
  const models = { generate: vi.fn() };
  const preview = { invoke: vi.fn(() => Promise.resolve({ ok: true, data: { valid: true, issues: [] } })) };
  const instance = new WorkspaceSetupPlanner(
    models as never,
    { getModel: () => Promise.resolve(emptyWorkspaceModel()) } as never,
    preview as never,
    {
      prepare: (change: ConfigurationChange, model: RecordModel) => prepareConfiguration(change, model),
    } as never,
    { load: () => Promise.resolve({}) } as never,
  );
  return { instance, models, run: <T>(fn: () => Promise<T>) => runWithTenant(owner, fn) };
}

describe("template plans in the Mate planner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns no outcome without a template, so the model plans as before", async () => {
    const { instance, run } = planner();
    expect(await run(() => instance.fromTemplate({ ...input, templateSlug: null }))).toBeNull();
    expect(await run(() => instance.fromTemplate({ ...input, templateSlug: undefined }))).toBeNull();
    expect(await run(() => instance.fromTemplate({ ...input, templateSlug: "not-a-template" }))).toBeNull();
  });

  it("validates the compiled plan of the chosen template in the language and currency of the setup", async () => {
    const { instance, models, run } = planner();
    const outcome = await run(() => instance.fromTemplate({ ...input, language: "de", currency: "CHF" }));
    expect(outcome?.ok).toBe(true);
    if (!outcome?.ok) return;
    expect(outcome.plan.workspace.currency).toBe("CHF");
    expect(outcome.plan.recordModel.lists.map((list) => list.label)).toContain("Verkaufschance");
    expect(SetupPlanSchema.safeParse(outcome.plan).success).toBe(true);
    expect(models.generate).not.toHaveBeenCalled();
  });

  it("passes the planner validation for every template in every locale that has text", async () => {
    const { instance, run } = planner();
    const failures: string[] = [];
    for (const slug of TEMPLATE_SLUGS) {
      for (const language of APP_LOCALES) {
        if (!hasTemplateText(slug, language)) continue;
        const outcome = await run(() => instance.fromTemplate({ ...input, templateSlug: slug, language }));
        if (!outcome?.ok) failures.push(`${slug} ${language}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("fails the validation instead of building when the workspace model rejects the plan", async () => {
    const { instance, run } = planner();
    vi.spyOn(instance, "issues").mockResolvedValue([{ path: "recordModel", message: "conflict" }]);
    expect(await run(() => instance.fromTemplate(input))).toEqual({ ok: false, failure: "invalidPlan" });
  });

  it("gives the model the plan of the chosen template as the reference instead of the closest solution", async () => {
    const { instance, models, run } = planner();
    models.generate.mockResolvedValue({ ok: false, failure: "generation", rejection: "stop" });
    const chosen = {
      ...input,
      answers: { ...input.answers, workWith: workWith("clients") },
      templateSlug: "client-tracker",
    };
    await run(() => instance.attempt("model", chosen, emptySetupPlanPart(1), { model: null, knowledge: null }));
    const prompt = String(models.generate.mock.calls[0][0].prompt);
    expect(prompt).toContain("Reference template: ");
    expect(prompt).toContain(getTemplateText("client-tracker", "en").lists.clients.pluralLabel);
    expect(prompt).not.toContain("Freelancers");
  });

  it("keeps the closest solution as the reference when no template was chosen", async () => {
    const { instance, models, run } = planner();
    models.generate.mockResolvedValue({ ok: false, failure: "generation", rejection: "stop" });
    const plain = { ...input, answers: { ...input.answers, workWith: workWith("clients") }, templateSlug: null };
    await run(() => instance.attempt("model", plain, emptySetupPlanPart(1), { model: null, knowledge: null }));
    expect(String(models.generate.mock.calls[0][0].prompt)).toContain("Reference template: ");
  });
});

function workWith(value: string) {
  return { source: "user" as const, confidence: 1, value: { format: "singleChoice" as const, value } };
}

function harness(overrides: Partial<WorkspaceSetupRecord> = {}) {
  let setup: WorkspaceSetupRecord = {
    id: "setup-1",
    userId: owner.id,
    status: "planning",
    websiteUrl: null,
    crawlId: null,
    answers: {},
    interview: StoredSetupInterviewSchema.parse({ plan: "queued", templateSlug: "sales-pipeline" }),
    plan: null,
    planRevision: 1,
    phases: {},
    artifacts: {},
    created: StoredSetupCreatedSchema.parse({}),
    results: StoredSetupResultsSchema.parse({}),
    spreadsheetName: null,
    hasSpreadsheet: false,
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
    crawlSources: vi.fn(() => Promise.resolve([])),
    readSpreadsheet: vi.fn(() => Promise.resolve(null)),
  };
  const models = { generate: vi.fn(), drainWarnings: () => [] };
  const mate = { attempt: vi.fn(), assemble: vi.fn(), fromTemplate: vi.fn() };
  const service = new WorkspaceSetupInterviewService(repo as never, models as never, mate as never);
  return { service, models, mate, setup: () => setup, run: <T>(fn: () => Promise<T>) => runWithTenant(owner, fn) };
}

describe("template plans in the Mate setup steps", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks no follow-up questions and drafts nothing with the model when the template validates", async () => {
    const { service, models, mate, run, setup } = harness();
    const plan = SetupPlanSchema.parse(agencyPlan);
    mate.fromTemplate.mockResolvedValue({ ok: true, plan });
    expect(await run(() => service.followUps("setup-1"))).toBe("none");
    expect(setup().interview.followUps).toBe("skipped");
    await run(() => service.claimPlan("setup-1"));
    for (const part of ["model", "knowledge", "views"] as const)
      expect(await run(() => service.planPart("setup-1", 1, part))).toBe("done");
    expect(mate.attempt).not.toHaveBeenCalled();
    expect(models.generate).not.toHaveBeenCalled();
    expect(await run(() => service.finishPlan("setup-1", 1, false))).toBe("planned");
    expect(mate.assemble).not.toHaveBeenCalled();
    expect(setup()).toMatchObject({ status: "planned", plan });
    expect(mate.fromTemplate).toHaveBeenCalledWith(expect.objectContaining({ templateSlug: "sales-pipeline" }));
  });

  it("falls back to the model when the template plan does not validate in this workspace", async () => {
    const { service, mate, run } = harness();
    mate.fromTemplate.mockResolvedValue({ ok: false, failure: "invalidPlan" });
    mate.attempt.mockImplementation((_part: string, _input: unknown, state: object) =>
      Promise.resolve({ ...state, attempts: 1, value: { drafted: true }, repair: [], failure: null }),
    );
    await run(() => service.claimPlan("setup-1"));
    expect(await run(() => service.planPart("setup-1", 1, "model"))).toBe("done");
    expect(mate.attempt).toHaveBeenCalledTimes(1);
    expect(mate.attempt.mock.calls[0][1]).toMatchObject({ templateSlug: "sales-pipeline" });
  });

  it("does not ask the planner for a template when the setup has none", async () => {
    const { service, mate, run } = harness({ interview: StoredSetupInterviewSchema.parse({ plan: "queued" }) });
    mate.attempt.mockImplementation((_part: string, _input: unknown, state: object) =>
      Promise.resolve({ ...state, attempts: 1, value: { drafted: true }, repair: [], failure: null }),
    );
    await run(() => service.claimPlan("setup-1"));
    await run(() => service.planPart("setup-1", 1, "model"));
    expect(mate.fromTemplate).not.toHaveBeenCalled();
    expect(mate.attempt.mock.calls[0][1]).toMatchObject({ templateSlug: null });
  });
});

describe("starting a Mate setup with a template", () => {
  it("accepts a known template slug and rejects an unknown one", () => {
    expect(StartWorkspaceSetupSchema.safeParse({ websiteUrl: null, templateSlug: "client-tracker" }).success).toBe(
      true,
    );
    expect(StartWorkspaceSetupSchema.safeParse({ websiteUrl: null }).success).toBe(true);
    expect(StartWorkspaceSetupSchema.safeParse({ websiteUrl: null, templateSlug: "nope" }).success).toBe(false);
  });

  it("compiles the plan with the currency of the setup and refuses an unknown slug", () => {
    expect(templateSetupPlan("client-tracker", { language: "en", currency: "USD" })?.workspace.currency).toBe("USD");
    expect(templateSetupPlan("nope", { language: "en", currency: "USD" })).toBeNull();
  });
});
