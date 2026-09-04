import { fixtureId } from "./helpers";

export const SYNTHETIC_DATA_VIEW_ID_PREFIX = "1f100000";
export const SYNTHETIC_DATA_VIEW_OVERRIDE_ID_PREFIX = "1f200000";

export const SYNTHETIC_DATA_VIEW_IDS = {
  directCustomer: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 1),
  affiliatedCompany: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 2),
  sharedOpenDeals: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 3),
} as const;
