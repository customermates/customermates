import type { Filter } from "@/core/base/base-get.schema";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { RecordMeasure } from "@/features/records/record-measure.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordQuery } from "@/features/records/record-query.schema";
import type { Prisma } from "@/generated/prisma";

import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { presetId } from "@/features/records/crm-preset";
import { ChartColor, DisplayType } from "@/features/widget/widget-display.schema";
import { structuredDashboardLayout } from "@/features/widget/widget-grid";
import { WidgetKind } from "@/generated/prisma";

import { dashboardLayouts, type WidgetDefinition } from "../dashboards-layout";
import { workspaceFixtureId } from "../helpers";
import type { SolutionContent, ViewSpec, WidgetFilterSpec, WidgetGroupSpec } from "./define-solution";
import type { SolutionWorkspace } from "./solution-workspaces";

export const SOLUTION_VIEW_GROUP = "1f100000";
export const SOLUTION_WIDGET_GROUP = "15000000";
export const SOLUTION_WIKI_GROUP = "36000000";

const SYSTEM_COLUMNS = ["system:assignedTo", "system:createdAt", "system:updatedAt"];

/** Every column of a list: fields except the primary one, both relationship ends, paths and the system columns. */
export function listColumns(model: RecordModel, typeId: string): string[] {
  const type = model.types.find((candidate) => candidate.id === typeId);
  if (!type) throw new Error(`Unknown list ${typeId}`);
  return [
    ...model.fields
      .filter((field) => field.typeId === typeId && !field.archived && field.id !== type.primaryFieldId)
      .map((field) => field.id),
    ...model.relationships.flatMap((relation) => [
      ...(relation.sourceTypeId === typeId ? [`relationship:${relation.id}:outgoing`] : []),
      ...(relation.targetTypeId === typeId ? [`relationship:${relation.id}:incoming`] : []),
    ]),
    ...(type.relationshipPaths ?? []).map((path) => `path:${path.id}`),
    ...SYSTEM_COLUMNS,
  ];
}

function columnKey(companyId: string, model: RecordModel, list: string, token: string): string {
  const id = (key: string) => presetId(companyId, key);
  if (token.startsWith("system:")) return token;
  const relation = model.relationships.find((candidate) => candidate.id === id(token));
  if (relation) return `relationship:${relation.id}:${relation.sourceTypeId === id(list) ? "outgoing" : "incoming"}`;
  const field =
    model.fields.find((candidate) => candidate.id === id(`${list}.${token}`)) ??
    model.fields.find((candidate) => candidate.id === id(token) && candidate.typeId === id(list));
  if (!field) throw new Error(`Unknown column ${token} of ${list}`);
  return field.id;
}

function optionIds(companyId: string, list: string, field: string, keys: readonly string[]): string[] {
  return keys.map((key) => presetId(companyId, `${list}.${field}.${key}`));
}

export type SolutionViewRow = {
  id: string;
  userId: string;
  surfaceKey: string;
  name: string;
  position: number;
  state: DataViewState;
};

export function buildSolutionViews(
  workspace: SolutionWorkspace,
  content: SolutionContent,
  model: RecordModel,
): SolutionViewRow[] {
  const { companyId } = workspace;
  const id = (key: string) => presetId(companyId, key);
  const positions = new Map<string, number>();
  return content.views.map((view: ViewSpec, index) => {
    const typeId = id(view.list);
    const visible = view.columns.map((token) => columnKey(companyId, model, view.list, token));
    const hidden = listColumns(model, typeId).filter((column) => !visible.includes(column));
    const groupField = view.groupBy ? columnKey(companyId, model, view.list, view.groupBy) : null;
    const money = visible.filter(
      (column) => model.fields.find((field) => field.id === column)?.valueType === "currency",
    );
    const filters: Filter[] = (view.filters ?? []).map((filter) => ({
      field: columnKey(companyId, model, view.list, filter.field),
      operator: filter.notIn ? FilterOperatorKey.notIn : FilterOperatorKey.in,
      value: optionIds(companyId, view.list, filter.field, filter.notIn ?? filter.in ?? []),
    }));
    const surfaceKey = `records:${typeId}`;
    const position = positions.get(surfaceKey) ?? 0;
    positions.set(surfaceKey, position + 1);
    if ((view.mode === "calendar") !== Boolean(view.calendar))
      throw new Error(`${workspace.slug}: view ${view.key} needs a calendar exactly when it is a calendar`);
    const calendar = view.calendar
      ? {
          dateFieldId: columnKey(companyId, model, view.list, view.calendar.date),
          ...(view.calendar.end ? { endDateFieldId: columnKey(companyId, model, view.list, view.calendar.end) } : {}),
          ...(view.calendar.color ? { colorFieldId: columnKey(companyId, model, view.list, view.calendar.color) } : {}),
          mode: view.calendar.mode,
        }
      : null;
    const state: DataViewState = {
      viewMode: view.mode === "board" ? ViewMode.card : view.mode === "calendar" ? ViewMode.calendar : ViewMode.table,
      ...(calendar ? { calendar } : {}),
      ...(groupField
        ? {
            grouping: {
              field: groupField,
              ...(money.length
                ? { summaries: money.slice(0, 2).map((fieldId) => ({ fieldId, aggregation: "sum" as const })) }
                : {}),
            },
          }
        : {}),
      columnOrder: visible,
      hiddenColumns: hidden,
      ...(filters.length ? { filters } : {}),
      ...(view.sort
        ? {
            sortDescriptor: {
              field: columnKey(companyId, model, view.list, view.sort.field),
              direction: view.sort.direction,
            },
          }
        : {}),
    };
    return {
      id: workspaceFixtureId(SOLUTION_VIEW_GROUP, workspace.tag, index + 1),
      userId: workspace.memberId,
      surfaceKey,
      name: view.name,
      position,
      state,
    };
  });
}

