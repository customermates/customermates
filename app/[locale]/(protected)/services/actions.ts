"use server";

import type { DeleteServiceData } from "@/features/services/delete/delete-service.interactor";
import type { GetServiceByIdData } from "@/features/services/get/get-service-by-id.interactor";
import type { CreateServiceData } from "@/features/services/upsert/create-service.interactor";
import type { UpdateServiceData } from "@/features/services/upsert/update-service.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import {
  getGetServicesInteractor,
  getGetServiceByIdInteractor,
  getCreateServiceInteractor,
  getUpdateServiceInteractor,
  getDeleteServiceInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getServicesAction(params?: GetQueryParams) {
  const result = await getGetServicesInteractor().invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function createServiceAction(data: CreateServiceData) {
  return serializeResult(getCreateServiceInteractor().invoke(data));
}

export async function updateServiceAction(data: UpdateServiceData) {
  return serializeResult(getUpdateServiceInteractor().invoke(data));
}

export async function deleteServiceAction(data: DeleteServiceData) {
  return getDeleteServiceInteractor().invoke(data);
}

export async function getServiceByIdAction(data: GetServiceByIdData) {
  const result = await getGetServiceByIdInteractor().invoke(data);
  return result.ok
    ? { entity: result.data.service, customColumns: result.data.customColumns }
    : { entity: null, customColumns: [] };
}

export async function createServiceByNameAction(name: string, userId: string | null | undefined) {
  const result = await createServiceAction({
    name,
    amount: 100,
    notes: null,
    userIds: userId ? [userId] : [],
    dealIds: [],
    taskIds: [],
    customFieldValues: [],
  });

  return result.ok ? result.data : null;
}
