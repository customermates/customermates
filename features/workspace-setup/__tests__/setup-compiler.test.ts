import type { SetupPlanInput } from "../setup-plan.schema";

import { describe, expect, it } from "vitest";

import { PublicConfigurationChangeSchema } from "@/features/records/configuration.schema";
import { presetId } from "@/features/records/crm-preset";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { WIDGET_GRID_BREAKPOINT_COLUMNS, rectsOverlap } from "@/features/widget/widget-grid";
import { ChartColor, DisplayType } from "@/features/widget/widget-display.schema";

import { compileSetupDashboard } from "../setup-dashboard-compiler";
import { compileSetupImportMapping } from "../setup-import-compiler";
import { compileSetupRecordModel } from "../setup-model-compiler";
import { SETUP_PLAN_LIMITS, SetupPlanSchema } from "../setup-plan.schema";
import { createSetupResolver, setupIdempotencyKey } from "../setup-references";
import { compileSetupListDefaults } from "../setup-view-compiler";
import { SETUP_COMPANY_ID, SETUP_ID, prepareConfiguration, workspacePreset } from "./setup-harness";
import { agencyPlan, fieldServicePlan, saasPlan } from "./setup-plan-fixtures";

const id = (key: string) => presetId(SETUP_COMPANY_ID, key);

