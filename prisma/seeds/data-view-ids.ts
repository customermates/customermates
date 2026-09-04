import { fixtureId } from "./helpers";

export const SYNTHETIC_DATA_VIEW_ID_PREFIX = "1f100000";
export const SYNTHETIC_DATA_VIEW_OVERRIDE_ID_PREFIX = "1f200000";

export const SYNTHETIC_DATA_VIEW_IDS = {
  sharedOpenDeals: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 1),
} as const;
