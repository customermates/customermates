import type { Status } from "@/generated/prisma";

import { type ChipColor } from "./chip-colors";

export const USER_STATUS_COLORS_MAP: Record<Status, ChipColor> = {
  active: "success",
  inactive: "danger",
  pendingAuthorization: "warning",
};

export const USER_STATUS_OPTIONS = Object.entries(USER_STATUS_COLORS_MAP).map(([key, value]) => ({
  key,
  color: value,
}));
