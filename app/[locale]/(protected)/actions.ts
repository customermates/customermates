"use server";

import type { ActivitiesParams } from "@/ee/messaging/activities/activities.schema";
import type { ActivityThreadOptionsData } from "@/ee/messaging/activities/get-activity-thread-options.interactor";
import type { ActivityRecordOptionsData } from "@/ee/messaging/activities/get-activity-record-options.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import {
  getGetActivitiesInteractor,
  getGetActivityThreadOptionsInteractor,
  getGetActivityRecordOptionsInteractor,
  getGetCalendarsInteractor,
  getGetMyConnectedAccountsInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getActivitiesAction(input: ActivitiesParams) {
  return serializeResult(getGetActivitiesInteractor().invoke(input));
}

export async function getActivityThreadOptionsAction(input: ActivityThreadOptionsData) {
  return unwrapValidated(getGetActivityThreadOptionsInteractor().invoke(input));
}

export async function getActivityRecordOptionsAction(input: ActivityRecordOptionsData) {
  return unwrapValidated(getGetActivityRecordOptionsInteractor().invoke(input));
}

export async function getConnectedAccountsAction() {
  return unwrapValidated(getGetMyConnectedAccountsInteractor().invoke());
}

export async function getCalendarsAction(params?: GetQueryParams) {
  return unwrapValidated(getGetCalendarsInteractor().invoke(params));
}
