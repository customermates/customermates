"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DeleteOrganizationData } from "@/features/organizations/delete/delete-organization.interactor";
import type { GetOrganizationByIdData } from "@/features/organizations/get/get-organization-by-id.interactor";
import type { CreateOrganizationData } from "@/features/organizations/upsert/create-organization.interactor";
import type { UpdateOrganizationData } from "@/features/organizations/upsert/update-organization.interactor";

import { di } from "@/core/dependency-injection/container";
import { DeleteOrganizationInteractor } from "@/features/organizations/delete/delete-organization.interactor";
import { GetOrganizationsInteractor } from "@/features/organizations/get/get-organizations.interactor";
import { GetOrganizationByIdInteractor } from "@/features/organizations/get/get-organization-by-id.interactor";
import { CreateOrganizationInteractor } from "@/features/organizations/upsert/create-organization.interactor";
import { UpdateOrganizationInteractor } from "@/features/organizations/upsert/update-organization.interactor";
import { serializeResult } from "@/core/utils/action-result";

export async function getOrganizationsAction(params?: GetQueryParams) {
  const result = await di.get(GetOrganizationsInteractor).invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function createOrganizationAction(data: CreateOrganizationData) {
  return serializeResult(di.get(CreateOrganizationInteractor).invoke(data));
}

export async function updateOrganizationAction(data: UpdateOrganizationData) {
  return serializeResult(di.get(UpdateOrganizationInteractor).invoke(data));
}

export async function deleteOrganizationAction(data: DeleteOrganizationData) {
  return di.get(DeleteOrganizationInteractor).invoke(data);
}

export async function getOrganizationByIdAction(data: GetOrganizationByIdData) {
  const result = await di.get(GetOrganizationByIdInteractor).invoke(data);
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
    customFieldValues: [],
  });

  return result.ok ? result.data : null;
}
