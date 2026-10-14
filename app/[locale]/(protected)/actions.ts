"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";

import { z } from "zod";

import {
  getGetCalendarsInteractor,
  getGetCalendarByIdInteractor,
  getGetMessagingFilterOptionsInteractor,
  getGetMyConnectedAccountsInteractor,
} from "@/core/di";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getConnectedAccountsAction() {
  return unwrapValidated(getGetMyConnectedAccountsInteractor().invoke());
}

export async function getMessagingFilterOptionsAction() {
  return unwrapValidated(getGetMessagingFilterOptionsInteractor().invoke());
}

export async function getCalendarsAction(params?: GetQueryParams) {
  return unwrapValidated(getGetCalendarsInteractor().invoke(params));
}

export async function resolveCalendarOptionsAction(ids: string[]) {
  const selected = z
    .array(z.uuid())
    .max(100)
    .parse([...new Set(ids)]);
  const results = await Promise.all(selected.map((id) => getGetCalendarByIdInteractor().invoke({ id })));
  return results.flatMap((result) =>
    result.ok
      ? [
          {
            id: result.data.id,
            name: result.data.name,
            provider: result.data.provider,
          },
        ]
      : [],
  );
}
