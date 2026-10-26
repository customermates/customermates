import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordMeasure } from "@/features/records/record-measure.schema";
import type { GenericRecordWidgetInput } from "@/features/widget/record-widget.schema";
import type { ChartColor } from "@/features/widget/widget-display.schema";
import type { GridRect } from "@/features/widget/widget-grid";
import type { SetupChartWidget, SetupPlan, SetupWidget } from "./setup-plan.schema";
import type { SetupCompileIssue, SetupCompileResult, SetupResolver } from "./setup-references";

import { recordMeasureIsValid } from "@/features/records/record-measure-validation";
import { CALENDAR_WIDGET_DEFAULT_DAYS } from "@/features/widget/record-calendar-widget.schema";
import { GenericRecordWidgetInputSchema } from "@/features/widget/record-widget.schema";
import { calendarWidgetQueryIssue, mapWidgetQueryIssue } from "@/features/widget/record-widget-query-validation";
import { widgetDisplayTypeIssue } from "@/features/widget/widget-display-rules";
import { DisplayType } from "@/features/widget/widget-display.schema";
import { structuredDashboardLayout } from "@/features/widget/widget-grid";

import { brandAccent } from "./brand-colors";
import { setupWidgetKind, setupWidgetSketch } from "./setup-plan.schema";
import { setupIdempotencyKey } from "./setup-references";

export function setupDashboardLayouts(widgets: readonly SetupWidget[], occupied: readonly GridRect[] = []): GridRect[] {
  return structuredDashboardLayout(
    widgets.map((widget) =>
      widget.kind === undefined || widget.kind === "chart"
        ? { metric: widget.display === DisplayType.number, wide: widget.size === "wide" }
        : { metric: false },
    ),
    occupied.reduce((bottom, rect) => Math.max(bottom, rect.y + rect.h), 0),
  );
}

export function setupWidgetCreationOrder<T extends { layout?: { x: number; y: number } }>(widgets: readonly T[]): T[] {
  return [...widgets].sort(
    (a, b) => (a.layout?.y ?? 0) - (b.layout?.y ?? 0) || (a.layout?.x ?? 0) - (b.layout?.x ?? 0),
  );
}

type SetupDashboardContext = {
  setupId: string;
  expectedRevision: number;
  brandChart?: ChartColor | null;
  occupied?: GridRect[];
  timeZone?: string;
};

const CALENDAR_QUERY_FIELDS: Record<string, string> = { dateFieldId: "dateField", amountFieldId: "amountField" };
const MAP_QUERY_FIELDS: Record<string, string> = {
  addressFieldId: "addressField",
  colorFieldId: "colorField",
  sizeFieldId: "sizeField",
  detailFieldId: "detailField",
};

