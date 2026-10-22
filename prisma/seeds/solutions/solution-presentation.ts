import type { Filter } from "@/core/base/base-get.schema";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { RecordActivityQuery } from "@/ee/messaging/activities/record-activities.schema";
import type { RecordMeasure } from "@/features/records/record-measure.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordQuery } from "@/features/records/record-query.schema";
import type { Prisma } from "@/generated/prisma";

import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { presetId } from "@/features/records/crm-preset";
import { ChartColor, DisplayType } from "@/features/widget/widget-display.schema";
import { WidgetKind } from "@/generated/prisma";

import { dashboardLayouts, type WidgetDefinition } from "../dashboards-layout";
import { workspaceFixtureId } from "../helpers";
import type { SolutionContent, ViewSpec, WidgetFilterSpec } from "./define-solution";
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
    const state: DataViewState = {
      viewMode: view.mode === "board" ? ViewMode.card : ViewMode.table,
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
};

const KPI_HEIGHT = 2;

function widgetFilters(
  companyId: string,
  list: string,
  filters: readonly WidgetFilterSpec[] = [],
): RecordQuery["filters"] {
  return filters.map((filter) => ({
    fieldId: presetId(companyId, `${list}.${filter.field}`),
    operator: filter.notIn ? "notIn" : "in",
    value: null,
    values: optionIds(companyId, list, filter.field, filter.notIn ?? filter.in ?? []).map((value) => ({
      kind: "select" as const,
      value,
    })),
  }));
}

function valueField(companyId: string, list: string, field: string | undefined): string | null {
  return field ? presetId(companyId, `${list}.${field}`) : null;
}

/** The workspace's main dashboard: KPI cards in the first row, charts two to a row, the activity timeline last. */
export function buildSolutionWidgets(workspace: SolutionWorkspace, content: SolutionContent): SolutionWidgetRow[] {
  const { companyId } = workspace;
  const id = (key: string) => presetId(companyId, key);
  const definitions: WidgetDefinition[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const place = (w: number, h: number) => {
    if (x + w > 12) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    const rect = { x, y, w, h };
    x += w;
    rowHeight = Math.max(rowHeight, h);
    return rect;
  };
  for (const widget of content.dashboard.widgets) {
    if (widget.kind === "activity") {
      const activityQuery: RecordActivityQuery = {
        scope: { records: [], typeIds: [] },
        kinds: ["record", "audit", "configuration", "message", "activity", "calendar_event"],
        filters: [],
      };
      definitions.push({ kind: "activityTimeline", name: widget.title, activityQuery, lg: place(12, 6) });
      continue;
    }
    const source: RecordMeasure["source"] = {
      typeId: id(widget.list),
      filters: widgetFilters(companyId, widget.list, widget.filters),
      relationships: [],
      relatedFilters: [],
    };
    if (widget.kind === "kpi") {
      definitions.push({
        kind: "chart",
        name: widget.title,
        displayType: DisplayType.number,
        measure: {
          source,
          aggregation: widget.aggregation,
          valueFieldId: valueField(companyId, widget.list, widget.field),
          groupBy: null,
          groupLimit: 1000,
        },
        barColors: [ChartColor.primary1],
        useGroupColors: false,
        lg: place(3, KPI_HEIGHT),
      });
      continue;
    }
    const groupBy: NonNullable<RecordMeasure["groupBy"]> =
      "field" in widget.groupBy
        ? { path: [], fieldId: id(`${widget.list}.${widget.groupBy.field}`) }
        : "month" in widget.groupBy
          ? {
              path: [],
              fieldId: id(`${widget.list}.${widget.groupBy.month}`),
              dateInterval: "month",
              timeZone: "Europe/Berlin",
            }
          : "relation" in widget.groupBy
            ? { path: [{ relationId: id(widget.groupBy.relation), direction: "outgoing" }], fieldId: null }
            : { path: [], fieldId: null };
    const doughnut = widget.display === DisplayType.doughnutChart;
    definitions.push({
      kind: "chart",
      name: widget.title,
      displayType: widget.display,
      measure: {
        source,
        aggregation: widget.aggregation,
        valueFieldId: valueField(companyId, widget.list, widget.field),
        groupBy,
        groupLimit: 1000,
      },
      barColors: [
        ...(widget.colors ??
          (doughnut
            ? [
                ChartColor.primary1,
                ChartColor.secondary1,
                ChartColor.primary3,
                ChartColor.default1,
                ChartColor.default3,
              ]
            : [ChartColor.primary1])),
      ],
      useGroupColors: doughnut,
      lg: place(widget.width ?? 6, 7),
    });
  }
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
    if (widget.kind === "activityTimeline") {
      return {
        ...base,
        kind: WidgetKind.activityTimeline,
        displayOptions: { showFilters: true },
        activityQuery: widget.activityQuery as Prisma.InputJsonValue,
      };
    }
    return {
      ...base,
      kind: WidgetKind.chart,
      displayOptions: {
        barColors: widget.barColors,
        displayType: widget.displayType,
        reverseXAxis: false,
        reverseYAxis: false,
        showFilters: widget.measure.source.filters.length > 0,
        showLegend: widget.useGroupColors,
        useGroupColors: widget.useGroupColors,
      },
      measure: widget.measure as Prisma.InputJsonValue,
    };
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
