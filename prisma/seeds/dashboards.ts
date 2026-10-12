import type { RecordActivityQuery } from "@/ee/messaging/activities/record-activities.schema";
import type { RecordMeasure, RecordMeasureDateInterval } from "@/features/records/record-measure.schema";
import type { RecordQuery } from "@/features/records/record-query.schema";
import type { WidgetLayout } from "@/features/widget/widget-display.schema";

import { ChartColor, DisplayType } from "@/features/widget/widget-display.schema";
import { firstFreeSpot, type GridRect } from "@/features/widget/widget-grid";

import type { CustomFieldSeedData } from "./custom-fields";
import { SYNTHETIC_DASHBOARD_VIEW_IDS } from "./data-view-ids";
import { fixtureId } from "./helpers";
import { northwindModelIds } from "./northwind-model";

export const SYNTHETIC_WIDGET_ID_PREFIX = "15000000";

type Filter = RecordQuery["filters"][number];
type Relationship = RecordQuery["relationships"][number];
type PathStep = { relationId: string; direction: "outgoing" | "incoming" };

/** Dashboards in tab order; the first is the main dashboard. Widget ids derive from this order. */
export const SYNTHETIC_DASHBOARD_KEYS = ["sales", "revenue", "support", "marketing", "teamActivity", "hiring"] as const;
export type DashboardKey = (typeof SYNTHETIC_DASHBOARD_KEYS)[number];

export type ChartWidgetDefinition = {
  kind: "chart";
  name: string;
  displayType: DisplayType;
  measure: RecordMeasure;
  barColors: ChartColor[];
  useGroupColors: boolean;
  lg: GridRect;
};

export type ActivityWidgetDefinition = {
  kind: "activityTimeline";
  name: string;
  activityQuery: RecordActivityQuery;
  lg: GridRect;
};

export type WidgetDefinition = ChartWidgetDefinition | ActivityWidgetDefinition;

export type DashboardDefinition = {
  key: DashboardKey;
  /** The dashboard view, or null for the main dashboard. */
  viewId: string | null;
  name: string;
  widgets: WidgetDefinition[];
};

/** The main dashboard: its widgets have no view, so /en/dashboard opens on it. */
export const SYNTHETIC_MAIN_DASHBOARD = "sales" satisfies DashboardKey;

const BREAKPOINTS = { md: 8, sm: 4, xs: 2 } as const;

function narrowWidth(width: number, columns: number): number {
  if (columns === BREAKPOINTS.md) return width <= 4 ? 4 : 8;
  if (columns === BREAKPOINTS.sm) return width <= 3 ? 2 : 4;
  return 2;
}

/**
 * Layouts for every breakpoint: the desktop grid as authored, and narrower grids that keep the reading order
 * (row by row, left to right) and pack the widgets into the first free spot at a width that fits.
 */
export function dashboardLayouts(ids: string[], widgets: WidgetDefinition[]): WidgetLayout[] {
  const order = widgets
    .map((widget, index) => ({ widget, index }))
    .sort((left, right) => left.widget.lg.y - right.widget.lg.y || left.widget.lg.x - right.widget.lg.x);
  const layouts: WidgetLayout[] = widgets.map((widget, index) => ({ lg: { i: ids[index], ...widget.lg } }));
  for (const [breakpoint, columns] of Object.entries(BREAKPOINTS) as Array<[keyof typeof BREAKPOINTS, number]>) {
    const placed: GridRect[] = [];
    for (const { widget, index } of order) {
      const w = narrowWidth(widget.lg.w, columns);
      const rect = { ...firstFreeSpot(placed, columns, w, widget.lg.h), w, h: widget.lg.h };
      placed.push(rect);
      layouts[index][breakpoint] = { i: ids[index], ...rect };
    }
  }
  return layouts;
}

export function dashboardWidgetId(dashboard: DashboardKey, index: number): string {
  const offset = SYNTHETIC_DASHBOARD_KEYS.indexOf(dashboard) + 1;
  return fixtureId(SYNTHETIC_WIDGET_ID_PREFIX, offset * 100 + index + 1);
}

