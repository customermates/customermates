"use server";

import type { ActivitiesParams } from "@/ee/messaging/activities/activities.schema";
import type { ActivityThreadOptionsData } from "@/ee/messaging/activities/get-activity-thread-options.interactor";
import type { ActivityChannelOptionsData } from "@/ee/messaging/activities/get-activity-channel-options.interactor";

import {
  getGetActivitiesInteractor,
  getGetActivityThreadOptionsInteractor,
  getGetActivityChannelOptionsInteractor,
} from "@/core/di";

export async function getActivitiesAction(input: ActivitiesParams) {
  const result = await getGetActivitiesInteractor().invoke(input);
  return result.ok ? result.data : null;
}

export async function getActivityThreadOptionsAction(input: ActivityThreadOptionsData) {
  const result = await getGetActivityThreadOptionsInteractor().invoke(input);
  return result.ok ? result.data : [];
}

export async function getActivityChannelOptionsAction(input: ActivityChannelOptionsData) {
  const result = await getGetActivityChannelOptionsInteractor().invoke(input);
  return result.ok ? result.data : [];
}
