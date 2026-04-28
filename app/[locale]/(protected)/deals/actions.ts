"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DeleteDealData } from "@/features/deals/delete/delete-deal.interactor";
import type { GetDealByIdData } from "@/features/deals/get/get-deal-by-id.interactor";
import type { CreateDealData } from "@/features/deals/upsert/create-deal.interactor";
import type { UpdateDealData } from "@/features/deals/upsert/update-deal.interactor";

import {
  getGetDealsInteractor,
  getGetDealByIdInteractor,
  getCreateDealInteractor,
  getUpdateDealInteractor,
  getDeleteDealInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getDealsAction(params?: GetQueryParams) {
  const result = await getGetDealsInteractor().invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function createDealAction(data: CreateDealData) {
  return serializeResult(getCreateDealInteractor().invoke(data));
}

export async function updateDealAction(data: UpdateDealData) {
  return serializeResult(getUpdateDealInteractor().invoke(data));
}

export async function deleteDealAction(data: DeleteDealData) {
  return getDeleteDealInteractor().invoke(data);
}

export async function getDealByIdAction(data: GetDealByIdData) {
  const result = await getGetDealByIdInteractor().invoke(data);
  return result.ok
    ? { entity: result.data.deal, customColumns: result.data.customColumns }
    : { entity: null, customColumns: [] };
}

export async function createDealByNameAction(name: string, userId: string | null | undefined) {
  const result = await createDealAction({
    name,
    notes: null,
    organizationIds: [],
    userIds: userId ? [userId] : [],
    contactIds: [],
    services: [],
    taskIds: [],
    customFieldValues: [],
  });

  return result.ok ? result.data : null;
}
