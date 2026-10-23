import type { RecordModel } from "@/features/records/record-model.schema";
import type { SetupPlanInput } from "../setup-plan.schema";

import { describe, expect, it } from "vitest";

import { PublicConfigurationChangeSchema } from "@/features/records/configuration.schema";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { WIDGET_GRID_BREAKPOINT_COLUMNS, rectsOverlap } from "@/features/widget/widget-grid";
import { ChartColor, DisplayType } from "@/features/widget/widget-display.schema";

import { compileSetupDashboard, setupDashboardLayouts } from "../setup-dashboard-compiler";
import { compileSetupImportMapping, setupImportList, withOptionalImportFields } from "../setup-import-compiler";
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
  const resolver = createSetupResolver(plan, {
    model: prepared.model,
    references: prepared.preview.references,
  });
  const reference = (key: string) => prepared.preview.references.find((entry) => entry.reference === key)?.id;
  return { plan, change: compiled.data, prepared, resolver, reference };
}

const withoutOfferings: SetupPlanInput = {
  ...agencyPlan,
  recordModel: {
    ...agencyPlan.recordModel,
    lists: agencyPlan.recordModel.lists.map((list) =>
      list.role === "offerings"
        ? {
            key: list.key,
            label: list.label,
            pluralLabel: list.pluralLabel,
            icon: list.icon,
          }
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
    const context = {
      setupId: SETUP_ID,
      model: emptyWorkspaceModel(),
      labels: SETUP_LABELS,
    };
    const first = compileSetupRecordModel(plan, context);
    const second = compileSetupRecordModel(plan, context);
    const other = compileSetupRecordModel(plan, {
      ...context,
      setupId: "a2c4e6f8-1b3d-4f5a-8c7e-9d0b1a2c3e4f",
    });
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
      expression: {
        relationId: "$rel.projectClient",
        direction: "incoming",
        reducer: "sum",
      },
    });
  });

  it.each([
    ["agency", agencyPlan, "contact", "task"],
    ["subscription business", saasPlan, "person", "todo"],
    ["field service", fieldServicePlan, "contact", "job"],
  ])(
    "always adds the %s anchors to the people list and binds nothing to the tasks list",
    async (_name, input, people, tasks) => {
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
      expect(avatar).toMatchObject({
        typeId: peopleId,
        label: "Avatar",
        valueType: "url",
      });
      expect(prepared.model.capabilities).toEqual([
        expect.objectContaining({
          kind: "avatar",
          typeId: peopleId,
          fields: [{ role: "image", fieldId: avatar?.id }],
        }),
      ]);
      expect(prepared.model.capabilities.some((binding) => binding.typeId === reference(`$list.${tasks}`))).toBe(false);
    },
  );

  it("shows the messages of people on the lists they are linked to", async () => {
    const { prepared, reference } = await build(agencyPlan);
    const relation = (key: string) =>
      prepared.model.relationships.find((entry) => entry.id === reference(`$rel.${key}`));
    expect(relation("dealContacts")).toMatchObject({
      messagesOnSource: true,
      messagesOnTarget: false,
    });
    expect(relation("contactClient")).toMatchObject({
      messagesOnSource: false,
      messagesOnTarget: true,
    });
    expect(relation("projectClient")).toMatchObject({
      messagesOnSource: false,
      messagesOnTarget: false,
    });
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
    expect(stage?.behavior).toEqual({
      kind: "input",
      defaultValue: { kind: "select", value: "lead" },
    });
    const phase = prepared.model.fields.find((field) => field.id === reference("$field.project.phase"));
    expect(phase?.options.every((option) => option.attributes.length === 0)).toBe(true);
    expect(phase?.behavior).toEqual({ kind: "input" });
  });

  it("gives the options of a category field distinct colours when the plan paints them all alike", async () => {
    const plan = structuredClone(agencyPlan);
    const phase = plan.recordModel.fields.find((field) => field.key === "project.phase");
    if (!phase || !("options" in phase) || !phase.options) throw new Error("fixture has no project phase");
    phase.options = phase.options.map((option) => ({ ...option, color: "default" as const }));
    const { prepared, reference } = await build(plan);
    const compiled = prepared.model.fields.find((field) => field.id === reference("$field.project.phase"));
    expect(compiled?.options.map((option) => option.color)).toEqual([
      "info",
      "success",
      "warning",
      "secondary",
      "destructive",
    ]);
    const stage = prepared.model.fields.find((field) => field.id === reference("$field.deal.stage"));
    expect(stage?.options.map((option) => option.color)).toEqual([
      "secondary",
      "info",
      "info",
      "success",
      "destructive",
    ]);
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
    ).toMatchObject({
      targetTypeId: reference("$list.service"),
      sourceLabel: "Service",
      onTargetDelete: "cascade",
    });
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
      behavior: {
        kind: "rollup",
        expression: {
          relationId: toDeal,
          direction: "incoming",
          reducer: "sum",
        },
      },
    });
    expect(prepared.model.fields.find((field) => field.id === reference("$field.service.price"))).toMatchObject({
      label: "Price",
      valueType: "currency",
      required: true,
      behavior: {
        kind: "input",
        defaultValue: { kind: "decimal", value: "0", currency: "EUR" },
      },
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
      sortDescriptor: {
        field: resolver.field("deal.closeDate"),
        direction: "asc",
      },
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

  it("lays out four numbers, then three charts and two wider charts below them", () => {
    const [metric, chart] = [agencyPlan.dashboard.widgets[0], agencyPlan.dashboard.widgets[2]];
    const widgets = [
      chart,
      metric,
      { ...chart, key: "wide", size: "wide" as const },
      metric,
      metric,
      chart,
      metric,
      chart,
      chart,
    ];
    expect(setupDashboardLayouts(widgets, [{ x: 0, y: 0, w: 12, h: 3 }])).toEqual([
      { x: 0, y: 5, w: 4, h: 5 },
      { x: 0, y: 3, w: 3, h: 2 },
      { x: 0, y: 10, w: 6, h: 5 },
      { x: 3, y: 3, w: 3, h: 2 },
      { x: 6, y: 3, w: 3, h: 2 },
      { x: 4, y: 5, w: 4, h: 5 },
      { x: 9, y: 3, w: 3, h: 2 },
      { x: 8, y: 5, w: 4, h: 5 },
      { x: 6, y: 10, w: 6, h: 5 },
    ]);
  });

  it("fills every row when a dashboard has fewer or more widgets", () => {
    const [metric, chart] = [agencyPlan.dashboard.widgets[0], agencyPlan.dashboard.widgets[2]];
    expect(setupDashboardLayouts([metric, metric, chart, chart, chart, chart])).toEqual([
      { x: 0, y: 0, w: 6, h: 2 },
      { x: 6, y: 0, w: 6, h: 2 },
      { x: 0, y: 2, w: 6, h: 5 },
      { x: 6, y: 2, w: 6, h: 5 },
      { x: 0, y: 7, w: 6, h: 5 },
      { x: 6, y: 7, w: 6, h: 5 },
    ]);
    expect(setupDashboardLayouts([chart])).toEqual([{ x: 0, y: 0, w: 12, h: 5 }]);
    const many = setupDashboardLayouts([...Array(6).fill(metric), ...Array(6).fill(chart)]);
    expect(many.slice(0, 6).map(({ w }) => w)).toEqual([4, 4, 4, 4, 4, 4]);
    expect(many.slice(6).map(({ w }) => w)).toEqual([4, 4, 4, 4, 4, 4]);
    for (const [index, rect] of many.entries())
      for (const other of many.slice(index + 1)) expect(rectsOverlap(rect, other)).toBe(false);
  });

  it("creates the widgets in layout order and gives a wide chart one of the two wider places", async () => {
    const chart = agencyPlan.dashboard.widgets[2];
    const { plan, prepared, resolver } = await build({
      ...agencyPlan,
      dashboard: {
        ...agencyPlan.dashboard,
        widgets: [
          ...agencyPlan.dashboard.widgets,
          { ...chart, key: "secondChart", title: "Second chart" },
          { ...chart, key: "trend", title: "Trend", size: "wide" as const },
        ],
      },
    });
    const widgets = compileSetupDashboard(plan, resolver, prepared.model, {
      setupId: SETUP_ID,
      expectedRevision: prepared.model.revision,
    });
    if (!widgets.ok) throw new Error(JSON.stringify(widgets.issues));
    const layouts = widgets.data.map((widget) => widget.layout ?? { x: 0, y: 0, w: 0, h: 0 });
    expect(layouts).toEqual([...layouts].sort((a, b) => a.y - b.y || a.x - b.x));
    expect(widgets.data.map((widget) => widget.name).sort()).toEqual(
      plan.dashboard.widgets.map((widget) => widget.title).sort(),
    );
    expect(layouts.map(({ w }) => w)).toEqual([6, 6, 4, 4, 4, 6, 6]);
    expect(widgets.data.find((widget) => widget.name === "Trend")?.layout).toEqual({ x: 0, y: 7, w: 6, h: 5 });
  });

  it("puts the first ranked numbers on the top row", async () => {
    const { plan, prepared, resolver } = await build(agencyPlan);
    const widgets = compileSetupDashboard(plan, resolver, prepared.model, {
      setupId: SETUP_ID,
      expectedRevision: prepared.model.revision,
    });
    if (!widgets.ok) throw new Error(JSON.stringify(widgets.issues));
    expect(widgets.data.slice(0, 2).map((widget) => widget.layout)).toEqual([
      { x: 0, y: 0, w: 6, h: 2 },
      { x: 6, y: 0, w: 6, h: 2 },
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
    expect(widgets.data[2].displayOptions?.useGroupColors).toBe(false);
  });

  it("reports a widget whose display type does not fit its measure", async () => {
    const input = structuredClone(agencyPlan);
    input.dashboard.widgets = [{ ...agencyPlan.dashboard.widgets[2], display: DisplayType.number }];
    const { plan, prepared, resolver } = await build(input);
    const widgets = compileSetupDashboard(plan, resolver, prepared.model, {
      setupId: SETUP_ID,
      expectedRevision: 1,
    });
    expect(widgets).toEqual({
      ok: false,
      issues: [{ code: "display_mismatch", path: "dashboard.widgets.0.display" }],
    });
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

  it("compiles names onto the list's name field and an email column onto the people channels", async () => {
    const input = structuredClone(agencyPlan);
    input.importMapping = {
      list: "contact",
      columns: [
        { column: "Full name", field: "contact.name" },
        { column: "Email", field: "contact.channels" },
        { column: "Company", field: null },
      ],
    };
    const { plan, prepared, resolver } = await build(input);
    expect(compileSetupImportMapping(plan, resolver, prepared.model)).toEqual({
      ok: true,
      data: {
        typeId: resolver.list("contact"),
        columns: [
          { column: "Full name", fieldId: resolver.field("contact.name") },
          { column: "Email", fieldId: resolver.field("contact.channels") },
          { column: "Company", fieldId: null },
        ],
      },
    });
  });

  it("makes the fields of the list a spreadsheet fills optional, so missing cells and columns do not block rows", () => {
    const input = structuredClone(agencyPlan);
    input.importMapping = null;
    input.recordModel.fields = input.recordModel.fields.map((field) => ({
      ...field,
      required: true,
    }));
    const plan = SetupPlanSchema.parse(input);
    expect(setupImportList(plan)).toBe("contact");
    const relaxed = withOptionalImportFields(plan);
    expect(
      relaxed.recordModel.fields.filter((field) => field.required).map((field) => field.key.split(".")[0]),
    ).not.toContain("contact");
    expect(
      relaxed.recordModel.fields.filter((field) => field.key.startsWith("deal.")).every((field) => field.required),
    ).toBe(true);
    expect(
      setupImportList({
        ...plan,
        importMapping: {
          list: "organization",
          columns: [{ column: "Name", field: null }],
        },
      }),
    ).toBe("organization");
  });

  it("refuses a list default column of another list", () => {
    const input = structuredClone(agencyPlan);
    input.listDefaults[1] = {
      ...agencyPlan.listDefaults[1],
      columns: ["deal.closeDate"],
    };
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
