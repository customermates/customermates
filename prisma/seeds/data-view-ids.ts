import { fixtureId } from "./helpers";

export const SYNTHETIC_DATA_VIEW_ID_PREFIX = "1f100000";

export const SYNTHETIC_DATA_VIEW_IDS = {
  openDeals: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 1),
  dealPipeline: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 2),
  dealForecast: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 13),
  dealsByAccount: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 14),
  contactPipeline: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 3),
  contactsInPlay: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 4),
  contactsRecentlyAdded: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 15),
  organizationsByType: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 5),
  directCustomers: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 6),
  serviceCatalogue: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 7),
  hardwareServices: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 8),
  servicesRecentlyUpdated: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 17),
  taskBoard: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 9),
  highPriorityTasks: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 10),
  tasksByPriority: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 18),
  inboxDrafts: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 11),
  inboxUnread: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 12),
  inboxWhatsApp: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 19),
} as const;
