"use server";

import type {
  SetNotificationPauseData,
  SetNotificationPreferencesData,
} from "@/features/notifications/notification.schema";

import { getSetNotificationPauseInteractor, getSetNotificationPreferencesInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function setNotificationPreferencesAction(data: SetNotificationPreferencesData) {
  return serializeResult(getSetNotificationPreferencesInteractor().invoke(data));
}

export async function setNotificationPauseAction(data: SetNotificationPauseData) {
  return serializeResult(getSetNotificationPauseInteractor().invoke(data));
}
