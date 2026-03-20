"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DeleteDealData } from "@/features/deals/delete/delete-deal.interactor";
import type { GetDealByIdData } from "@/features/deals/get/get-deal-by-id.interactor";
import type { CreateDealData } from "@/features/deals/upsert/create-deal.interactor";
import type { UpdateDealData } from "@/features/deals/upsert/update-deal.interactor";

import { di } from "@/core/dependency-injection/container";
import { DeleteDealInteractor } from "@/features/deals/delete/delete-deal.interactor";
import { GetDealsInteractor } from "@/features/deals/get/get-deals.interactor";
import { GetDealByIdInteractor } from "@/features/deals/get/get-deal-by-id.interactor";
import { CreateDealInteractor } from "@/features/deals/upsert/create-deal.interactor";
import { UpdateDealInteractor } from "@/features/deals/upsert/update-deal.interactor";
import { serializeResult } from "@/core/utils/action-result";

export async function getDealsAction(params?: GetQueryParams) {
  const result = await di.get(GetDealsInteractor).invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function createDealAction(data: CreateDealData) {
  return serializeResult(di.get(CreateDealInteractor).invoke(data));
}

export async function updateDealAction(data: UpdateDealData) {
  return serializeResult(di.get(UpdateDealInteractor).invoke(data));
}

export async function deleteDealAction(data: DeleteDealData) {
  return di.get(DeleteDealInteractor).invoke(data);
}

export async function getDealByIdAction(data: GetDealByIdData) {
  const result = await di.get(GetDealByIdInteractor).invoke(data);
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
    customFieldValues: [],
  });

  return result.ok ? result.data : null;
}