async function build(input: SetupPlanInput, brand: { chip?: "info"; chart?: ChartColor } = {}) {
  const plan = SetupPlanSchema.parse(input);
  const preset = await workspacePreset();
  const compiled = compileSetupRecordModel(plan, {
    companyId: SETUP_COMPANY_ID,
    setupId: SETUP_ID,
    model: preset,
    brandChip: brand.chip,
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const prepared = await prepareConfiguration(compiled.data, preset);
  const resolver = createSetupResolver(plan, {
    companyId: SETUP_COMPANY_ID,
    model: prepared.model,
    references: prepared.preview.references,
  });
  return { plan, preset, change: compiled.data, prepared, resolver };
}

describe("workspace setup compiler", () => {
  it.each([
    ["agency", agencyPlan],
    ["subscription business", saasPlan],
    ["field service", fieldServicePlan],
  ])("compiles the %s plan into one valid configuration bundle", async (_name, input) => {
    const { change, prepared, preset } = await build(input);
    expect(PublicConfigurationChangeSchema.safeParse(change).success).toBe(true);
    expect(change.expectedRevision).toBe(preset.revision);
    expect(change.idempotencyKey).toBe(setupIdempotencyKey(SETUP_ID, "record-model"));
    expect(change.operations.length).toBeLessThanOrEqual(200);
    expect(change.operations.some((operation) => operation.operation === "delete")).toBe(false);
    expect(prepared.preview.issues).toEqual([]);
    expect(prepared.preview.valid).toBe(true);
    expect(validateRecordModel(prepared.model).issues).toEqual([]);
    for (const type of preset.types)
      expect(prepared.model.types.some((candidate) => candidate.id === type.id)).toBe(true);
    for (const field of preset.fields)
      expect(prepared.model.fields.find((candidate) => candidate.id === field.id)?.archived).toBe(false);
  });

  it("is deterministic and keys idempotency to the setup", async () => {
    const plan = SetupPlanSchema.parse(agencyPlan);
    const model = await workspacePreset();
    const first = compileSetupRecordModel(plan, { companyId: SETUP_COMPANY_ID, setupId: SETUP_ID, model });
    const second = compileSetupRecordModel(plan, { companyId: SETUP_COMPANY_ID, setupId: SETUP_ID, model });
    const other = compileSetupRecordModel(plan, {
      companyId: SETUP_COMPANY_ID,
      setupId: "a2c4e6f8-1b3d-4f5a-8c7e-9d0b1a2c3e4f",
      model,
    });
    expect(first).toEqual(second);
    expect(first.ok && other.ok && first.data.idempotencyKey !== other.data.idempotencyKey).toBe(true);
  });

  it("uses client references for new definitions and real ids for the preset", async () => {
    const { change } = await build(agencyPlan);
    const created = change.operations.flatMap((operation) =>
      operation.operation === "createType" ? [operation.reference] : [],
    );
    expect(created).toEqual(["$list.project"]);
    const fields = change.operations.flatMap((operation) =>
      operation.operation === "putField" ? [operation.field] : [],
    );
    expect(fields.find((field) => field.id === "$field.project.phase")?.typeId).toBe("$list.project");
    expect(fields.find((field) => field.id === "$field.deal.leadSource")?.typeId).toBe(id("deal"));
    const duration = fields.find((field) => field.id === "$field.project.duration");
    expect(duration?.behavior).toMatchObject({ kind: "formula", expression: { operator: "daysBetween" } });
    expect(fields.find((field) => field.id === "$field.organization.projectBudget")?.behavior).toMatchObject({
      kind: "rollup",
      expression: { relationId: "$rel.projectClient", direction: "incoming", reducer: "sum" },
    });
  });

  it("replaces the pipeline stages, keeping preset option ids and win chances", async () => {
    const { prepared } = await build(agencyPlan);
    const stage = prepared.model.fields.find((field) => field.id === id("deal.stage"));
    expect(stage?.options.map((option) => option.label)).toEqual(["Lead", "Briefing", "Offer", "Won", "Lost"]);
    expect(stage?.options.map((option) => option.id)).toEqual([
      "lead",
      "briefing",
      id("deal.stage.proposal"),
      id("deal.stage.won"),
      id("deal.stage.lost"),
    ]);
    const weights = stage?.options.map((option) => option.attributes.find((item) => item.key === "probability")?.value);
    expect(weights?.map((value) => (value?.kind === "decimal" ? value.value : null))).toEqual([
      "10",
      "45",
      "60",
      "100",
      "0",
    ]);
    expect(stage?.options.map((option) => option.color)).toEqual([
      "secondary",
      "info",
      "warning",
      "success",
      "destructive",
    ]);
    expect(stage?.behavior).toEqual({ kind: "input", defaultValue: { kind: "select", value: "lead" } });
  });

  it("renames standard lists and the relationship labels that named them", async () => {
    const { prepared } = await build(agencyPlan);
    const deal = prepared.model.types.find((type) => type.id === id("deal"));
    expect([deal?.label, deal?.pluralLabel]).toEqual(["Opportunity", "Opportunities"]);
    const dealContacts = prepared.model.relationships.find((relation) => relation.id === id("deal.contacts"));
    expect(dealContacts?.targetLabel).toBe("Opportunities");
    const lineItems = prepared.model.relationships.find((relation) => relation.id === id("lineItem.deal"));
    expect(lineItems?.sourceLabel).toBe("Opportunity");
  });

  it("switches every money field to the workspace currency", async () => {
    const { prepared } = await build(saasPlan);
    const money = prepared.model.fields.filter((field) => field.valueType === "currency");
    expect(money.length).toBeGreaterThan(6);
    for (const field of money) expect(field.format?.currency, field.label).toBe("USD");
    expect(prepared.model.fields.find((field) => field.id === id("service.amount"))?.behavior).toEqual({
      kind: "input",
      defaultValue: { kind: "decimal", value: "0", currency: "USD" },
    });
  });

  it("orders list columns through field positions, primary field first", async () => {
    const { prepared } = await build(agencyPlan);
    const ordered = prepared.model.fields
      .filter((field) => field.typeId === id("deal") && !field.archived)
      .sort((left, right) => left.position - right.position)
      .map((field) => field.id);
    expect(ordered.slice(0, 5)).toEqual([
      id("deal.name"),
      id("deal.stage"),
      id("deal.totalValue"),
      ordered[3],
      ordered[4],
    ]);
    const project = prepared.preview.references.find((entry) => entry.reference === "$list.project")?.id;
    const projectFields = prepared.model.fields
      .filter((field) => field.typeId === project)
      .sort((left, right) => left.position - right.position)
      .map((field) => field.label);
    expect(projectFields.slice(0, 4)).toEqual(["Project", "Phase", "Due", "Budget"]);
  });

  it("colours new lists with the brand chip unless the plan names one", async () => {
    const agency = await build(agencyPlan, { chip: "info" });
    const project = agency.prepared.preview.references.find((entry) => entry.reference === "$list.project")?.id;
    expect(agency.prepared.model.types.find((type) => type.id === project)?.color).toBe("info");
    const saas = await build(saasPlan, { chip: "info" });
    const subscription = saas.prepared.preview.references.find((entry) => entry.reference === "$list.subscription")?.id;
    expect(saas.prepared.model.types.find((type) => type.id === subscription)?.color).toBe("success");
  });

  it.each([
    ["agency", agencyPlan, 2],
    ["subscription business", saasPlan, 2],
    ["field service", fieldServicePlan, 2],
  ])("compiles the %s list defaults into valid personal views", async (_name, input, count) => {
    const { plan, prepared, resolver } = await build(input);
    const views = compileSetupListDefaults(plan, resolver, prepared.model);
    if (!views.ok) throw new Error(JSON.stringify(views.issues));
    expect(views.data).toHaveLength(count);
    for (const view of views.data) {
      expect(view.surfaceKey.startsWith("records:")).toBe(true);
      expect(JSON.stringify(view)).not.toContain("$");
    }
  });

  it("compiles board defaults with grouping, totals and hidden columns", async () => {
    const { plan, prepared, resolver } = await build(agencyPlan);
    const views = compileSetupListDefaults(plan, resolver, prepared.model);
    if (!views.ok) throw new Error(JSON.stringify(views.issues));
    const pipeline = views.data.find((view) => view.name === "Pipeline");
    expect(pipeline?.state).toMatchObject({
      viewMode: "card",
      grouping: {
        field: id("deal.stage"),
        summaries: [
          { fieldId: id("deal.totalValue"), aggregation: "sum" },
          { fieldId: id("deal.weightedValue"), aggregation: "sum" },
        ],
      },
      sortDescriptor: { field: resolver.field("deal.closeDate"), direction: "asc" },
    });
    expect(pipeline?.state.columnOrder?.[0]).toBe(id("deal.name"));
    expect(pipeline?.state.hiddenColumns).toContain(id("deal.notes"));
    expect(pipeline?.state.hiddenColumns).not.toContain(id("deal.stage"));
  });

  it.each([
    ["agency", agencyPlan],
    ["subscription business", saasPlan],
    ["field service", fieldServicePlan],
  ])("compiles the %s dashboard onto the 12-column grid", async (_name, input) => {
    const { plan, prepared, resolver } = await build(input);
    const widgets = compileSetupDashboard(plan, resolver, prepared.model, {
      setupId: SETUP_ID,
      expectedRevision: prepared.model.revision,
      brandChart: ChartColor.secondary2,
    });
    if (!widgets.ok) throw new Error(JSON.stringify(widgets.issues));
    expect(widgets.data).toHaveLength(plan.dashboard.widgets.length);
    const rects = widgets.data.map((widget) => widget.layout ?? { x: -1, y: -1, w: 0, h: 0 });
    for (const [index, rect] of rects.entries()) {
      expect(rect.x + rect.w).toBeLessThanOrEqual(WIDGET_GRID_BREAKPOINT_COLUMNS.lg);
      for (const other of rects.slice(index + 1)) expect(rectsOverlap(rect, other)).toBe(false);
    }
    expect(new Set(widgets.data.map((widget) => widget.idempotencyKey)).size).toBe(widgets.data.length);
    for (const widget of widgets.data) {
      expect(widget.displayOptions?.barColors).toEqual([ChartColor.secondary2]);
      expect(widget.isTemplate).toBe(plan.workspace.dashboardAudience !== "me");
      expect(JSON.stringify(widget)).not.toContain("$");
    }
  });

  it("puts the first ranked numbers on the top row", async () => {
    const { plan, prepared, resolver } = await build(agencyPlan);
    const widgets = compileSetupDashboard(plan, resolver, prepared.model, {
      setupId: SETUP_ID,
      expectedRevision: prepared.model.revision,
    });
    if (!widgets.ok) throw new Error(JSON.stringify(widgets.issues));
    expect(widgets.data.slice(0, 2).map((widget) => widget.layout)).toEqual([
      { x: 0, y: 0, w: 3, h: 2 },
      { x: 3, y: 0, w: 3, h: 2 },
    ]);
    const won = widgets.data[1].measure?.source.filters;
    expect(won).toEqual([
      {
        fieldId: id("deal.stage"),
        operator: "in",
        value: null,
        values: [{ kind: "select", value: id("deal.stage.won") }],
      },
      {
        fieldId: resolver.field("deal.closeDate"),
        operator: "inLastDays",
        value: { kind: "decimal", value: "30", currency: null },
      },
    ]);
    expect(widgets.data[2].displayOptions?.useGroupColors).toBe(true);
  });

  it("reports a widget whose display type does not fit its measure", async () => {
    const input = structuredClone(agencyPlan);
    input.dashboard.widgets = [{ ...agencyPlan.dashboard.widgets[2], display: DisplayType.number }];
    const { plan, prepared, resolver } = await build(input);
    const widgets = compileSetupDashboard(plan, resolver, prepared.model, { setupId: SETUP_ID, expectedRevision: 2 });
    expect(widgets).toEqual({ ok: false, issues: [{ code: "display_mismatch", path: "dashboard.widgets.0.display" }] });
  });

  it("compiles the import mapping to fields of the target list", async () => {
    const { plan, prepared, resolver } = await build(fieldServicePlan);
    const mapping = compileSetupImportMapping(plan, resolver, prepared.model);
    if (!mapping.ok || !mapping.data) throw new Error(JSON.stringify(mapping));
    expect(mapping.data.typeId).toBe(resolver.list("ticket"));
    expect(mapping.data.columns.map((column) => column.fieldId)).toEqual([
      resolver.field("ticket.name"),
      resolver.field("ticket.priority"),
      resolver.field("ticket.openedOn"),
    ]);
    const input = structuredClone(fieldServicePlan);
    input.importMapping = {
      list: "ticket",
      columns: [
        { column: "Customer", field: "organization.name" },
        { column: "Count", field: "organization.ticketCount" },
      ],
    };
    const wrong = await build(input);
    expect(compileSetupImportMapping(wrong.plan, wrong.resolver, wrong.prepared.model)).toEqual({
      ok: false,
      issues: [
        { code: "unknown_field", path: "importMapping.columns.0.field" },
        { code: "unknown_field", path: "importMapping.columns.1.field" },
      ],
    });
  });

  it("reports references to standard definitions that are gone", async () => {
    const plan = SetupPlanSchema.parse(agencyPlan);
    const model = await workspacePreset();
    const trimmed = {
      ...model,
      fields: model.fields.map((field) => (field.id === id("deal.stage") ? { ...field, archived: true } : field)),
    };
    const compiled = compileSetupRecordModel(plan, { companyId: SETUP_COMPANY_ID, setupId: SETUP_ID, model: trimmed });
    expect(compiled.ok).toBe(false);
    if (!compiled.ok)
      expect(compiled.issues).toContainEqual({ code: "unknown_field", path: "recordModel.fieldChanges.0" });
  });

  it("keeps the largest allowed plan inside one bundle", async () => {
    const lists = Array.from({ length: SETUP_PLAN_LIMITS.lists }, (_, index) => `list${index}`);
    const input: SetupPlanInput = {
      ...saasPlan,
      recordModel: {
        lists: lists.map((key, index) => ({
          key,
          label: `List ${index}`,
          pluralLabel: `Lists ${index}`,
          icon: "folder",
          color: "info",
        })),
        listChanges: ["contact", "organization", "deal", "service", "task", "lineItem"].map((list, index) => ({
          list,
          label: `Renamed ${index}`,
          pluralLabel: `Renamed lists ${index}`,
        })),
        fields: Array.from({ length: SETUP_PLAN_LIMITS.fields }, (_, index) => ({
          key: `${lists[index % lists.length]}.field${index}`,
          label: `Field ${index}`,
          valueType: "text" as const,
        })),
        fieldChanges: [],
        relationships: Array.from({ length: SETUP_PLAN_LIMITS.relationships }, (_, index) => ({
          key: `relation${index}`,
          source: lists[index % lists.length],
          target: "organization",
          sourceLabel: `Organization ${index}`,
          targetLabel: `Linked ${index}`,
          sourceCardinality: "many" as const,
          targetCardinality: "many" as const,
        })),
        calculations: Array.from({ length: SETUP_PLAN_LIMITS.calculations }, (_, index) => ({
          key: `organization.calc${index}`,
          label: `Calculation ${index}`,
          valueType: "number" as const,
          expression: { op: "number" as const, value: String(index) },
        })),
      },
      listDefaults: [],
      dashboard: { widgets: [] },
    };
    const { change, prepared } = await build(input);
    expect(change.operations.length).toBeLessThanOrEqual(200);
    expect(prepared.preview.issues).toEqual([]);
  });
});
