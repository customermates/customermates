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
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getServicesAction(params?: GetQueryParams) {
  return unwrapValidated(getGetServicesInteractor().invoke(params));
}

export async function createServiceAction(data: CreateServiceData) {
  return serializeResult(getCreateServiceInteractor().invoke(data));
}

export async function updateServiceAction(data: UpdateServiceData) {
  return serializeResult(getUpdateServiceInteractor().invoke(data));
}

export async function deleteServiceAction(data: DeleteServiceData) {
  return serializeResult(getDeleteServiceInteractor().invoke(data));
}

export async function getServiceByIdAction(data: GetServiceByIdData) {
  const result = await unwrapValidated(getGetServiceByIdInteractor().invoke(data));
  return { entity: result.service, customColumns: result.customColumns };
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

  return result;
}