/**
 * The six Northwind Labs dashboards. Together they use every display type (number, vertical and horizontal
 * bars with and without labels, doughnut, radar, area, ranked table and funnel), count, sum, average, min and max,
 * day, week, month and quarter intervals, grouping by choice, member, date, related record and a field across a relationship, source,
 * relationship and group filters, and activity timelines.
 */
export function buildSyntheticDashboards(
  companyId: string,
  customFields: Pick<CustomFieldSeedData, "customFieldIds" | "customOptionIds">,
): DashboardDefinition[] {
  const { types, fields: f, options: o, relationships: r, starter } = northwindModelIds(companyId);
  const { customFieldIds, customOptionIds } = customFields;

  const choice = (fieldId: string, values: string[], operator: "in" | "notIn" = "in"): Filter => ({
    fieldId,
    operator,
    value: null,
    values: values.map((value) => ({ kind: "select", value })),
  });
  const days = (fieldId: string, count: number, operator: "inLastDays" | "notInLastDays" = "inLastDays"): Filter => ({
    fieldId,
    operator,
    value: { kind: "decimal", value: String(count), currency: null },
  });
  const isTrue = (fieldId: string): Filter => ({ fieldId, operator: "eq", value: { kind: "boolean", value: true } });
  const notEmpty = (fieldId: string): Filter => ({ fieldId, operator: "notEmpty", value: null });
  const linked = (relationId: string, direction: PathStep["direction"]): Relationship => ({
    relationId,
    direction,
    operator: "any",
    recordIds: null,
  });
  const source = (
    type: keyof typeof types,
    filters: Filter[] = [],
    relationships: Relationship[] = [],
  ): RecordMeasure["source"] => ({ typeId: types[type], filters, relationships, relatedFilters: [] });
  const step = (relationId: string, direction: PathStep["direction"] = "outgoing"): PathStep => ({
    relationId,
    direction,
  });

  type Grouping = NonNullable<RecordMeasure["groupBy"]>;
  const byField = (fieldId: string, extra: Partial<Grouping> = {}): Grouping => ({ path: [], fieldId, ...extra });
  const byDate = (fieldId: string, dateInterval: RecordMeasureDateInterval): Grouping => ({
    path: [],
    fieldId,
    dateInterval,
    timeZone: "Europe/Berlin",
  });
  const byRecord = (path: PathStep[], filter?: Grouping["filter"]): Grouping => ({
    path,
    fieldId: null,
    ...(filter ? { filter } : {}),
  });

  const measure = (
    src: RecordMeasure["source"],
    aggregation: RecordMeasure["aggregation"],
    valueFieldId: string | null,
    groupBy: Grouping | null = null,
  ): RecordMeasure => ({ source: src, aggregation, valueFieldId, groupBy, groupLimit: 1000 });

  const chart = (
    name: string,
    displayType: DisplayType,
    m: RecordMeasure,
    lg: GridRect,
    colors: ChartColor[],
    useGroupColors = false,
  ): ChartWidgetDefinition => ({ kind: "chart", name, displayType, measure: m, barColors: colors, useGroupColors, lg });
  const kpi = (name: string, m: RecordMeasure, x: number, color: ChartColor) =>
    chart(name, DisplayType.number, m, { x, y: 0, w: 3, h: 3 }, [color]);
  const activity = (name: string, sources: RecordActivityQuery["kinds"], lg: GridRect): ActivityWidgetDefinition => ({
    kind: "activityTimeline",
    name,
    lg,
    activityQuery: {
      scope: { records: [], typeIds: [] },
      kinds: ["record", "audit", "configuration", "message", "activity", "calendar_event"],
      filters: [{ kind: "source", operator: "in", values: sources }],
    },
  });

  const C = ChartColor;
  const stage = o["deal.stage"];
  const openStages = [stage.new, stage.qualified, stage.proposal];
  const openDeals = choice(f.deal.stage, openStages);
  const wonDeals = choice(f.deal.stage, [stage.won]);
  const ticketStatus = o["ticket.status"];
  const openTickets = choice(f.ticket.status, [ticketStatus.new, ticketStatus.open, ticketStatus.waitingOnCustomer]);
  const openTasks = choice(
    customFieldIds.taskStatus,
    [customOptionIds.taskStatus.done, customOptionIds.taskStatus.archived],
    "notIn",
  );
  const candidateStage = o["candidate.stage"];
  const activeCandidates = choice(f.candidate.stage, [
    candidateStage.applied,
    candidateStage.screening,
    candidateStage.interview,
    candidateStage.caseTask,
    candidateStage.offer,
  ]);
  const openRoles = choice(f.openRole.status, [o["openRole.status"].open]);

  const sales: WidgetDefinition[] = [
    kpi("Open pipeline", measure(source("deal", [openDeals]), "sum", starter.dealTotalValue), 0, C.primary1),
    kpi("Weighted forecast", measure(source("deal", [openDeals]), "sum", starter.dealWeightedValue), 3, C.primary2),
    kpi(
      "Won in the last 90 days",
      measure(source("deal", [wonDeals, days(f.deal.closeDate, 90)]), "sum", starter.dealTotalValue),
      6,
      C.success1,
    ),
    kpi("Largest open deal", measure(source("deal", [openDeals]), "max", starter.dealTotalValue), 9, C.success2),
    chart(
      "Open pipeline by stage",
      DisplayType.verticalBarChartWithLabels,
      measure(source("deal", [openDeals]), "sum", starter.dealTotalValue, byField(f.deal.stage)),
      { x: 0, y: 3, w: 5, h: 8 },
      [C.primary1, C.primary2, C.primary3],
      true,
    ),
    chart(
      "Weighted forecast by close month",
      DisplayType.verticalBarChartWithLabels,
      measure(source("deal", [openDeals]), "sum", starter.dealWeightedValue, byDate(f.deal.closeDate, "month")),
      { x: 5, y: 3, w: 7, h: 8 },
      [C.primary1],
    ),
    chart(
      "Won revenue by month",
      DisplayType.areaChart,
      measure(
        source("deal", [wonDeals, days(f.deal.closeDate, 365)]),
        "sum",
        starter.dealTotalValue,
        byDate(f.deal.closeDate, "month"),
      ),
      { x: 0, y: 11, w: 6, h: 8 },
      [C.success1],
    ),
    chart(
      "Won vs lost, last 12 months",
      DisplayType.doughnutChart,
      measure(
        source("deal", [choice(f.deal.stage, [stage.won, stage.lost]), days(f.deal.closeDate, 365)]),
        "count",
        null,
        byField(f.deal.stage),
      ),
      { x: 6, y: 11, w: 3, h: 8 },
      [C.success1, C.danger1],
      true,
    ),
    chart(
      "Won revenue per rep",
      DisplayType.horizontalBarChartWithLabels,
      measure(
        source("deal", [wonDeals, days(f.deal.closeDate, 365)]),
        "sum",
        starter.dealTotalValue,
        byField("system:assignedTo"),
      ),
      { x: 9, y: 11, w: 3, h: 8 },
      [C.primary1, C.primary2, C.primary3, C.secondary1, C.secondary2],
    ),
    chart(
      "Top open deals",
      DisplayType.rankedTable,
      measure(source("deal", [openDeals]), "sum", starter.dealTotalValue, byRecord([])),
      { x: 0, y: 19, w: 6, h: 8 },
      [C.primary1],
    ),
    chart(
      "Lost deals by reason",
      DisplayType.horizontalBarChart,
      measure(
        source("deal", [choice(f.deal.stage, [stage.lost]), days(f.deal.closeDate, 365)]),
        "count",
        null,
        byField(f.deal.lostReason),
      ),
      { x: 6, y: 19, w: 3, h: 8 },
      [C.danger1],
    ),
    chart(
      "Open pipeline by segment",
      DisplayType.doughnutChart,
      measure(
        source("deal", [openDeals], [linked(starter.dealOrganizations, "outgoing")]),
        "sum",
        starter.dealTotalValue,
        { path: [step(starter.dealOrganizations)], fieldId: f.organization.segment },
      ),
      { x: 9, y: 19, w: 3, h: 8 },
      [C.secondary1, C.primary1, C.success1],
      true,
    ),
  ];

  const health = o["subscription.health"];
  const revenue: WidgetDefinition[] = [
    kpi("Total ARR", measure(source("subscription"), "sum", f.subscription.arr), 0, C.success1),
    kpi("Licensed seats", measure(source("subscription"), "sum", f.subscription.seats), 3, C.primary1),
    kpi(
      "ARR at risk",
      measure(source("subscription", [choice(f.subscription.health, [health.atRisk])]), "sum", f.subscription.arr),
      6,
      C.danger1,
    ),
    kpi(
      "Expansion won in 12 months",
      measure(
        source("deal", [
          wonDeals,
          choice(f.deal.dealType, [o["deal.dealType"].expansion]),
          days(f.deal.closeDate, 365),
        ]),
        "sum",
        starter.dealTotalValue,
      ),
      9,
      C.success2,
    ),
    chart(
      "ARR by plan",
      DisplayType.doughnutChart,
      measure(source("subscription"), "sum", f.subscription.arr, byField(f.subscription.plan)),
      { x: 0, y: 3, w: 4, h: 8 },
      [C.secondary1, C.primary1, C.success1],
      true,
    ),
    chart(
      "ARR by segment",
      DisplayType.verticalBarChartWithLabels,
      measure(source("subscription"), "sum", f.subscription.arr, {
        path: [step(r.subscriptionOrganization)],
        fieldId: f.organization.segment,
      }),
      { x: 4, y: 3, w: 4, h: 8 },
      [C.secondary1, C.primary1, C.success1],
      true,
    ),
    chart(
      "ARR by health",
      DisplayType.horizontalBarChartWithLabels,
      measure(source("subscription"), "sum", f.subscription.arr, byField(f.subscription.health)),
      { x: 8, y: 3, w: 4, h: 8 },
      [C.success1, C.warning1, C.danger1],
      true,
    ),
    chart(
      "Upcoming renewals by month",
      DisplayType.verticalBarChart,
      measure(
        source("subscription", [days(f.subscription.renewalDate, 1)]),
        "sum",
        f.subscription.arr,
        byDate(f.subscription.renewalDate, "month"),
      ),
      { x: 0, y: 11, w: 6, h: 8 },
      [C.warning1],
    ),
    chart(
      "New ARR by start quarter",
      DisplayType.areaChart,
      measure(source("subscription"), "sum", f.subscription.arr, byDate(f.subscription.startDate, "quarter")),
      { x: 6, y: 11, w: 6, h: 8 },
      [C.success1],
    ),
    chart(
      "Top accounts by ARR",
      DisplayType.rankedTable,
      measure(source("subscription"), "sum", f.subscription.arr, byRecord([step(r.subscriptionOrganization)])),
      { x: 0, y: 19, w: 6, h: 8 },
      [C.success1],
    ),
    chart(
      "ARR by industry",
      DisplayType.radarChart,
      measure(source("subscription"), "sum", f.subscription.arr, byField(f.subscription.industry)),
      { x: 6, y: 19, w: 6, h: 8 },
      [C.primary1],
    ),
  ];

  const support: WidgetDefinition[] = [
    kpi("Open tickets", measure(source("ticket", [openTickets]), "count", null), 0, C.warning1),
    kpi(
      "Urgent or high and open",
      measure(
        source("ticket", [
          openTickets,
          choice(f.ticket.priority, [o["ticket.priority"].urgent, o["ticket.priority"].high]),
        ]),
        "count",
        null,
      ),
      3,
      C.danger1,
    ),
    kpi("SLA breaches", measure(source("ticket", [isTrue(f.ticket.overdue)]), "count", null), 6, C.danger2),
    kpi(
      "Longest SLA breach in days",
      measure(source("ticket", [isTrue(f.ticket.overdue)]), "max", f.ticket.daysOverSla),
      9,
      C.warning2,
    ),
    chart(
      "Open tickets by priority",
      DisplayType.verticalBarChartWithLabels,
      measure(source("ticket", [openTickets]), "count", null, byField(f.ticket.priority)),
      { x: 0, y: 3, w: 4, h: 8 },
      [C.secondary1, C.primary1, C.warning1, C.danger1],
      true,
    ),
    chart(
      "Tickets by category",
      DisplayType.doughnutChart,
      measure(source("ticket"), "count", null, byField(f.ticket.category)),
      { x: 4, y: 3, w: 4, h: 8 },
      [C.primary1, C.warning1, C.secondary1, C.default1, C.success1, C.danger1],
      true,
    ),
    chart(
      "Open tickets per assignee",
      DisplayType.horizontalBarChartWithLabels,
      measure(source("ticket", [openTickets]), "count", null, byField(f.ticket.assignee)),
      { x: 8, y: 3, w: 4, h: 8 },
      [C.warning1],
    ),
    chart(
      "Tickets opened per week",
      DisplayType.areaChart,
      measure(source("ticket", [days(f.ticket.openedOn, 120)]), "count", null, byDate(f.ticket.openedOn, "week")),
      { x: 0, y: 11, w: 6, h: 6 },
      [C.warning1],
    ),
    chart(
      "Tickets resolved per week",
      DisplayType.areaChart,
      measure(source("ticket", [days(f.ticket.resolvedOn, 120)]), "count", null, byDate(f.ticket.resolvedOn, "week")),
      { x: 6, y: 11, w: 6, h: 6 },
      [C.success1],
    ),
    chart(
      "Tickets by status",
      DisplayType.verticalBarChartWithLabels,
      measure(source("ticket"), "count", null, byField(f.ticket.status)),
      { x: 0, y: 17, w: 4, h: 8 },
      [C.primary1],
      true,
    ),
    chart(
      "Tickets per account",
      DisplayType.rankedTable,
      measure(
        source("ticket"),
        "count",
        null,
        byRecord([step(r.ticketSubscription), step(r.subscriptionOrganization)]),
      ),
      { x: 4, y: 17, w: 4, h: 8 },
      [C.warning1],
    ),
    chart(
      "SLA breaches by category",
      DisplayType.horizontalBarChart,
      measure(source("ticket", [isTrue(f.ticket.overdue)]), "count", null, byField(f.ticket.category)),
      { x: 8, y: 17, w: 4, h: 8 },
      [C.danger1],
    ),
  ];

  const sourcedDeals = source("deal", [], [linked(r.dealCampaign, "outgoing")]);
  const marketing: WidgetDefinition[] = [
    kpi("Campaign budget", measure(source("campaign"), "sum", f.campaign.budget), 0, C.secondary1),
    kpi("Pipeline sourced", measure(source("campaign"), "sum", f.campaign.pipelineSourced), 3, C.primary1),
    kpi(
      "Won revenue from campaigns",
      measure(source("deal", [wonDeals], [linked(r.dealCampaign, "outgoing")]), "sum", starter.dealTotalValue),
      6,
      C.success1,
    ),
    kpi(
      "Average cost per deal",
      measure(source("campaign", [notEmpty(f.campaign.costPerDeal)]), "average", f.campaign.costPerDeal),
      9,
      C.secondary2,
    ),
    chart(
      "Pipeline sourced per campaign",
      DisplayType.rankedTable,
      measure(source("campaign"), "sum", f.campaign.pipelineSourced, byRecord([])),
      { x: 0, y: 3, w: 6, h: 8 },
      [C.primary1],
    ),
    chart(
      "Pipeline sourced by channel",
      DisplayType.doughnutChart,
      measure(source("campaign"), "sum", f.campaign.pipelineSourced, byField(f.campaign.channel)),
      { x: 6, y: 3, w: 3, h: 8 },
      [C.primary1, C.warning1, C.secondary1, C.default1, C.success1, C.danger1],
      true,
    ),
    chart(
      "Budget by channel",
      DisplayType.verticalBarChart,
      measure(source("campaign"), "sum", f.campaign.budget, byField(f.campaign.channel)),
      { x: 9, y: 3, w: 3, h: 8 },
      [C.secondary1],
      true,
    ),
    chart(
      "New deals per month",
      DisplayType.areaChart,
      measure(source("deal", [days(f.deal.openedOn, 365)]), "count", null, byDate(f.deal.openedOn, "month")),
      { x: 0, y: 11, w: 6, h: 8 },
      [C.secondary1],
    ),
    chart(
      "Pipeline by lead source",
      DisplayType.horizontalBarChartWithLabels,
      measure(source("deal", [notEmpty(f.deal.leadSource)]), "sum", starter.dealTotalValue, byField(f.deal.leadSource)),
      { x: 6, y: 11, w: 6, h: 8 },
      [C.secondary1, C.secondary2, C.primary1, C.primary2],
    ),
    chart(
      "Campaign deals by stage",
      DisplayType.verticalBarChartWithLabels,
      measure(
        source("deal", [choice(f.deal.stage, [stage.lost], "notIn")], [linked(r.dealCampaign, "outgoing")]),
        "count",
        null,
        byField(f.deal.stage),
      ),
      { x: 0, y: 19, w: 4, h: 8 },
      [C.secondary1],
      true,
    ),
    chart(
      "Deals by source campaign",
      DisplayType.horizontalBarChart,
      measure(sourcedDeals, "count", null, byRecord([step(r.dealCampaign)])),
      { x: 4, y: 19, w: 4, h: 8 },
      [C.secondary1],
    ),
    chart(
      "Partner-referred pipeline by tier",
      DisplayType.verticalBarChart,
      measure(source("deal", [], [linked(r.dealPartner, "outgoing")]), "sum", starter.dealTotalValue, {
        path: [step(r.dealPartner)],
        fieldId: f.partner.tier,
      }),
      { x: 8, y: 19, w: 4, h: 8 },
      [C.default1, C.secondary1, C.warning1],
      true,
    ),
  ];

  const teamActivity: WidgetDefinition[] = [
    kpi("Open tasks", measure(source("task", [openTasks]), "count", null), 0, C.primary1),
    kpi(
      "Overdue tasks",
      measure(source("task", [openTasks, days(f.task.dueDate, 1, "notInLastDays")]), "count", null),
      3,
      C.danger1,
    ),
    kpi(
      "Tasks created in 30 days",
      measure(source("task", [days("system:createdAt", 30)]), "count", null),
      6,
      C.secondary1,
    ),
    kpi(
      "Deals touched in 7 days",
      measure(source("deal", [days("system:updatedAt", 7)]), "count", null),
      9,
      C.success1,
    ),
    chart(
      "Open tasks per member",
      DisplayType.horizontalBarChartWithLabels,
      measure(source("task", [openTasks]), "count", null, byField("system:assignedTo")),
      { x: 0, y: 3, w: 4, h: 8 },
      [C.primary1],
    ),
    chart(
      "Open tasks by team",
      DisplayType.doughnutChart,
      measure(source("task", [openTasks]), "count", null, byField(f.task.team)),
      { x: 4, y: 3, w: 4, h: 8 },
      [C.primary1, C.success1, C.warning1, C.secondary1, C.default1, C.danger1],
      true,
    ),
    chart(
      "Overdue tasks by team",
      DisplayType.verticalBarChart,
      measure(
        source("task", [openTasks, days(f.task.dueDate, 1, "notInLastDays")]),
        "count",
        null,
        byField(f.task.team),
      ),
      { x: 8, y: 3, w: 4, h: 8 },
      [C.danger1],
      true,
    ),
    chart(
      "Tasks created per week",
      DisplayType.areaChart,
      measure(source("task", [days("system:createdAt", 180)]), "count", null, byDate("system:createdAt", "week")),
      { x: 0, y: 11, w: 6, h: 6 },
      [C.primary1],
    ),
    chart(
      "Customer replies per day",
      DisplayType.areaChart,
      measure(
        source("ticket", [days(f.ticket.lastResponseOn, 30)]),
        "count",
        null,
        byDate(f.ticket.lastResponseOn, "day"),
      ),
      { x: 6, y: 11, w: 6, h: 6 },
      [C.secondary1],
    ),
    activity("Recent changes", ["record", "audit", "configuration"], { x: 0, y: 17, w: 6, h: 10 }),
    activity("Messages and meetings", ["message", "activity", "calendar_event"], { x: 6, y: 17, w: 6, h: 10 }),
  ];

  const hiring: WidgetDefinition[] = [
    kpi("Open roles", measure(source("openRole", [openRoles]), "count", null), 0, C.primary1),
    kpi("Active candidates", measure(source("candidate", [activeCandidates]), "count", null), 3, C.secondary1),
    kpi(
      "Offers out",
      measure(source("candidate", [choice(f.candidate.stage, [candidateStage.offer])]), "count", null),
      6,
      C.success1,
    ),
    kpi(
      "Salary budget of open roles",
      measure(source("openRole", [openRoles]), "sum", f.openRole.salaryBudget),
      9,
      C.warning1,
    ),
    chart(
      "Candidates by stage",
      DisplayType.funnelChart,
      measure(
        source("candidate", [choice(f.candidate.stage, [candidateStage.rejected], "notIn")]),
        "count",
        null,
        byField(f.candidate.stage),
      ),
      { x: 0, y: 3, w: 6, h: 8 },
      [C.primary1],
      true,
    ),
    chart(
      "Active candidates per open role",
      DisplayType.horizontalBarChartWithLabels,
      measure(
        source("candidate", [activeCandidates], [linked(r.candidateOpenRole, "outgoing")]),
        "count",
        null,
        byRecord([step(r.candidateOpenRole)], { filters: [openRoles], relationships: [], relatedFilters: [] }),
      ),
      { x: 6, y: 3, w: 6, h: 8 },
      [C.primary1, C.primary2, C.secondary1, C.secondary2],
    ),
    chart(
      "Applications per month",
      DisplayType.areaChart,
      measure(source("candidate"), "count", null, byDate(f.candidate.appliedOn, "month")),
      { x: 0, y: 11, w: 6, h: 6 },
      [C.primary1],
    ),
    chart(
      "Candidates by source",
      DisplayType.doughnutChart,
      measure(source("candidate"), "count", null, byField(f.candidate.source)),
      { x: 6, y: 11, w: 3, h: 6 },
      [C.primary1, C.success1, C.secondary1, C.warning1],
      true,
    ),
    chart(
      "Interviews per interviewer",
      DisplayType.verticalBarChart,
      measure(
        source("candidate", [
          choice(f.candidate.stage, [candidateStage.interview, candidateStage.offer, candidateStage.hired]),
        ]),
        "count",
        null,
        byField(f.candidate.interviewers),
      ),
      { x: 9, y: 11, w: 3, h: 6 },
      [C.secondary1],
    ),
    chart(
      "Highest salary expectation by department",
      DisplayType.rankedTable,
      measure(
        source("candidate", [notEmpty(f.candidate.salaryExpectation)]),
        "max",
        f.candidate.salaryExpectation,
        byField(f.candidate.department),
      ),
      { x: 0, y: 17, w: 6, h: 8 },
      [C.warning1],
    ),
    chart(
      "Lowest salary expectation by stage",
      DisplayType.verticalBarChartWithLabels,
      measure(
        source("candidate", [activeCandidates]),
        "min",
        f.candidate.salaryExpectation,
        byField(f.candidate.stage),
      ),
      { x: 6, y: 17, w: 6, h: 8 },
      [C.primary1],
      true,
    ),
  ];

  const definitions: Array<[DashboardKey, string, WidgetDefinition[]]> = [
    ["sales", "Sales", sales],
    ["revenue", "Revenue and renewals", revenue],
    ["support", "Support", support],
    ["marketing", "Marketing", marketing],
    ["teamActivity", "Team activity", teamActivity],
    ["hiring", "Hiring", hiring],
  ];
  return definitions.map(([key, name, widgets]) => ({
    key,
    viewId: key === "sales" ? null : SYNTHETIC_DASHBOARD_VIEW_IDS[key],
    name,
    widgets,
  }));
}
