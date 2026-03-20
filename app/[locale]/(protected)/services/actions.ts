"use server";

import type { DeleteServiceData } from "@/features/services/delete/delete-service.interactor";
import type { GetServiceByIdData } from "@/features/services/get/get-service-by-id.interactor";
import type { CreateServiceData } from "@/features/services/upsert/create-service.interactor";
import type { UpdateServiceData } from "@/features/services/upsert/update-service.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import { DeleteServiceInteractor } from "@/features/services/delete/delete-service.interactor";
import { GetServicesInteractor } from "@/features/services/get/get-services.interactor";
import { GetServiceByIdInteractor } from "@/features/services/get/get-service-by-id.interactor";
import { CreateServiceInteractor } from "@/features/services/upsert/create-service.interactor";
import { UpdateServiceInteractor } from "@/features/services/upsert/update-service.interactor";
import { di } from "@/core/dependency-injection/container";
import { serializeResult } from "@/core/utils/action-result";

export async function getServicesAction(params?: GetQueryParams) {
  const result = await di.get(GetServicesInteractor).invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function createServiceAction(data: CreateServiceData) {
  return serializeResult(di.get(CreateServiceInteractor).invoke(data));
}

export async function updateServiceAction(data: UpdateServiceData) {
  return serializeResult(di.get(UpdateServiceInteractor).invoke(data));
}

export async function deleteServiceAction(data: DeleteServiceData) {
  return di.get(DeleteServiceInteractor).invoke(data);
}

export async function getServiceByIdAction(data: GetServiceByIdData) {
  const result = await di.get(GetServiceByIdInteractor).invoke(data);
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
    customFieldValues: [],
  });

  return result.ok ? result.data : null;
}
