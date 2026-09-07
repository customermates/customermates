import { fixtureId } from "./helpers";

export const SYNTHETIC_DATA_VIEW_ID_PREFIX = "1f100000";

export const SYNTHETIC_DATA_VIEW_IDS = {
  openDeals: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 1),
  dealPipeline: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 2),
  contactPipeline: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 3),
  contactsInPlay: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 4),
  organizationsByType: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 5),
  directCustomers: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 6),
  serviceCatalogue: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 7),
  hardwareServices: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 8),
  taskBoard: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 9),
  highPriorityTasks: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 10),
  inboxDrafts: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 11),
  inboxUnread: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 12),
} as const;
