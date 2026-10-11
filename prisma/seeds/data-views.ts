import type { Filter } from "@/core/base/base-get.schema";
import type { DateBucket, GroupSummaryDefinition } from "@/core/base/grouping/grouping.schema";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { PrismaClient } from "@/generated/prisma";

import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { writeStoredState } from "@/features/data-view/data-view-row-mapping";
import { MANUAL_ORDER_SORT_KEY } from "@/features/records/record-column.schema";
import { MessagingProvider, MessagingThreadState } from "@/generated/prisma";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";
import { NORTHWIND_MEMBER_IDS, northwindModelIds } from "./northwind-model";
import { northwindColumns } from "./northwind-columns";

import { SYNTHETIC_DATA_VIEW_ID_PREFIX, SYNTHETIC_DATA_VIEW_IDS } from "./data-view-ids";

export { SYNTHETIC_DATA_VIEW_ID_PREFIX, SYNTHETIC_DATA_VIEW_IDS } from "./data-view-ids";

export type SyntheticDataViewFixture = {
  id: string;
  userId: string;
  surfaceKey: string;
  name: string;
  position: number;
  state: DataViewState;
};

type ViewDraft = Omit<SyntheticDataViewFixture, "position" | "userId"> & { userId?: string };

/**
 * The saved views of the Northwind Labs demo: two to four per list for the demo user, plus personal views that
 * other members keep for themselves. Together they show every view capability: boards and tables, grouping by
 * choice, member, relationship and date buckets with group totals, choice, member, boolean, relative date,
 * relationship and related-field filters, sorts including manual order, ordered, sized and hidden columns, and
 * Formatted text columns as excerpts. Seeded views are saved state, so they open unmodified.
 */