export type SolutionWidgetRow = {
  id: string;
  companyId: string;
  userId: string;
  viewId: null;
  name: string;
  kind: WidgetKind;
  displayOptions: Prisma.InputJsonValue;
  isTemplate: boolean;
  layout: Prisma.InputJsonValue;
  measure?: Prisma.InputJsonValue;
  activityQuery?: Prisma.InputJsonValue;
  calendarQuery?: Prisma.InputJsonValue;
  mapQuery?: Prisma.InputJsonValue;
};

/** One accent hue per solution: every widget of its dashboards uses that hue, multi-value charts its shades. */
const SOLUTION_ACCENTS: Record<SolutionWorkspace["solution"]["id"], ChartColor> = {
  smb: ChartColor.primary1,
  consultants: ChartColor.info1,
  agencies: ChartColor.violet1,
  freelancers: ChartColor.secondary1,
  startups: ChartColor.success1,
  "client-management": ChartColor.secondary1,
  "sales-pipeline": ChartColor.primary1,
  "linkedin-crm": ChartColor.info1,
  "whatsapp-crm": ChartColor.success1,
};

const DASHBOARD_SHAPE = { kpi: 4, chart: 6 } as const;

function fieldKey(companyId: string, list: string, field: string): string {
  return field.startsWith("system:") ? field : presetId(companyId, `${list}.${field}`);
}

function days(count: number) {
  return { kind: "decimal" as const, value: String(count), currency: null };
}

function widgetFilters(
  companyId: string,
  list: string,
  filters: readonly WidgetFilterSpec[] = [],
): RecordQuery["filters"] {
  return filters.map((filter) => {
    const fieldId = fieldKey(companyId, list, filter.field);
    if (filter.withinDays !== undefined)
      return { fieldId, operator: "inLastDays" as const, value: days(filter.withinDays) };
    if (filter.olderThanDays !== undefined)
      return { fieldId, operator: "notInLastDays" as const, value: days(filter.olderThanDays) };
    if (filter.empty) return { fieldId, operator: "empty" as const, value: null };
    return {
      fieldId,
      operator: filter.notIn ? ("notIn" as const) : ("in" as const),
      value: null,
      values: optionIds(companyId, list, filter.field, filter.notIn ?? filter.in ?? []).map((value) => ({
        kind: "select" as const,
        value,
      })),
    };
  });
}

function widgetGroupBy(
  companyId: string,
  list: string,
  group: WidgetGroupSpec,
  timeZone: string,
): NonNullable<RecordMeasure["groupBy"]> {
  if ("month" in group) {
    return {
      path: [],
      fieldId: fieldKey(companyId, list, group.month),
      dateInterval: "month",
      timeZone,
    };
  }
  if ("relation" in group) {
    return {
      path: [{ relationId: presetId(companyId, group.relation), direction: "outgoing" }],
      fieldId: group.field ? presetId(companyId, group.field) : null,
    };
  }
  if ("field" in group) return { path: [], fieldId: fieldKey(companyId, list, group.field) };
  if ("assignee" in group) return { path: [], fieldId: "system:assignedTo" };
  return { path: [], fieldId: null };
}

/**
 * The workspace's main dashboard in its fixed shape: four number cards in the first row and three widgets in each of
 * the second and third, every row filling the grid at one height. Charts, calendars and maps use the
 * workspace's accent hue and time zone.
 */
