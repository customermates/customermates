import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { SetupPlanInput, SetupPlanOutcome, SetupPlanPart, SetupPlanPartState } from "../workspace-setup-planner";
import type { PlanKnowledgeWire, PlanModelWire, PlanViewsWire } from "../workspace-setup-wire";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { agencyPlan } from "@/features/workspace-setup/__tests__/setup-plan-fixtures";
import {
  SETUP_COMPANY_ID,
  emptyWorkspaceModel,
  prepareConfiguration,
} from "@/features/workspace-setup/__tests__/setup-harness";
import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";
import { createMockUser } from "@/tests/helpers/mock-user";

import { SETUP_REPAIR_INSTRUCTION } from "../workspace-setup-prompts";
import { SETUP_PLAN_PART_ATTEMPTS, WorkspaceSetupPlanner, emptySetupPlanPart } from "../workspace-setup-planner";
import { PLAN_PART_LABELS, planPartFor, planToWireParts } from "./setup-wire-fixtures";

const owner = createMockUser({ companyId: SETUP_COMPANY_ID });

const input: SetupPlanInput = {
  setupId: "0f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f70",
  language: "en",
  answersLanguage: null,
  currency: "EUR",
  answers: { companyName: { source: "user", confidence: 1, value: { format: "shortText", value: "Studio" } } },
  followUps: [],
  sources: [{ url: "https://studio.example/", title: "Studio", text: "We design websites.", category: "about" }],
  website: true,
  sheet: null,
};

type Call = { label: string; purpose: string; prompt: string };

function harness() {
  const models = { generate: vi.fn() };
  const preview = { invoke: vi.fn(() => Promise.resolve({ ok: true, data: { valid: true, issues: [] } })) };
  const planner = new WorkspaceSetupPlanner(
    models as never,
    { getModel: () => Promise.resolve(emptyWorkspaceModel()) } as never,
    preview as never,
    {
      prepare: (change: ConfigurationChange, model: RecordModel) => prepareConfiguration(change, model),
    } as never,
    { load: () => Promise.resolve({}) } as never,
  );
  const answer = (overrides: Partial<Record<string, unknown>> = {}) =>
    models.generate.mockImplementation((call: Call) =>
      Promise.resolve({ ok: true, value: overrides[call.label] ?? planPartFor(call.label, agencyPlan) }),
    );
  const calls = () => models.generate.mock.calls.map(([call]) => call as Call);
  const plan = (planInput: SetupPlanInput = input) =>
    runWithTenant(owner, async (): Promise<SetupPlanOutcome> => {
      const states: Record<SetupPlanPart, SetupPlanPartState> = {
        model: emptySetupPlanPart(1),
        knowledge: emptySetupPlanPart(1),
        views: emptySetupPlanPart(1),
      };
      const value = (part: SetupPlanPart) => states[part].value ?? null;
      const drafts = () => ({
        model: value("model") as PlanModelWire | null,
        knowledge: value("knowledge") as PlanKnowledgeWire | null,
      });
      const run = async (part: SetupPlanPart) => {
        while (value(part) === null && !states[part].failure)
          states[part] = await planner.attempt(part, planInput, states[part], drafts());
      };
      await run("model");
      await run("knowledge");
      if (value("model")) await run("views");
      const failures = Object.values(states).flatMap((state) => state.failure ?? []);
      if (!value("model") || !value("knowledge") || !value("views"))
        return { ok: false, failure: failures.includes("spendCap") ? "spendCap" : (failures[0] ?? "generation") };
      return planner.assemble(planInput, {
        model: value("model") as PlanModelWire,
        knowledge: value("knowledge") as PlanKnowledgeWire,
        views: value("views") as PlanViewsWire,
      });
    });
  return { models, preview, answer, calls, plan, planner };
}

