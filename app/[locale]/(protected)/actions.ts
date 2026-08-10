"use server";

import type { ActivitiesParams } from "@/ee/messaging/activities/activities.schema";
import type { ActivityThreadOptionsData } from "@/ee/messaging/activities/get-activity-thread-options.interactor";
import type { ResolveFilterOptionsData } from "@/features/filter-options/resolve-filter-options.interactor";

import {
  getGetActivitiesInteractor,
  getGetActivityThreadOptionsInteractor,
  getGetMyConnectedAccountsInteractor,
  getResolveFilterOptionsInteractor,
} from "@/core/di";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getActivitiesAction(input: ActivitiesParams) {
  const result = await getGetActivitiesInteractor().invoke(input);
  return result.ok ? result.data : null;
}

export async function getActivityThreadOptionsAction(input: ActivityThreadOptionsData) {
  const result = await getGetActivityThreadOptionsInteractor().invoke(input);
  return result.ok ? result.data : [];
}

export async function getConnectedAccountsAction() {
  const result = await getGetMyConnectedAccountsInteractor().invoke();
  return result.ok ? result.data : [];
}

export async function resolveFilterOptionsAction(input: ResolveFilterOptionsData) {
  return unwrapValidated(getResolveFilterOptionsInteractor().invoke(input));
}