export function buildSolutionWidgets(workspace: SolutionWorkspace, content: SolutionContent): SolutionWidgetRow[] {
  const { companyId } = workspace;
  const accent = SOLUTION_ACCENTS[workspace.solution.id];
  const widgets = content.dashboard.widgets;
  const shape = widgets.map((widget) => (widget.kind === "kpi" ? "kpi" : "chart")).join(",");
  const expected = [
    ...Array<string>(DASHBOARD_SHAPE.kpi).fill("kpi"),
    ...Array<string>(DASHBOARD_SHAPE.chart).fill("chart"),
  ].join(",");
  if (shape !== expected) throw new Error(`${workspace.slug}: the dashboard needs four kpi then six other widgets`);
  const rects = structuredDashboardLayout(widgets.map((widget) => ({ metric: widget.kind === "kpi" })));
  const source = (list: string, filters?: readonly WidgetFilterSpec[]): RecordMeasure["source"] => ({
    typeId: presetId(companyId, list),
    filters: widgetFilters(companyId, list, filters),
    relationships: [],
    relatedFilters: [],
  });
  const definitions: WidgetDefinition[] = widgets.map((widget, index): WidgetDefinition => {
    const lg = rects[index];
    switch (widget.kind) {
      case "calendar":
        return {
          kind: "calendar",
          name: widget.title,
          calendarQuery: {
            source: source(widget.list, widget.filters),
            dateFieldId: fieldKey(companyId, widget.list, widget.date),
            layout: widget.layout,
            timeZone: content.timeZone,
            days: widget.days ?? 14,
            showOverdue: widget.overdue ?? widget.layout === "upcoming",
            amountFieldId: widget.amount ? fieldKey(companyId, widget.list, widget.amount) : null,
            aggregation: widget.layout === "month" && widget.amount ? "sum" : "count",
          },
          lg,
        };
      case "map":
        return {
          kind: "map",
          name: widget.title,
          mapQuery: {
            source: source(widget.list, widget.filters),
            addressFieldId: fieldKey(companyId, widget.list, widget.address),
            colorFieldId: widget.color ? fieldKey(companyId, widget.list, widget.color) : null,
            sizeFieldId: widget.size ? fieldKey(companyId, widget.list, widget.size) : null,
            detailFieldId: widget.detail ? fieldKey(companyId, widget.list, widget.detail) : null,
          },
          lg,
        };
      case "activity":
        return {
          kind: "activityTimeline",
          name: widget.title,
          activityQuery: {
            scope: { records: [], typeIds: [] },
            kinds: ["message"],
            ...(widget.providers?.length
              ? { filters: [{ kind: "provider" as const, operator: "in" as const, values: [...widget.providers] }] }
              : {}),
          },
          lg,
        };
      default:
        return {
          kind: "chart",
          name: widget.title,
          displayType: widget.kind === "kpi" ? DisplayType.number : widget.display,
          measure: {
            source: source(widget.list, widget.filters),
            aggregation: widget.aggregation,
            valueFieldId: widget.field ? fieldKey(companyId, widget.list, widget.field) : null,
            groupBy:
              widget.kind === "kpi" ? null : widgetGroupBy(companyId, widget.list, widget.groupBy, content.timeZone),
            groupLimit: 1000,
          },
          barColors: [accent],
          useGroupColors: false,
          lg,
        };
    }
  });
  const ids = definitions.map((_, index) => workspaceFixtureId(SOLUTION_WIDGET_GROUP, workspace.tag, index + 1));
  const layouts = dashboardLayouts(ids, definitions);
  return definitions.map((widget, index) => {
    const base = {
      id: ids[index],
      companyId,
      userId: workspace.memberId,
      viewId: null,
      name: widget.name,
      isTemplate: false,
      layout: layouts[index] as Prisma.InputJsonValue,
    };
    switch (widget.kind) {
      case "calendar":
        return {
          ...base,
          kind: WidgetKind.calendar,
          displayOptions: { showFilters: widget.calendarQuery.source.filters.length > 0 },
          calendarQuery: widget.calendarQuery as Prisma.InputJsonValue,
        };
      case "map":
        return {
          ...base,
          kind: WidgetKind.map,
          displayOptions: { showFilters: widget.mapQuery.source.filters.length > 0 },
          mapQuery: widget.mapQuery as Prisma.InputJsonValue,
        };
      case "activityTimeline":
        return {
          ...base,
          kind: WidgetKind.activityTimeline,
          displayOptions: { showFilters: true },
          activityQuery: widget.activityQuery as Prisma.InputJsonValue,
        };
      default:
        return {
          ...base,
          kind: WidgetKind.chart,
          displayOptions: {
            barColors: widget.barColors,
            displayType: widget.displayType,
            reverseXAxis: false,
            reverseYAxis: false,
            showFilters: widget.measure.source.filters.length > 0,
            showLegend: widget.displayType === DisplayType.doughnutChart,
            useGroupColors: widget.useGroupColors,
            palette: "accent",
          },
          measure: widget.measure as Prisma.InputJsonValue,
        };
    }
  });
}

export type SolutionWikiRow = {
  id: string;
  title: string;
  kind: "guide" | "knowledge" | "procedure";
  whenToUse: string | null;
  sortOrder: number;
  markdown: string;
};

export function buildSolutionWiki(workspace: SolutionWorkspace, content: SolutionContent): SolutionWikiRow[] {
  if (content.wiki.filter((page) => page.kind === "guide").length !== 1)
    throw new Error(`${workspace.slug}: the wiki needs exactly one guide`);
  return content.wiki.map((page, index) => ({
    id: workspaceFixtureId(SOLUTION_WIKI_GROUP, workspace.tag, index + 1),
    title: page.title,
    kind: page.kind,
    whenToUse: page.kind === "procedure" ? (page.whenToUse ?? null) : null,
    sortOrder: page.kind === "guide" ? -1 : index,
    markdown: page.markdown.join("\n"),
  }));
}
