"use server";

import type { GetNotificationsData, MarkNotificationsReadData } from "@/features/notifications/notification.schema";

import { getGetNotificationsInteractor, getMarkNotificationsReadInteractor } from "@/core/di";
import { serializeResult, serializeTypedResult } from "@/core/utils/action-result";

export async function getNotificationsAction(params?: Partial<GetNotificationsData>) {
  return serializeTypedResult(getGetNotificationsInteractor().invoke(params as GetNotificationsData));
}

export async function markNotificationsReadAction(data: MarkNotificationsReadData) {
  return serializeResult(getMarkNotificationsReadInteractor().invoke(data));
}
