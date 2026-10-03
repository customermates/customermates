"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";

import { getGetCalendarsInteractor, getGetMyConnectedAccountsInteractor } from "@/core/di";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getConnectedAccountsAction() {
  return unwrapValidated(getGetMyConnectedAccountsInteractor().invoke());
}

export async function getCalendarsAction(params?: GetQueryParams) {
  return unwrapValidated(getGetCalendarsInteractor().invoke(params));
}
