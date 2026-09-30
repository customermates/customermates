"use server";

import type { DeleteServiceData } from "@/features/services/delete/delete-service.interactor";
import type { GetServiceByIdData } from "@/features/services/get/get-service-by-id.interactor";
import type { CreateServiceData } from "@/features/services/upsert/create-service.interactor";
import type { UpdateServiceData } from "@/features/services/upsert/update-service.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import { EntityType } from "@/generated/prisma";

import {
  getGetServicesInteractor,
  getGetServiceByIdInteractor,
  getCreateServiceInteractor,
  getCreateServiceByNameInteractor,
  getUpdateServiceInteractor,
  getDeleteServiceInteractor,
  getGetCustomColumnsByEntityTypeInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { retireLegacyRecordWrite } from "@/features/records/retire-legacy-write";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getServicesAction(params?: GetQueryParams) {
  return unwrapValidated(getGetServicesInteractor().invoke(params));
}

export async function createServiceAction(data: CreateServiceData) {
  retireLegacyRecordWrite();
  return serializeResult(getCreateServiceInteractor().invoke(data));
}

export async function updateServiceAction(data: UpdateServiceData) {
  retireLegacyRecordWrite();
  return serializeResult(getUpdateServiceInteractor().invoke(data));
}

export async function deleteServiceAction(data: DeleteServiceData) {
  retireLegacyRecordWrite();
  return serializeResult(getDeleteServiceInteractor().invoke(data));
}

export async function getServiceByIdAction(data: GetServiceByIdData) {
  const result = await getGetServiceByIdInteractor().invoke(data);
  if (result.ok) return { entity: result.data.service, customColumns: result.data.customColumns };

  const customColumns = await unwrapValidated(
    getGetCustomColumnsByEntityTypeInteractor().invoke({ entityType: EntityType.service }),
  );
  return { entity: null, customColumns };
}

export async function createServiceByNameAction(name: string, userId: string | null | undefined) {
  retireLegacyRecordWrite();
  return serializeResult(getCreateServiceByNameInteractor().invoke({ name, userId }));
}
