import { fixtureId } from "./helpers";

/** Saved list views (`records:<typeId>` and the inbox). Dashboards use their own prefix below. */
export const SYNTHETIC_DATA_VIEW_ID_PREFIX = "1f100000";

const view = (index: number) => fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, index);

export const SYNTHETIC_DATA_VIEW_IDS = {
  dealPipeline: view(2),
  dealForecast: view(13),
  myOpenDeals: view(1),
  dealsWonThisYear: view(14),
  claraOpenDeals: view(20),
  marcoOpenDeals: view(21),
  contactDecisionMakers: view(3),
  contactsByRole: view(4),
  contactsRecentlyAdded: view(15),
  organizationsTopArr: view(5),
  organizationsByIndustry: view(6),
  organizationsBySegment: view(22),
  serviceCatalogue: view(7),
  servicesByPrice: view(8),
  tasksDueThisWeek: view(9),
  tasksByTeam: view(10),
  tasksOverdue: view(18),
  subscriptionRenewals: view(23),
  subscriptionsAtRisk: view(24),
  subscriptionsByPlan: view(25),
  elenaRenewals: view(26),
  onboardingBoard: view(27),
  onboardingTimeline: view(28),
  ticketsOpenByPriority: view(29),
  ticketsOverdue: view(30),
  ticketsByWeek: view(31),
  kianQueue: view(32),
  campaignsPipelineSourced: view(33),
  campaignsByChannel: view(34),
  partnersByTier: view(35),
  partnersByRegion: view(36),
  openRolesByDepartment: view(37),
  openRolesHiring: view(38),
  candidatesHiringBoard: view(39),
  candidatesInterviewNotes: view(40),
  lauraInterviews: view(41),
  inboxDrafts: view(11),
  inboxUnread: view(12),
  inboxWhatsApp: view(19),
} as const;

/**
 * Dashboard views (`dashboard` surface). The Sales dashboard is the main dashboard (widgets without a view), so
 * only the other five are views. The seed writes them with the widgets, which reference them.
 */
export const SYNTHETIC_DASHBOARD_VIEW_ID_PREFIX = "1f200000";

export const SYNTHETIC_DASHBOARD_VIEW_IDS = {
  revenue: fixtureId(SYNTHETIC_DASHBOARD_VIEW_ID_PREFIX, 2),
  support: fixtureId(SYNTHETIC_DASHBOARD_VIEW_ID_PREFIX, 3),
  marketing: fixtureId(SYNTHETIC_DASHBOARD_VIEW_ID_PREFIX, 4),
  teamActivity: fixtureId(SYNTHETIC_DASHBOARD_VIEW_ID_PREFIX, 5),
  hiring: fixtureId(SYNTHETIC_DASHBOARD_VIEW_ID_PREFIX, 6),
} as const;