export function compileSetupDashboard(
  plan: SetupPlan,
  resolver: SetupResolver,
  model: RecordModel,
  context: SetupDashboardContext,
): SetupCompileResult<GenericRecordWidgetInput[]> {
  const issues: SetupCompileIssue[] = [];
  const layouts = setupDashboardLayouts(plan.dashboard.widgets, context.occupied);
  const widgets: GenericRecordWidgetInput[] = [];
  plan.dashboard.widgets.forEach((widget, index) => {
    const path = `dashboard.widgets.${index}`;
    const before = issues.length;
    const missing = (code: string, at: string) => {
      issues.push({ code, path: `${path}.${at}` });
      return undefined;
    };
    const base = {
      expectedRevision: context.expectedRevision,
      idempotencyKey: setupIdempotencyKey(context.setupId, `widget:${widget.key}`),
      name: widget.title,
      isTemplate: plan.workspace.dashboardAudience !== "me",
      layout: layouts[index],
      viewId: null,
    };
    const push = (input: unknown) => {
      const parsed = GenericRecordWidgetInputSchema.safeParse(input);
      if (!parsed.success) return missing("invalid_widget", "key");
      widgets.push(parsed.data);
    };
    if (widget.kind === "activity") {
      return push({
        ...base,
        kind: "activityTimeline",
        activityQuery: { scope: { records: [], typeIds: [] }, kinds: ["message"] },
        displayOptions: { showFilters: true },
      });
    }
    const typeId = resolver.list(widget.list) ?? missing("unknown_list", "list");
    const field = (ref: string, at: string) => resolver.field(ref) ?? missing("unknown_field", at);
    const optionalField = (ref: string | null, at: string) => (ref ? (field(ref, at) ?? null) : null);
    const filters = widget.filters.flatMap((filter, position): RecordMeasure["source"]["filters"] => {
      const at = `filters.${position}`;
      const fieldId = field(filter.field, `${at}.field`);
      if (!fieldId) return [];
      if (filter.operator === "in" || filter.operator === "notIn") {
        const values = filter.options.flatMap((key, option) => {
          const id = resolver.option(filter.field, key) ?? missing("unknown_option", `${at}.options.${option}`);
          return id ? [{ kind: "select" as const, value: id }] : [];
        });
        return [{ fieldId, operator: filter.operator, value: null, values }];
      }
      if (filter.operator === "inLastDays" || filter.operator === "notInLastDays") {
        return [
          {
            fieldId,
            operator: filter.operator,
            value: {
              kind: "decimal",
              value: String(filter.days),
              currency: null,
            },
          },
        ];
      }
      return [{ fieldId, operator: filter.operator, value: null }];
    });
    const source = (id: string): RecordMeasure["source"] => ({
      typeId: id,
      filters,
      relationships: [],
      relatedFilters: [],
    });
    if (widget.kind === "calendar") {
      const dateFieldId = field(widget.dateField, "dateField");
      const amountFieldId = optionalField(widget.amountField, "amountField");
      if (!typeId || !dateFieldId || issues.length > before) return;
      const calendarQuery = {
        source: source(typeId),
        dateFieldId,
        layout: widget.layout,
        timeZone: context.timeZone ?? "UTC",
        days: CALENDAR_WIDGET_DEFAULT_DAYS,
        showOverdue: widget.layout === "upcoming",
        amountFieldId,
        aggregation: widget.layout === "month" && amountFieldId ? ("sum" as const) : ("count" as const),
      };
      const invalid = calendarWidgetQueryIssue(calendarQuery, model);
      if (invalid) return missing("invalid_widget", CALENDAR_QUERY_FIELDS[invalid.path[1]] ?? "list");
      return push({ ...base, kind: "calendar", calendarQuery, displayOptions: { showFilters: filters.length > 0 } });
    }
    if (widget.kind === "map") {
      const addressFieldId = field(widget.addressField, "addressField");
      const colorFieldId = optionalField(widget.colorField, "colorField");
      const sizeFieldId = optionalField(widget.sizeField, "sizeField");
      const detailFieldId = optionalField(widget.detailField, "detailField");
      if (!typeId || !addressFieldId || issues.length > before) return;
      const query = { source: source(typeId), addressFieldId, colorFieldId, sizeFieldId, detailFieldId };
      const invalid = mapWidgetQueryIssue(query, model);
      if (invalid) return missing("invalid_widget", MAP_QUERY_FIELDS[invalid.path[1]] ?? "list");
      return push({ ...base, kind: "map", mapQuery: query, displayOptions: { showFilters: filters.length > 0 } });
    }
    const chart: SetupChartWidget = widget;
    const valueFieldId = optionalField(chart.valueField, "valueField");
    const groupPath = (chart.groupBy?.path ?? []).flatMap((step, position) => {
      const relationId =
        resolver.relationship(step.relationship) ?? missing("unknown_relationship", `groupBy.path.${position}`);
      return relationId ? [{ relationId, direction: step.direction }] : [];
    });
    const groupField = optionalField(chart.groupBy?.field ?? null, "groupBy.field");
    if (!typeId || issues.length > before) return;
    const measure: RecordMeasure = {
      source: source(typeId),
      aggregation: chart.aggregation,
      valueFieldId,
      groupBy: chart.groupBy
        ? {
            path: groupPath,
            fieldId: groupField,
            ...(chart.groupBy.dateInterval ? { dateInterval: chart.groupBy.dateInterval } : {}),
          }
        : null,
      groupLimit: 100,
    };
    if (!recordMeasureIsValid(measure, model)) return missing("invalid_measure", "list");
    if (widgetDisplayTypeIssue(chart.display, measure, model)) return missing("display_mismatch", "display");
    return push({
      ...base,
      measure,
      displayOptions: {
        displayType: chart.display,
        ...(context.brandChart ? { barColors: [brandAccent(context.brandChart)] } : {}),
        useGroupColors: false,
        palette: "accent" as const,
      },
    });
  });
  return issues.length
    ? { ok: false, issues }
    : {
        ok: true,
        data: setupWidgetCreationOrder(widgets),
      };
}

export function setupDashboardShapeIssues(plan: SetupPlan): SetupCompileIssue[] {
  const widgets = plan.dashboard.widgets;
  const issues: SetupCompileIssue[] = [];
  const kinds = widgets.map((widget) =>
    setupWidgetSketch(widget) === DisplayType.number ? "number" : setupWidgetKind(widget),
  );
  const numbers = kinds.filter((kind) => kind === "number").length;
  if (numbers !== 4) issues.push({ code: "four_numbers", path: "dashboard.widgets" });
  if (widgets.length - numbers !== 6) issues.push({ code: "six_widgets", path: "dashboard.widgets" });
  const types = new Set(
    [...plan.recordModel.fields, ...plan.recordModel.calculations].map((field) => field.valueType as string),
  );
  if ((types.has("date") || types.has("dateTime")) && !kinds.includes("calendar"))
    issues.push({ code: "calendar_missing", path: "dashboard.widgets" });
  if (types.has("address") && !kinds.includes("map")) issues.push({ code: "map_missing", path: "dashboard.widgets" });
  return issues;
}
