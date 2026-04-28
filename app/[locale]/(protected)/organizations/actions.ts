"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DeleteOrganizationData } from "@/features/organizations/delete/delete-organization.interactor";
import type { GetOrganizationByIdData } from "@/features/organizations/get/get-organization-by-id.interactor";
import type { CreateOrganizationData } from "@/features/organizations/upsert/create-organization.interactor";
import type { UpdateOrganizationData } from "@/features/organizations/upsert/update-organization.interactor";

import {
  getGetOrganizationsInteractor,
  getGetOrganizationByIdInteractor,
  getCreateOrganizationInteractor,
  getUpdateOrganizationInteractor,
  getDeleteOrganizationInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getOrganizationsAction(params?: GetQueryParams) {
  const result = await getGetOrganizationsInteractor().invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function createOrganizationAction(data: CreateOrganizationData) {
  return serializeResult(getCreateOrganizationInteractor().invoke(data));
}

export async function updateOrganizationAction(data: UpdateOrganizationData) {
  return serializeResult(getUpdateOrganizationInteractor().invoke(data));
}

export async function deleteOrganizationAction(data: DeleteOrganizationData) {
  return getDeleteOrganizationInteractor().invoke(data);
}

export async function getOrganizationByIdAction(data: GetOrganizationByIdData) {
  const result = await getGetOrganizationByIdInteractor().invoke(data);
  return result.ok
    ? { entity: result.data.organization, customColumns: result.data.customColumns }
    : { entity: null, customColumns: [] };
}

export async function createOrganizationByNameAction(name: string, userId: string | null | undefined) {
  const result = await createOrganizationAction({
    name,
    notes: null,
    contactIds: [],
    userIds: userId ? [userId] : [],
    dealIds: [],
    taskIds: [],
    customFieldValues: [],
  });

  return result.ok ? result.data : null;
}
