"use server";

import type { SetNotificationPreferencesData } from "@/features/notifications/notification.schema";

import { getSetNotificationPreferencesInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function setNotificationPreferencesAction(data: SetNotificationPreferencesData) {
  return serializeResult(getSetNotificationPreferencesInteractor().invoke(data));
}
