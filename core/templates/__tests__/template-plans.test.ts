import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { AppLocale } from "@/i18n/locale-registry";

import { WorkspaceSetupPlanner } from "@/ee/workspace-setup/workspace-setup-planner";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { compileTemplate } from "@/core/templates/compile-template";
import { TEMPLATE_SLUGS, hasTemplateText } from "@/core/templates/template-registry";
import {
  SETUP_COMPANY_ID,
  SETUP_ID,
  emptyWorkspaceModel,
  prepareConfiguration,
} from "@/features/workspace-setup/__tests__/setup-harness";
import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";
import { APP_LOCALES } from "@/i18n/locale-registry";
import { createMockUser } from "@/tests/helpers/mock-user";

import { getTemplate, getTemplateText } from "./template-fixtures";

const owner = createMockUser({ companyId: SETUP_COMPANY_ID });

function planner() {
  return new WorkspaceSetupPlanner(
    { generate: vi.fn() } as never,
    { getModel: () => Promise.resolve(emptyWorkspaceModel()) } as never,
    { invoke: vi.fn(() => Promise.resolve({ ok: true, data: { valid: true, issues: [] } })) } as never,
    { prepare: (change: ConfigurationChange, model: RecordModel) => prepareConfiguration(change, model) } as never,
    { load: () => Promise.resolve({}) } as never,
  );
}

function plannerIssues(plan: SetupPlan, locale: AppLocale) {
  return runWithTenant(owner, () => planner().issues(SETUP_ID, plan, locale));
}

const CASES = TEMPLATE_SLUGS.flatMap((slug) =>
  APP_LOCALES.filter((locale) => hasTemplateText(slug, locale)).map((locale) => ({ slug, locale })),
);

describe("compiled template plans", () => {
  it("covers every shipped locale file", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(TEMPLATE_SLUGS.length * 2);
  });

  it.each(CASES)("compiles $slug in $locale to a valid SetupPlan", ({ slug, locale }) => {
    const { plan } = compileTemplate(getTemplate(slug), getTemplateText(slug, locale));
    const parsed = SetupPlanSchema.safeParse(plan);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    expect(parsed.success && parsed.data).toEqual(plan);
  });

  it.each(CASES)("passes the planner checks for $slug in $locale", async ({ slug, locale }) => {
    const { plan } = compileTemplate(getTemplate(slug), getTemplateText(slug, locale));
    expect(await plannerIssues(plan, locale)).toEqual([]);
  });

  it("makes the planner checks fail for a plan that points at an unknown field", async () => {
    const { plan } = compileTemplate(getTemplate("sales-pipeline"), getTemplateText("sales-pipeline", "en"));
    const widget = plan.dashboard.widgets.find((candidate) => candidate.kind === "chart");
    if (widget?.kind === "chart") widget.valueField = "opportunities.doesNotExist";
    const issues = await plannerIssues(plan, "en");
    expect(issues.some((issue) => issue.message === "unknown_field")).toBe(true);
  });

  it.each(CASES)("keeps $slug in $locale inside the plan limits", ({ slug, locale }) => {
    const { plan } = compileTemplate(getTemplate(slug), getTemplateText(slug, locale));
    expect(plan.recordModel.lists.length).toBeLessThanOrEqual(10);
    expect(plan.dashboard.widgets.length).toBeLessThanOrEqual(12);
    expect(plan.recordModel.lists.filter((list) => list.role === "people")).toHaveLength(1);
    expect(plan.recordModel.lists.filter((list) => list.role === "tasks")).toHaveLength(1);
    expect(plan.sampleData.lists).toEqual([]);
  });
});