export function buildSyntheticDataViewFixtures(
  context: Pick<SeedContext, "ids">,
  customFields: CustomFieldSeedData,
): SyntheticDataViewFixture[] {
  const { customFieldIds, customOptionIds } = customFields;
  const model = northwindModelIds(context.ids.company);
  const { fields: f, options: o, types } = model;
  const columns = northwindColumns(context.ids.company, customFieldIds);
  const { rel, path } = columns;
  const members = NORTHWIND_MEMBER_IDS;
  const me = context.ids.user;

  const surface = (type: keyof typeof types) => `records:${types[type]}`;
  const sum = (fieldId: string): GroupSummaryDefinition => ({ fieldId, aggregation: "sum" });
  const average = (fieldId: string): GroupSummaryDefinition => ({ fieldId, aggregation: "average" });
  const min = (fieldId: string): GroupSummaryDefinition => ({ fieldId, aggregation: "min" });
  const max = (fieldId: string): GroupSummaryDefinition => ({ fieldId, aggregation: "max" });
  const sorted = (field: string, direction: "asc" | "desc"): DataViewState["sortDescriptor"] => ({ field, direction });
  const manual = sorted(MANUAL_ORDER_SORT_KEY, "asc");
  const anyOf = (field: string, value: string[]): Filter => ({ field, operator: FilterOperatorKey.in, value });
  const noneOf = (field: string, value: string[]): Filter => ({ field, operator: FilterOperatorKey.notIn, value });
  const hasAny = (field: string, value: string[]): Filter => ({ field, operator: FilterOperatorKey.hasAnyOf, value });
  const since = (field: string, days: number): Filter => ({
    field,
    operator: FilterOperatorKey.inLastDays,
    value: days,
  });
  const before = (field: string, days: number): Filter => ({
    field,
    operator: FilterOperatorKey.notInLastDays,
    value: days,
  });
  const linked = (field: string): Filter => ({ field, operator: FilterOperatorKey.hasSome });
  const assignedTo = (userId: string) => anyOf("system:assignedTo", [userId]);

  /** A board grouped by `field`: the card shows `visible`, every other column is hidden. */
  const board = (
    type: Parameters<typeof columns.showOnly>[0],
    field: string,
    visible: string[],
    extra: Partial<NonNullable<DataViewState["grouping"]>> = {},
  ): DataViewState => ({
    viewMode: ViewMode.card,
    grouping: { field, ...extra },
    columnOrder: visible,
    hiddenColumns: columns.showOnly(type, visible),
  });
  /** A table showing `visible` in that order, every other column hidden. */
  const table = (
    type: Parameters<typeof columns.showOnly>[0],
    visible: string[],
    grouping?: { field: string; bucket?: DateBucket; summaries?: GroupSummaryDefinition[] },
  ): DataViewState => ({
    viewMode: ViewMode.table,
    ...(grouping ? { grouping } : {}),
    columnOrder: visible,
    hiddenColumns: columns.showOnly(type, visible),
  });

  const openStages = [o["deal.stage"].new, o["deal.stage"].qualified, o["deal.stage"].proposal];
  const openTickets = [o["ticket.status"].new, o["ticket.status"].open, o["ticket.status"].waitingOnCustomer];
  const closedTasks = [customOptionIds.taskStatus.done, customOptionIds.taskStatus.archived];
  const dealOrganization = rel("deal.organizations", "outgoing");
  const myOpenDealsBoard = (userId: string): DataViewState => ({
    ...board("deal", f.deal.stage, [model.starter.dealTotalValue, f.deal.closeDate, dealOrganization], {
      summaries: [sum(model.starter.dealTotalValue), sum(model.starter.dealWeightedValue)],
    }),
    filters: [assignedTo(userId), anyOf(f.deal.stage, openStages)],
    sortDescriptor: sorted(f.deal.closeDate, "asc"),
  });

  const drafts: ViewDraft[] = [
    // Deals
    {
      id: SYNTHETIC_DATA_VIEW_IDS.dealPipeline,
      surfaceKey: surface("deal"),
      name: "Pipeline",
      state: {
        ...board(
          "deal",
          f.deal.stage,
          [
            model.starter.dealTotalValue,
            model.starter.dealWeightedValue,
            f.deal.closeDate,
            dealOrganization,
            "system:assignedTo",
          ],
          {
            summaries: [sum(model.starter.dealTotalValue), sum(model.starter.dealWeightedValue)],
            hidden: [`value:${o["deal.stage"].lost}`],
          },
        ),
        sortDescriptor: manual,
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.dealForecast,
      surfaceKey: surface("deal"),
      name: "Forecast",
      state: {
        ...table(
          "deal",
          [
            f.deal.stage,
            f.deal.closeDate,
            model.starter.dealTotalValue,
            model.starter.dealWeightedValue,
            dealOrganization,
            "system:assignedTo",
          ],
          {
            field: f.deal.stage,
            summaries: [
              sum(model.starter.dealTotalValue),
              sum(model.starter.dealWeightedValue),
              max(model.starter.dealTotalValue),
            ],
          },
        ),
        filters: [anyOf(f.deal.stage, openStages), since(f.deal.closeDate, 1)],
        sortDescriptor: sorted(f.deal.closeDate, "asc"),
        pageSize: 25,
        columnWidths: { [model.starter.dealTotalValue]: 160, [model.starter.dealWeightedValue]: 180 },
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.myOpenDeals,
      surfaceKey: surface("deal"),
      name: "Open deals by rep",
      state: {
        ...table(
          "deal",
          [
            f.deal.stage,
            model.starter.dealTotalValue,
            model.starter.dealWeightedValue,
            f.deal.closeDate,
            dealOrganization,
            rel("deal.contacts", "outgoing"),
          ],
          {
            field: "system:assignedTo",
            summaries: [sum(model.starter.dealTotalValue), sum(model.starter.dealWeightedValue)],
          },
        ),
        filters: [anyOf(f.deal.stage, openStages)],
        sortDescriptor: sorted(model.starter.dealWeightedValue, "desc"),
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.dealsWonThisYear,
      surfaceKey: surface("deal"),
      name: "Won this year",
      state: {
        ...table(
          "deal",
          [
            f.deal.contractValue,
            f.deal.listValue,
            f.deal.discountPercent,
            f.deal.daysToClose,
            f.deal.closeDate,
            dealOrganization,
            rel("deal.campaign", "outgoing"),
          ],
          {
            field: "system:assignedTo",
            summaries: [sum(f.deal.contractValue), average(f.deal.discountPercent), average(f.deal.daysToClose)],
          },
        ),
        filters: [anyOf(f.deal.stage, [o["deal.stage"].won]), since(f.deal.closeDate, 365)],
        sortDescriptor: sorted(f.deal.closeDate, "desc"),
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.claraOpenDeals,
      userId: members.claraNeumann,
      surfaceKey: surface("deal"),
      name: "My open deals",
      state: myOpenDealsBoard(members.claraNeumann),
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.marcoOpenDeals,
      userId: members.marcoSilva,
      surfaceKey: surface("deal"),
      name: "My open deals",
      state: myOpenDealsBoard(members.marcoSilva),
    },

    // Contacts
    {
      id: SYNTHETIC_DATA_VIEW_IDS.contactDecisionMakers,
      surfaceKey: surface("contact"),
      name: "Decision makers",
      state: {
        ...table("contact", [
          f.contact.jobTitle,
          f.contact.dealRole,
          rel("contact.organizations", "outgoing"),
          model.starter.contactChannels,
          "system:assignedTo",
        ]),
        filters: [hasAny(f.contact.dealRole, [o["contact.dealRole"].decisionMaker])],
        sortDescriptor: sorted(columns.id("contact.name"), "asc"),
        columnWidths: { [f.contact.jobTitle]: 220 },
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.contactsByRole,
      surfaceKey: surface("contact"),
      name: "Buying committee",
      state: {
        ...table(
          "contact",
          [
            f.contact.jobTitle,
            f.contact.dealRole,
            rel("contact.organizations", "outgoing"),
            rel("deal.contacts", "incoming"),
          ],
          {
            field: customFieldIds.contactSalesPipeline,
          },
        ),
        filters: [
          hasAny(f.contact.dealRole, [
            o["contact.dealRole"].decisionMaker,
            o["contact.dealRole"].champion,
            o["contact.dealRole"].influencer,
            o["contact.dealRole"].procurement,
          ]),
        ],
        sortDescriptor: sorted(columns.id("contact.name"), "asc"),
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.contactsRecentlyAdded,
      surfaceKey: surface("contact"),
      name: "Added by month",
      state: {
        ...table("contact", [f.contact.jobTitle, rel("contact.organizations", "outgoing"), "system:createdAt"], {
          field: "system:createdAt",
          bucket: "month",
        }),
        sortDescriptor: sorted("system:createdAt", "desc"),
        pageSize: 25,
      },
    },

    // Organizations
    {
      id: SYNTHETIC_DATA_VIEW_IDS.organizationsTopArr,
      surfaceKey: surface("organization"),
      name: "Top accounts by ARR",
      state: {
        ...table("organization", [
          f.organization.arr,
          f.organization.licensedSeats,
          f.organization.segment,
          f.organization.industry,
          f.organization.openPipeline,
          path("organization.tickets.path"),
          "system:assignedTo",
        ]),
        filters: [linked(rel("subscription.organization", "incoming"))],
        sortDescriptor: sorted(f.organization.arr, "desc"),
        pageSize: 25,
        columnWidths: { [columns.id("organization.name")]: 260, [f.organization.arr]: 150 },
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.organizationsByIndustry,
      surfaceKey: surface("organization"),
      name: "By industry",
      state: {
        ...table(
          "organization",
          [
            f.organization.segment,
            f.organization.companySize,
            f.organization.arr,
            f.organization.openPipeline,
            customFieldIds.organizationWebsite,
          ],
          {
            field: f.organization.industry,
            summaries: [sum(f.organization.arr), sum(f.organization.openPipeline), average(f.organization.companySize)],
          },
        ),
        sortDescriptor: sorted(f.organization.arr, "desc"),
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.organizationsBySegment,
      surfaceKey: surface("organization"),
      name: "By segment",
      state: {
        ...board(
          "organization",
          f.organization.segment,
          [f.organization.industry, f.organization.arr, f.organization.licensedSeats],
          {
            summaries: [sum(f.organization.arr), max(f.organization.arr), sum(f.organization.licensedSeats)],
            hideEmpty: true,
          },
        ),
        sortDescriptor: sorted(f.organization.arr, "desc"),
      },
    },

    // Products and services
    {
      id: SYNTHETIC_DATA_VIEW_IDS.serviceCatalogue,
      surfaceKey: surface("service"),
      name: "Catalogue by pricing",
      state: {
        ...board("service", customFieldIds.servicePricing, [model.starter.serviceAmount, customFieldIds.serviceType], {
          summaries: [
            average(model.starter.serviceAmount),
            min(model.starter.serviceAmount),
            max(model.starter.serviceAmount),
          ],
        }),
        sortDescriptor: sorted(model.starter.serviceAmount, "desc"),
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.servicesByPrice,
      surfaceKey: surface("service"),
      name: "Price list",
      state: {
        ...table("service", [
          model.starter.serviceAmount,
          customFieldIds.servicePricing,
          customFieldIds.serviceType,
          path("service.deals.path"),
        ]),
        sortDescriptor: sorted(model.starter.serviceAmount, "desc"),
        pageSize: 100,
      },
    },

    // Tasks
    {
      id: SYNTHETIC_DATA_VIEW_IDS.tasksDueThisWeek,
      surfaceKey: surface("task"),
      name: "Due soon by team",
      state: {
        ...table(
          "task",
          [
            f.task.dueDate,
            customFieldIds.taskPriority,
            customFieldIds.taskStatus,
            rel("task.deals", "outgoing"),
            "system:assignedTo",
          ],
          {
            field: f.task.team,
          },
        ),
        filters: [noneOf(customFieldIds.taskStatus, closedTasks), since(f.task.dueDate, 7)],
        sortDescriptor: sorted(f.task.dueDate, "asc"),
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.tasksByTeam,
      surfaceKey: surface("task"),
      name: "Team board",
      state: {
        ...board("task", f.task.team, [f.task.dueDate, customFieldIds.taskPriority, "system:assignedTo"]),
        filters: [noneOf(customFieldIds.taskStatus, closedTasks)],
        sortDescriptor: manual,
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.tasksOverdue,
      surfaceKey: surface("task"),
      name: "Overdue",
      state: {
        ...table("task", [
          f.task.dueDate,
          f.task.team,
          customFieldIds.taskPriority,
          rel("task.organizations", "outgoing"),
          rel("task.deals", "outgoing"),
          "system:assignedTo",
        ]),
        filters: [noneOf(customFieldIds.taskStatus, closedTasks), before(f.task.dueDate, 1)],
        sortDescriptor: sorted(f.task.dueDate, "asc"),
      },
    },

    // Subscriptions
    {
      id: SYNTHETIC_DATA_VIEW_IDS.subscriptionRenewals,
      surfaceKey: surface("subscription"),
      name: "Upcoming renewals",
      state: {
        ...table(
          "subscription",
          [
            rel("subscription.organization", "outgoing"),
            f.subscription.plan,
            f.subscription.seats,
            f.subscription.arr,
            f.subscription.renewalDate,
            "system:assignedTo",
          ],
          {
            field: f.subscription.health,
            summaries: [sum(f.subscription.arr), sum(f.subscription.seats)],
          },
        ),
        filters: [since(f.subscription.renewalDate, 1)],
        sortDescriptor: sorted(f.subscription.renewalDate, "asc"),
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.subscriptionsAtRisk,
      surfaceKey: surface("subscription"),
      name: "At risk",
      state: {
        ...table("subscription", [
          f.subscription.health,
          f.subscription.arr,
          f.subscription.renewalDate,
          rel("subscription.organization", "outgoing"),
          f.subscription.notes,
          "system:assignedTo",
        ]),
        filters: [anyOf(f.subscription.health, [o["subscription.health"].atRisk, o["subscription.health"].watch])],
        sortDescriptor: sorted(f.subscription.arr, "desc"),
        columnWidths: { [f.subscription.notes]: 360 },
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.subscriptionsByPlan,
      surfaceKey: surface("subscription"),
      name: "By plan",
      state: {
        ...board(
          "subscription",
          f.subscription.plan,
          [
            rel("subscription.organization", "outgoing"),
            f.subscription.arr,
            f.subscription.seats,
            f.subscription.health,
          ],
          {
            summaries: [sum(f.subscription.arr), sum(f.subscription.seats), average(f.subscription.arr)],
          },
        ),
        sortDescriptor: sorted(f.subscription.arr, "desc"),
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.elenaRenewals,
      userId: members.elenaHoffmann,
      surfaceKey: surface("subscription"),
      name: "My renewals",
      state: {
        ...table("subscription", [
          rel("subscription.organization", "outgoing"),
          f.subscription.renewalDate,
          f.subscription.health,
          f.subscription.arr,
          f.subscription.notes,
        ]),
        filters: [assignedTo(members.elenaHoffmann), since(f.subscription.renewalDate, 1)],
        sortDescriptor: sorted(f.subscription.renewalDate, "asc"),
      },
    },

    // Onboarding projects
    {
      id: SYNTHETIC_DATA_VIEW_IDS.onboardingBoard,
      surfaceKey: surface("onboarding"),
      name: "Board by phase",
      state: {
        ...board(
          "onboarding",
          f.onboarding.phase,
          [
            rel("onboarding.organization", "outgoing"),
            f.onboarding.owner,
            f.onboarding.progress,
            f.onboarding.timeline,
          ],
          {
            summaries: [average(f.onboarding.progress)],
          },
        ),
        sortDescriptor: manual,
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.onboardingTimeline,
      surfaceKey: surface("onboarding"),
      name: "Active projects",
      state: {
        ...table(
          "onboarding",
          [
            f.onboarding.phase,
            f.onboarding.owner,
            f.onboarding.timeline,
            f.onboarding.progress,
            rel("onboarding.deal", "outgoing"),
            f.onboarding.notes,
          ],
          {
            field: f.onboarding.owner,
            summaries: [average(f.onboarding.progress), min(f.onboarding.progress)],
          },
        ),
        filters: [noneOf(f.onboarding.phase, [o["onboarding.phase"].completed])],
        sortDescriptor: sorted(f.onboarding.progress, "asc"),
        columnWidths: { [f.onboarding.notes]: 320 },
      },
    },

    // Tickets
    {
      id: SYNTHETIC_DATA_VIEW_IDS.ticketsOpenByPriority,
      surfaceKey: surface("ticket"),
      name: "Open by priority",
      state: {
        ...board(
          "ticket",
          f.ticket.priority,
          [f.ticket.status, f.ticket.assignee, f.ticket.slaDue, rel("ticket.subscription", "outgoing")],
          {
            summaries: [max(f.ticket.daysOverSla), average(f.ticket.daysOverSla)],
          },
        ),
        filters: [anyOf(f.ticket.status, openTickets)],
        sortDescriptor: sorted(f.ticket.slaDue, "asc"),
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.ticketsOverdue,
      surfaceKey: surface("ticket"),
      name: "SLA breached",
      state: {
        ...table("ticket", [
          f.ticket.priority,
          f.ticket.status,
          f.ticket.assignee,
          f.ticket.slaDue,
          f.ticket.daysOverSla,
          rel("ticket.subscription", "outgoing"),
          f.ticket.notes,
        ]),
        filters: [anyOf(f.ticket.overdue, ["true"])],
        sortDescriptor: sorted(f.ticket.daysOverSla, "desc"),
        columnWidths: { [f.ticket.notes]: 360 },
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.ticketsByWeek,
      surfaceKey: surface("ticket"),
      name: "Opened by week",
      state: {
        ...table(
          "ticket",
          [f.ticket.category, f.ticket.priority, f.ticket.status, f.ticket.openedOn, f.ticket.resolvedOn],
          {
            field: f.ticket.openedOn,
            bucket: "week",
          },
        ),
        sortDescriptor: sorted(f.ticket.openedOn, "desc"),
        pageSize: 25,
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.kianQueue,
      userId: members.kianRahimi,
      surfaceKey: surface("ticket"),
      name: "My queue",
      state: {
        ...table("ticket", [
          f.ticket.priority,
          f.ticket.status,
          f.ticket.slaDue,
          rel("ticket.contact", "outgoing"),
          f.ticket.notes,
        ]),
        filters: [anyOf(f.ticket.assignee, [members.kianRahimi]), anyOf(f.ticket.status, openTickets)],
        sortDescriptor: sorted(f.ticket.slaDue, "asc"),
      },
    },

    // Campaigns
    {
      id: SYNTHETIC_DATA_VIEW_IDS.campaignsPipelineSourced,
      surfaceKey: surface("campaign"),
      name: "Pipeline sourced",
      state: {
        ...table("campaign", [
          f.campaign.channel,
          f.campaign.period,
          f.campaign.budget,
          f.campaign.dealsSourced,
          f.campaign.pipelineSourced,
          f.campaign.wonRevenue,
          f.campaign.costPerDeal,
        ]),
        sortDescriptor: sorted(f.campaign.pipelineSourced, "desc"),
        columnWidths: { [f.campaign.pipelineSourced]: 170, [f.campaign.wonRevenue]: 150 },
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.campaignsByChannel,
      surfaceKey: surface("campaign"),
      name: "By channel",
      state: {
        ...table(
          "campaign",
          [
            f.campaign.period,
            f.campaign.budget,
            f.campaign.pipelineSourced,
            f.campaign.wonRevenue,
            f.campaign.costPerDeal,
          ],
          {
            field: f.campaign.channel,
            summaries: [
              sum(f.campaign.budget),
              sum(f.campaign.pipelineSourced),
              sum(f.campaign.wonRevenue),
              average(f.campaign.costPerDeal),
            ],
          },
        ),
        sortDescriptor: sorted(f.campaign.pipelineSourced, "desc"),
      },
    },

    // Partners
    {
      id: SYNTHETIC_DATA_VIEW_IDS.partnersByTier,
      surfaceKey: surface("partner"),
      name: "By tier",
      state: {
        ...board(
          "partner",
          f.partner.tier,
          [f.partner.region, f.partner.referredPipeline, f.partner.revenueInfluenced, f.partner.commissionDue],
          {
            summaries: [
              sum(f.partner.referredPipeline),
              sum(f.partner.revenueInfluenced),
              sum(f.partner.commissionDue),
            ],
          },
        ),
        sortDescriptor: sorted(f.partner.revenueInfluenced, "desc"),
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.partnersByRegion,
      surfaceKey: surface("partner"),
      name: "By region",
      state: {
        ...table(
          "partner",
          [
            f.partner.tier,
            f.partner.commissionRate,
            f.partner.annualFee,
            f.partner.referredPipeline,
            f.partner.revenueInfluenced,
            f.partner.website,
          ],
          {
            field: f.partner.region,
            summaries: [sum(f.partner.revenueInfluenced), average(f.partner.commissionRate)],
          },
        ),
        sortDescriptor: sorted(f.partner.revenueInfluenced, "desc"),
      },
    },

    // Open roles
    {
      id: SYNTHETIC_DATA_VIEW_IDS.openRolesByDepartment,
      surfaceKey: surface("openRole"),
      name: "By department",
      state: {
        ...board(
          "openRole",
          f.openRole.department,
          [f.openRole.status, f.openRole.hiringManager, f.openRole.candidateCount, f.openRole.salaryBudget],
          {
            summaries: [sum(f.openRole.salaryBudget), sum(f.openRole.candidateCount)],
            hideEmpty: true,
          },
        ),
        sortDescriptor: sorted(f.openRole.targetStart, "asc"),
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.openRolesHiring,
      surfaceKey: surface("openRole"),
      name: "Hiring now",
      state: {
        ...table("openRole", [
          f.openRole.department,
          f.openRole.hiringManager,
          f.openRole.targetStart,
          f.openRole.candidateCount,
          f.openRole.salaryBudget,
          f.openRole.notes,
        ]),
        filters: [anyOf(f.openRole.status, [o["openRole.status"].open])],
        sortDescriptor: sorted(f.openRole.targetStart, "asc"),
        columnWidths: { [f.openRole.notes]: 340 },
      },
    },

    // Candidates
    {
      id: SYNTHETIC_DATA_VIEW_IDS.candidatesHiringBoard,
      surfaceKey: surface("candidate"),
      name: "Hiring board",
      state: {
        ...board(
          "candidate",
          f.candidate.stage,
          [rel("candidate.openRole", "outgoing"), f.candidate.source, f.candidate.interviewers],
          {
            summaries: [average(f.candidate.salaryExpectation)],
            hidden: [`value:${o["candidate.stage"].rejected}`],
          },
        ),
        sortDescriptor: manual,
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.candidatesInterviewNotes,
      surfaceKey: surface("candidate"),
      name: "Interview notes",
      state: {
        ...table(
          "candidate",
          [
            rel("candidate.openRole", "outgoing"),
            f.candidate.stage,
            f.candidate.interviewers,
            f.candidate.interviewNotes,
            f.candidate.salaryExpectation,
          ],
          {
            field: f.candidate.department,
            summaries: [average(f.candidate.salaryExpectation), max(f.candidate.salaryExpectation)],
          },
        ),
        filters: [
          anyOf(f.candidate.stage, [
            o["candidate.stage"].interview,
            o["candidate.stage"].caseTask,
            o["candidate.stage"].offer,
          ]),
        ],
        sortDescriptor: sorted(f.candidate.appliedOn, "asc"),
        columnWidths: { [f.candidate.interviewNotes]: 320 },
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.lauraInterviews,
      userId: members.lauraFischer,
      surfaceKey: surface("candidate"),
      name: "My interviews",
      state: {
        ...table("candidate", [
          rel("candidate.openRole", "outgoing"),
          f.candidate.stage,
          f.candidate.appliedOn,
          f.candidate.interviewNotes,
        ]),
        filters: [anyOf(f.candidate.interviewers, [members.lauraFischer])],
        sortDescriptor: sorted(f.candidate.appliedOn, "desc"),
      },
    },

    // Inbox
    {
      id: SYNTHETIC_DATA_VIEW_IDS.inboxDrafts,
      surfaceKey: SURFACE.messagingThreads,
      name: "Drafts",
      state: {
        filters: [{ field: FilterFieldKey.draft, operator: FilterOperatorKey.hasSome }],
        viewMode: ViewMode.table,
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.inboxUnread,
      surfaceKey: SURFACE.messagingThreads,
      name: "Unread",
      state: { filters: [anyOf(FilterFieldKey.state, [MessagingThreadState.unread])], viewMode: ViewMode.table },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.inboxWhatsApp,
      surfaceKey: SURFACE.messagingThreads,
      name: "WhatsApp",
      state: { filters: [anyOf(FilterFieldKey.provider, [MessagingProvider.whatsapp])], viewMode: ViewMode.table },
    },
  ];

  const positions = new Map<string, number>();
  return drafts.map(({ userId = me, ...draft }) => {
    const key = `${userId}:${draft.surfaceKey}`;
    const position = positions.get(key) ?? 0;
    positions.set(key, position + 1);
    return { ...draft, userId, position };
  });
}

export async function persistSyntheticDataViewFixtures(
  prisma: Pick<PrismaClient, "dataView">,
  companyId: string,
  views: SyntheticDataViewFixture[],
  prefix = SYNTHETIC_DATA_VIEW_ID_PREFIX,
): Promise<void> {
  for (const view of views) {
    const { id, state, ...rest } = view;
    const data = { companyId, ...rest, ...writeStoredState(state) };
    await prisma.dataView.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  await prisma.dataView.deleteMany({
    where: {
      companyId,
      id: { startsWith: `${prefix}-`, notIn: views.map(({ id }) => id) },
    },
  });
}

export async function seedDataViews(context: SeedContext, customFields: CustomFieldSeedData): Promise<void> {
  await persistSyntheticDataViewFixtures(
    context.prisma,
    context.ids.company,
    buildSyntheticDataViewFixtures(context, customFields),
  );
}