describe("workspace setup planner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("plans the record model and the Knowledge Base outlines, then views against the planned model", async () => {
    const { answer, calls, plan } = harness();
    answer();
    expect(await plan()).toEqual({ ok: true, plan: SetupPlanSchema.parse(agencyPlan) });
    expect(calls().map(({ label, purpose }) => [label, purpose])).toEqual([
      [PLAN_PART_LABELS.model, "setupPlanning"],
      [PLAN_PART_LABELS.knowledge, "setupDrafting"],
      [PLAN_PART_LABELS.views, "setupPlanning"],
    ]);
    const views = calls()[2].prompt;
    expect(views).toContain('Planned record model: {"currency":"EUR"');
    expect(views).toContain('"key":"project"');
    expect(views).toContain(
      'Automatic fields: ["contact.name","organization.name","deal.name","service.name","task.name","project.name","contact.channels","contact.avatar","deal.value","service.price"]',
    );
    expect(calls()[0].prompt).toContain("Workspace language: English (en).");
    expect(calls()[0].prompt).not.toContain("Answers drafted from the website");
  });

  it("plans no Knowledge Base pages without a website and spends no model call on them", async () => {
    const { answer, calls, plan } = harness();
    answer();
    const planned = await plan({ ...input, sources: [], website: false });
    expect(planned.ok && planned.plan.knowledgeBase.pages).toEqual([]);
    expect(calls().map(({ label }) => label)).toEqual([PLAN_PART_LABELS.model, PLAN_PART_LABELS.views]);
  });

  it("names the website language when the answers were drafted in another language", async () => {
    const { answer, calls, plan } = harness();
    answer();
    await plan({ ...input, answersLanguage: "de" });
    for (const call of calls())
      expect(call.prompt).toContain("Answers drafted from the website are written in German (de).");
  });

  it("stores the attempt so a later step can repair a part that came back as JSON text", async () => {
    const { models, calls, planner } = harness();
    models.generate.mockResolvedValueOnce({
      ok: false,
      failure: "generation",
      rejection: "The answer did not match the required structure: lists: expected array, received string.",
    });
    const first = await runWithTenant(owner, () =>
      planner.attempt("model", input, emptySetupPlanPart(4), { model: null, knowledge: null }),
    );
    expect(first).toMatchObject({ revision: 4, attempts: 1, value: null, failure: null });
    models.generate.mockResolvedValueOnce({ ok: true, value: planToWireParts(agencyPlan).model });
    const second = await runWithTenant(owner, () =>
      planner.attempt("model", input, first, { model: null, knowledge: null }),
    );
    expect(second).toMatchObject({ attempts: 2, failure: null, repair: [] });
    expect(second.value).toEqual(planToWireParts(agencyPlan).model);
    expect(calls()[1].prompt).toContain(SETUP_REPAIR_INSTRUCTION);
    expect(calls()[1].prompt).toContain("lists: expected array, received string");
  });

  it("repairs a part once with its own issues and its previous answer", async () => {
    const { models, calls, plan } = harness();
    const broken = planToWireParts(agencyPlan).views;
    broken.listDefaults[0].list = "nowhere";
    let first = true;
    models.generate.mockImplementation((call: Call) => {
      if (call.label === PLAN_PART_LABELS.views && first) {
        first = false;
        return Promise.resolve({ ok: true, value: broken });
      }
      return Promise.resolve({ ok: true, value: planPartFor(call.label, agencyPlan) });
    });
    expect(await plan()).toMatchObject({ ok: true });
    const repair = calls().filter(({ label }) => label === PLAN_PART_LABELS.views)[1].prompt;
    expect(repair).toContain('Your previous answer: {"listDefaults":[{"list":"nowhere"');
    expect(repair).toContain('"path":"listDefaults.0.list"');
  });

  it("repairs a model without the required roles", async () => {
    const { models, calls, plan } = harness();
    const unmarked = planToWireParts(agencyPlan).model;
    unmarked.lists = unmarked.lists.map((list) => ({ ...list, role: null }));
    let first = true;
    models.generate.mockImplementation((call: Call) => {
      if (call.label === PLAN_PART_LABELS.model && first) {
        first = false;
        return Promise.resolve({ ok: true, value: unmarked });
      }
      return Promise.resolve({ ok: true, value: planPartFor(call.label, agencyPlan) });
    });
    expect(await plan()).toMatchObject({ ok: true });
    const repair = calls().filter(({ label }) => label === PLAN_PART_LABELS.model)[1].prompt;
    expect(repair).toContain("Mark exactly one list with the role people.");
    expect(repair).toContain("Mark exactly one list with the role tasks.");
  });

  it("drops a calculation that does not compile instead of spending a repair on it", async () => {
    const { answer, calls, plan } = harness();
    const model = planToWireParts(agencyPlan).model;
    model.calculations[0].expression = JSON.stringify({ op: "daysBetween", from: "project.kickoff", to: "deal.x" });
    answer({ [PLAN_PART_LABELS.model]: model });
    const result = await plan();
    expect(result.ok && result.plan.recordModel.calculations.map((calculation) => calculation.key)).toEqual([
      "organization.projectBudget",
      "deal.weightedValue",
    ]);
    expect(calls()).toHaveLength(3);
  });

  it("drops view columns that name no field of the planned model", async () => {
    const { answer, calls, plan } = harness();
    const views = planToWireParts(agencyPlan).views;
    views.listDefaults[1].columns.push("project.clientContacts");
    answer({ [PLAN_PART_LABELS.views]: views });
    const result = await plan();
    expect(result.ok && result.plan.listDefaults[1].columns).toEqual([
      "project.phase",
      "project.dueDate",
      "project.budget",
    ]);
    expect(calls()).toHaveLength(3);
  });

  it("gives up as an invalid plan when the repaired part is still rejected", async () => {
    const { answer, calls, plan, preview } = harness();
    preview.invoke.mockResolvedValue({ ok: true, data: { valid: false, issues: [{ code: "cycle" }] } } as never);
    answer();
    expect(await plan()).toEqual({ ok: false, failure: "invalidPlan" });
    expect(calls().filter(({ label }) => label === PLAN_PART_LABELS.model)).toHaveLength(SETUP_PLAN_PART_ATTEMPTS);
    expect(calls().some(({ label }) => label === PLAN_PART_LABELS.views)).toBe(false);
  });

  it("stops at the spend cap without a repair call", async () => {
    const { models, calls, plan } = harness();
    models.generate.mockImplementation((call: Call) =>
      Promise.resolve(
        call.label === PLAN_PART_LABELS.model
          ? { ok: false, failure: "spendCap" }
          : { ok: true, value: planPartFor(call.label, agencyPlan) },
      ),
    );
    expect(await plan()).toEqual({ ok: false, failure: "spendCap" });
    expect(calls().filter(({ label }) => label === PLAN_PART_LABELS.model)).toHaveLength(1);
  });

  it("refuses views before the record model is planned", async () => {
    const { calls, planner } = harness();
    const state = await runWithTenant(owner, () =>
      planner.attempt("views", input, emptySetupPlanPart(1), { model: null, knowledge: null }),
    );
    expect(state).toMatchObject({ attempts: 1, failure: "invalidPlan" });
    expect(calls()).toHaveLength(0);
  });
});
