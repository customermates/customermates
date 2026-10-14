import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordMeasure } from "@/features/records/record-measure.schema";
import type { RecordWidgetInput } from "@/features/widget/record-widget.schema";
import type { ChartColor } from "@/features/widget/widget-display.schema";
import type { GridRect } from "@/features/widget/widget-grid";
import type { SetupPlan, SetupWidget } from "./setup-plan.schema";
import type { SetupCompileIssue, SetupCompileResult, SetupResolver } from "./setup-references";

import { recordMeasureIsValid } from "@/features/records/record-measure-validation";
import { RecordWidgetInputSchema } from "@/features/widget/record-widget.schema";
import { widgetDisplayTypeIssue } from "@/features/widget/widget-display-rules";
import { DisplayType } from "@/features/widget/widget-display.schema";
import { WIDGET_GRID_BREAKPOINT_COLUMNS, firstFreeSpot, widgetDefaultSize } from "@/features/widget/widget-grid";

import { setupIdempotencyKey } from "./setup-references";

const WIDGET_SIZES: Record<NonNullable<SetupWidget["size"]>, { w: number; h: number }> = {
  small: { w: 3, h: 4 },
  medium: { w: 4, h: 6 },
  large: { w: 6, h: 8 },
  wide: { w: 12, h: 6 },
};
const GRID_COLUMNS = WIDGET_GRID_BREAKPOINT_COLUMNS.lg;

function setupWidgetSize(widget: SetupWidget): { w: number; h: number } {
  const fallback = widgetDefaultSize("chart", widget.display);
  if (!widget.size) return fallback;
  const size = WIDGET_SIZES[widget.size];
  return widget.display === DisplayType.number ? { w: size.w, h: fallback.h } : size;
}

export type SetupDashboardContext = {
  setupId: string;
  expectedRevision: number;
  brandChart?: ChartColor | null;
  occupied?: GridRect[];
};

export function compileSetupDashboard(
  plan: SetupPlan,
  resolver: SetupResolver,
  model: RecordModel,
  context: SetupDashboardContext,
): SetupCompileResult<RecordWidgetInput[]> {
  const issues: SetupCompileIssue[] = [];
  const occupied: GridRect[] = [...(context.occupied ?? [])];
  const widgets: RecordWidgetInput[] = [];
  plan.dashboard.widgets.forEach((widget, index) => {
    const path = `dashboard.widgets.${index}`;
    const before = issues.length;
    const missing = (code: string, at: string) => {
      issues.push({ code, path: `${path}.${at}` });
      return undefined;
    };
    const typeId = resolver.list(widget.list) ?? missing("unknown_list", "list");
    const field = (ref: string, at: string) => resolver.field(ref) ?? missing("unknown_field", at);
    const valueFieldId = widget.valueField ? (field(widget.valueField, "valueField") ?? null) : null;
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
            value: { kind: "decimal", value: String(filter.days), currency: null },
          },
        ];
      }
      return [{ fieldId, operator: filter.operator, value: null }];
    });
    const groupPath = (widget.groupBy?.path ?? []).flatMap((step, position) => {
      const relationId =
        resolver.relationship(step.relationship) ?? missing("unknown_relationship", `groupBy.path.${position}`);
      return relationId ? [{ relationId, direction: step.direction }] : [];
    });
    const groupField = widget.groupBy?.field ? (field(widget.groupBy.field, "groupBy.field") ?? null) : null;
    if (!typeId || issues.length > before) return;
    const measure: RecordMeasure = {
      source: { typeId, filters, relationships: [], relatedFilters: [] },
      aggregation: widget.aggregation,
      valueFieldId,
      groupBy: widget.groupBy
        ? {
            path: groupPath,
            fieldId: groupField,
            ...(widget.groupBy.dateInterval ? { dateInterval: widget.groupBy.dateInterval } : {}),
          }
        : null,
      groupLimit: 100,
    };
    if (!recordMeasureIsValid(measure, model)) return missing("invalid_measure", "list");
    if (widgetDisplayTypeIssue(widget.display, measure, model)) return missing("display_mismatch", "display");
    const choice = groupField ? model.fields.find((candidate) => candidate.id === groupField) : undefined;
    const size = setupWidgetSize(widget);
    const spot = firstFreeSpot(occupied, GRID_COLUMNS, size.w, size.h);
    const layout = { ...spot, w: Math.min(size.w, GRID_COLUMNS), h: size.h };
    occupied.push(layout);
    const input = {
      expectedRevision: context.expectedRevision,
      idempotencyKey: setupIdempotencyKey(context.setupId, `widget:${widget.key}`),
      name: widget.title,
      measure,
      displayOptions: {
        displayType: widget.display,
        ...(context.brandChart ? { barColors: [context.brandChart] } : {}),
        ...(choice?.valueType === "select" ? { useGroupColors: true } : {}),
      },
      isTemplate: plan.workspace.dashboardAudience !== "me",
      layout,
      viewId: null,
    };
    const parsed = RecordWidgetInputSchema.safeParse(input);
    if (!parsed.success) return missing("invalid_widget", "key");
    widgets.push(parsed.data);
  });
  return issues.length ? { ok: false, issues } : { ok: true, data: widgets };
}
