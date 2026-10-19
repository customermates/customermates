"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { InteractorOutcome } from "@/core/validation/validation.utils";

import { z } from "zod";

import {
  getGetCalendarsInteractor,
  getGetCalendarByIdInteractor,
  getGetMessagingFilterOptionsInteractor,
  getGetMyConnectedAccountsInteractor,
} from "@/core/di";
import { serializeTypedData, serializeTypedResult } from "@/core/utils/action-result";

export async function getConnectedAccountsAction() {
  return serializeTypedResult(getGetMyConnectedAccountsInteractor().invoke());
}

export async function getMessagingFilterOptionsAction() {
  return serializeTypedResult(getGetMessagingFilterOptionsInteractor().invoke());
}

export async function getCalendarsAction(params?: GetQueryParams) {
  return serializeTypedResult(getGetCalendarsInteractor().invoke(params));
}

export async function resolveCalendarOptionsAction(ids: string[]) {
  const selected = z
    .array(z.uuid())
    .max(100)
    .parse([...new Set(ids)]);
  const results = Promise.all(selected.map((id) => getGetCalendarByIdInteractor().invoke({ id })));
  return serializeTypedData(
    results.then((data): InteractorOutcome<typeof data> => ({ ok: true, data })),
    (settled) =>
      settled.flatMap((result) =>
        result.ok
          ? [
              {
                id: result.data.id,
                name: result.data.name,
                provider: result.data.provider,
              },
            ]
          : [],
      ),
  );
}
