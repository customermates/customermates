import type { RecordModel } from "@/features/records/record-model.schema";
import type { SetupPlanInput } from "../setup-plan.schema";

import { describe, expect, it } from "vitest";

import { PublicConfigurationChangeSchema } from "@/features/records/configuration.schema";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { WIDGET_GRID_BREAKPOINT_COLUMNS, rectsOverlap } from "@/features/widget/widget-grid";
import { ChartColor, DisplayType } from "@/features/widget/widget-display.schema";

import { compileSetupDashboard } from "../setup-dashboard-compiler";
import { compileSetupImportMapping } from "../setup-import-compiler";
import { compileSetupRecordModel } from "../setup-model-compiler";
import { SETUP_PLAN_LIMITS, SetupPlanSchema } from "../setup-plan.schema";
import { createSetupResolver, setupIdempotencyKey } from "../setup-references";
import { compileSetupListDefaults } from "../setup-view-compiler";
import { SETUP_ID, SETUP_LABELS, emptyWorkspaceModel, prepareConfiguration } from "./setup-harness";
import { agencyPlan, fieldServicePlan, saasPlan } from "./setup-plan-fixtures";

async function build(
  input: SetupPlanInput,
  brand: { chip?: "info"; chart?: ChartColor } = {},
  model: RecordModel = emptyWorkspaceModel(),
) {
  const plan = SetupPlanSchema.parse(input);
  const compiled = compileSetupRecordModel(plan, {
    setupId: SETUP_ID,
    model,
    labels: SETUP_LABELS,
    brandChip: brand.chip,
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const prepared = await prepareConfiguration(compiled.data, model);
  const resolver = createSetupResolver(plan, { model: prepared.model, references: prepared.preview.references });
  const reference = (key: string) => prepared.preview.references.find((entry) => entry.reference === key)?.id;
  return { plan, change: compiled.data, prepared, resolver, reference };
}

const withoutOfferings: SetupPlanInput = {
  ...agencyPlan,
  recordModel: {
    ...agencyPlan.recordModel,
    lists: agencyPlan.recordModel.lists.map((list) =>
      list.role === "offerings"
        ? { key: list.key, label: list.label, pluralLabel: list.pluralLabel, icon: list.icon }
        : list,
    ),
  },
};

describe("workspace setup compiler", () => {
  it.each([
    ["agency", agencyPlan],
    ["subscription business", saasPlan],
    ["field service", fieldServicePlan],
  ])("compiles the %s plan into one valid bundle for an empty workspace", async (_name, input) => {
    const { change, prepared } = await build(input);
    expect(PublicConfigurationChangeSchema.safeParse(change).success).toBe(true);
    expect(change.expectedRevision).toBe(0);
    expect(change.idempotencyKey).toBe(setupIdempotencyKey(SETUP_ID, "record-model"));
    expect(change.operations.length).toBeLessThanOrEqual(200);
    expect(change.operations.some((operation) => operation.operation === "delete")).toBe(false);
    expect(change.operations.some((operation) => operation.operation === "setTypeGrants")).toBe(false);
    expect(prepared.preview.issues).toEqual([]);
    expect(prepared.preview.valid).toBe(true);
    expect(validateRecordModel(prepared.model).issues).toEqual([]);
  });

  it("is deterministic and keys idempotency to the setup", () => {
    const plan = SetupPlanSchema.parse(agencyPlan);
    const context = { setupId: SETUP_ID, model: emptyWorkspaceModel(), labels: SETUP_LABELS };
    const first = compileSetupRecordModel(plan, context);
    const second = compileSetupRecordModel(plan, context);
    const other = compileSetupRecordModel(plan, { ...context, setupId: "a2c4e6f8-1b3d-4f5a-8c7e-9d0b1a2c3e4f" });
    expect(first).toEqual(second);
    expect(first.ok && other.ok && first.data.idempotencyKey !== other.data.idempotencyKey).toBe(true);
  });

  it("creates every planned list from client references", async () => {
    const { change } = await build(agencyPlan);
    const created = change.operations.flatMap((operation) =>
      operation.operation === "createType" ? [operation.reference] : [],
    );
    expect(created).toEqual([
      "$list.contact",
      "$list.organization",
      "$list.deal",
      "$list.service",
      "$list.task",
      "$list.project",
      "$list.lineItem",
    ]);
    const fields = change.operations.flatMap((operation) =>
      operation.operation === "putField" ? [operation.field] : [],
    );
    expect(fields.find((field) => field.id === "$field.project.phase")?.typeId).toBe("$list.project");
    expect(fields.find((field) => field.id === "$field.deal.leadSource")?.typeId).toBe("$list.deal");
    expect(fields.find((field) => field.id === "$field.project.duration")?.behavior).toMatchObject({
      kind: "formula",
      expression: { operator: "daysBetween" },
    });
    expect(fields.find((field) => field.id === "$field.organization.projectBudget")?.behavior).toMatchObject({
      kind: "rollup",
      expression: { relationId: "$rel.projectClient", direction: "incoming", reducer: "sum" },
    });
  });

  it.each([
    ["agency", agencyPlan, "contact", "task"],
    ["subscription business", saasPlan, "person", "todo"],
    ["field service", fieldServicePlan, "contact", "job"],
  ])("always adds the %s anchors to the people and tasks lists", async (_name, input, people, tasks) => {
    const { prepared, reference } = await build(input);
    const peopleId = reference(`$list.${people}`);
    const channels = prepared.model.fields.find((field) => field.id === reference(`$field.${people}.channels`));
    expect(channels).toMatchObject({
      typeId: peopleId,
      label: "Channels",
      valueType: "channels",
      required: false,
      behavior: { kind: "input" },
      format: { onClick: "open", providerAvatar: true },
    });
    const avatar = prepared.model.fields.find((field) => field.id === reference(`$field.${people}.avatar`));
    expect(avatar).toMatchObject({ typeId: peopleId, label: "Avatar", valueType: "url" });
    expect(prepared.model.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "avatar", typeId: peopleId, fields: [{ role: "image", fieldId: avatar?.id }] }),
        expect.objectContaining({ kind: "membershipAuthorization", typeId: reference(`$list.${tasks}`), fields: [] }),
      ]),
    );
    expect(prepared.model.capabilities.filter((binding) => binding.kind === "membershipAuthorization")).toHaveLength(1);
  });

  it("leaves an existing membership list in place", async () => {
    const model: RecordModel = {
      ...emptyWorkspaceModel(),
      revision: 3,
      types: [
        {
          id: "5f1d2c3b-4a59-4b6c-8d7e-9f0a1b2c3d4e",
          label: "Approval",
          pluralLabel: "Approvals",
          description: "",
          icon: "check",
          primaryFieldId: null,
          parentRelationshipId: null,
          embedded: false,
          navigationVisible: true,
          archived: false,
          position: 0,
        },
      ],
      capabilities: [
        {
          id: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
          kind: "membershipAuthorization",
          typeId: "5f1d2c3b-4a59-4b6c-8d7e-9f0a1b2c3d4e",
          fields: [],
        },
      ],
    };
    const compiled = compileSetupRecordModel(SetupPlanSchema.parse(agencyPlan), {
      setupId: SETUP_ID,
      model,
      labels: SETUP_LABELS,
    });
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
    expect(
      compiled.data.operations.some(
        (operation) =>
          operation.operation === "putCapability" && operation.capability.kind === "membershipAuthorization",
      ),
    ).toBe(false);
  });

  it("shows the messages of people on the lists they are linked to", async () => {
    const { prepared, reference } = await build(agencyPlan);
    const relation = (key: string) =>
      prepared.model.relationships.find((entry) => entry.id === reference(`$rel.${key}`));
    expect(relation("dealContacts")).toMatchObject({ messagesOnSource: true, messagesOnTarget: false });
    expect(relation("contactClient")).toMatchObject({ messagesOnSource: false, messagesOnTarget: true });
    expect(relation("projectClient")).toMatchObject({ messagesOnSource: false, messagesOnTarget: false });
  });

  it("fills a win chance on every stage and opens new deals in the first open stage", async () => {
    const { prepared, reference } = await build(agencyPlan);
    const stage = prepared.model.fields.find((field) => field.id === reference("$field.deal.stage"));
    expect(stage?.options.map((option) => [option.id, option.label, option.color])).toEqual([
      ["lead", "Lead", "secondary"],
      ["briefing", "Briefing", "info"],
      ["proposal", "Offer", "info"],
      ["won", "Won", "success"],
      ["lost", "Lost", "destructive"],
    ]);
    const weights = stage?.options.map((option) => option.attributes.find((item) => item.key === "probability")?.value);
    expect(weights?.map((value) => (value?.kind === "decimal" ? value.value : null))).toEqual([
      "10",
      "45",
      "68",
      "100",
      "0",
    ]);
    expect(stage?.behavior).toEqual({ kind: "input", defaultValue: { kind: "select", value: "lead" } });
    const phase = prepared.model.fields.find((field) => field.id === reference("$field.project.phase"));
    expect(phase?.options.every((option) => option.attributes.length === 0)).toBe(true);
    expect(phase?.behavior).toEqual({ kind: "input" });
  });

  it("gives deals line items against the offerings list", async () => {
    const { prepared, reference } = await build(agencyPlan);
    const lineItem = prepared.model.types.find((type) => type.id === reference("$list.lineItem"));
    const toDeal = reference("$rel.lineItemDeal");
    expect(lineItem).toMatchObject({
      label: "Line item",
      pluralLabel: "Line items",
      embedded: true,
      navigationVisible: false,
      parentRelationshipId: toDeal,
    });
    expect(prepared.model.relationships.find((relation) => relation.id === toDeal)).toMatchObject({
      sourceTypeId: lineItem?.id,
      targetTypeId: reference("$list.deal"),
      sourceLabel: "Opportunity",
      targetLabel: "Line items",
      sourceCardinality: "one",
      targetCardinality: "many",
      onTargetDelete: "cascade",
    });
    expect(
      prepared.model.relationships.find((relation) => relation.id === reference("$rel.lineItemOffering")),
    ).toMatchObject({ targetTypeId: reference("$list.service"), sourceLabel: "Service", onTargetDelete: "cascade" });
    const lineFields = prepared.model.fields
      .filter((field) => field.typeId === lineItem?.id)
      .sort((left, right) => left.position - right.position)
      .map((field) => [field.label, field.valueType, field.behavior.kind]);
    expect(lineFields).toEqual([
      ["Line item", "text", "input"],
      ["Quantity", "number", "input"],
      ["Pricing", "select", "input"],
      ["Saved unit price", "currency", "snapshot"],
      ["Unit price", "currency", "formula"],
      ["Amount", "currency", "formula"],
    ]);
    expect(prepared.model.fields.find((field) => field.id === reference("$field.deal.value"))).toMatchObject({
      label: "Value",
      valueType: "currency",
      format: { currency: "EUR" },
      behavior: { kind: "rollup", expression: { relationId: toDeal, direction: "incoming", reducer: "sum" } },
    });
    expect(prepared.model.fields.find((field) => field.id === reference("$field.service.price"))).toMatchObject({
      label: "Price",
      valueType: "currency",
      required: true,
      behavior: { kind: "input", defaultValue: { kind: "decimal", value: "0", currency: "EUR" } },
    });
    const deal = prepared.model.types.find((type) => type.id === reference("$list.deal"));
    const service = prepared.model.types.find((type) => type.id === reference("$list.service"));
    expect(deal?.relationshipPaths?.map((path) => path.label)).toEqual(["Services"]);
    expect(service?.relationshipPaths?.map((path) => path.label)).toEqual(["Opportunities"]);
  });

  it("gives deals a plain money value without an offerings list", async () => {
    const { prepared, reference } = await build(withoutOfferings);
    expect(reference("$list.lineItem")).toBeUndefined();
    expect(prepared.model.types.some((type) => type.embedded)).toBe(false);
    expect(prepared.model.fields.find((field) => field.id === reference("$field.deal.value"))).toMatchObject({
      valueType: "currency",
      behavior: { kind: "input" },
      format: { currency: "EUR" },
    });
    expect(reference("$field.service.price")).toBeUndefined();
  });

  it("adds no money value or line items to a workspace without deals", async () => {
    const { prepared } = await build(fieldServicePlan);
    expect(prepared.model.types.some((type) => type.embedded)).toBe(false);
    expect(prepared.model.fields.some((field) => field.valueType === "currency")).toBe(false);
  });

  it("puts every money field in the workspace currency", async () => {
    const { prepared } = await build(saasPlan);
    const money = prepared.model.fields.filter((field) => field.valueType === "currency");
    expect(money.length).toBeGreaterThan(6);
    for (const field of money) expect(field.format?.currency, field.label).toBe("USD");
  });

  it("orders list columns through field positions, name first", async () => {
    const { prepared, reference } = await build(agencyPlan);
    const ordered = (list: string) =>
      prepared.model.fields
        .filter((field) => field.typeId === reference(`$list.${list}`))
        .sort((left, right) => left.position - right.position)
        .map((field) => field.label);
    expect(ordered("deal").slice(0, 5)).toEqual(["Opportunity", "Stage", "Value", "Expected close", "Lead source"]);
    expect(ordered("project").slice(0, 4)).toEqual(["Project", "Phase", "Due", "Budget"]);
    expect(ordered("contact").slice(0, 3)).toEqual(["Contact", "Channels", "Job title"]);
  });

  it("colours lists with the brand chip unless the plan names one", async () => {
    const agency = await build(agencyPlan, { chip: "info" });
    expect(agency.prepared.model.types.find((type) => type.id === agency.reference("$list.project"))?.color).toBe(
      "info",
    );
    const saas = await build(saasPlan, { chip: "info" });
    expect(saas.prepared.model.types.find((type) => type.id === saas.reference("$list.subscription"))?.color).toBe(
      "success",
    );
  });

  it.each([
    ["agency", agencyPlan, 3],
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
        field: resolver.field("deal.stage"),
        summaries: [
          { fieldId: resolver.field("deal.value"), aggregation: "sum" },
          { fieldId: resolver.field("deal.weightedValue"), aggregation: "sum" },
        ],
      },
      sortDescriptor: { field: resolver.field("deal.closeDate"), direction: "asc" },
    });
    expect(pipeline?.state.columnOrder?.[0]).toBe(resolver.field("deal.name"));
    expect(pipeline?.state.hiddenColumns).toContain(resolver.field("deal.weightedValue"));
    expect(pipeline?.state.hiddenColumns).not.toContain(resolver.field("deal.stage"));
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
    expect(widgets.data[1].measure?.source.filters).toEqual([
      {
        fieldId: resolver.field("deal.stage"),
        operator: "in",
        value: null,
        values: [{ kind: "select", value: "won" }],
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
    const widgets = compileSetupDashboard(plan, resolver, prepared.model, { setupId: SETUP_ID, expectedRevision: 1 });
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
        { column: "Customer", field: "customer.name" },
        { column: "Count", field: "customer.ticketCount" },
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

  it("refuses a list default column of another list", () => {
    const input = structuredClone(agencyPlan);
    input.listDefaults[1] = { ...agencyPlan.listDefaults[1], columns: ["deal.closeDate"] };
    const compiled = compileSetupRecordModel(SetupPlanSchema.parse(input), {
      setupId: SETUP_ID,
      model: emptyWorkspaceModel(),
      labels: SETUP_LABELS,
    });
    expect(compiled).toEqual({
      ok: false,
      issues: [{ code: "column_outside_list", path: "listDefaults.1.columns.0" }],
    });
  });

  it("keeps the largest allowed plan with anchors and line items inside one bundle", async () => {
    const lists = Array.from({ length: SETUP_PLAN_LIMITS.lists }, (_, index) => `list${index}`);
    const roles = ["people", "tasks", "deals", "offerings"] as const;
    const input: SetupPlanInput = {
      ...saasPlan,
      recordModel: {
        lists: lists.map((key, index) => ({
          key,
          label: `List ${index}`,
          pluralLabel: `Lists ${index}`,
          icon: "folder",
          color: "info",
          ...(index < roles.length ? { role: roles[index] } : {}),
        })),
        fields: Array.from({ length: SETUP_PLAN_LIMITS.fields }, (_, index) => ({
          key: `${lists[index % lists.length]}.field${index}`,
          label: `Field ${index}`,
          valueType: "text" as const,
        })),
        relationships: Array.from({ length: SETUP_PLAN_LIMITS.relationships }, (_, index) => ({
          key: `relation${index}`,
          source: lists[index % lists.length],
          target: lists[(index + 1) % lists.length],
          sourceLabel: `Target ${index}`,
          targetLabel: `Linked ${index}`,
          sourceCardinality: "many" as const,
          targetCardinality: "many" as const,
        })),
        calculations: Array.from({ length: SETUP_PLAN_LIMITS.calculations }, (_, index) => ({
          key: `${lists[4]}.calc${index}`,
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
