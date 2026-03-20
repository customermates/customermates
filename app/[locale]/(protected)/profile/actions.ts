"use server";

import type { UpdateUserDetailsData } from "@/features/user/upsert/update-user-details.interactor";
import type { UpdateUserSettingsData } from "@/features/user/upsert/update-user-settings.interactor";
import type { CreateApiKeyData } from "@/features/api-key/create-api-key.interactor";
import type { DeleteApiKeyData } from "@/features/api-key/delete-api-key.interactor";

import { di } from "@/core/dependency-injection/container";
import { UpdateUserDetailsInteractor } from "@/features/user/upsert/update-user-details.interactor";
import { UpdateUserSettingsInteractor } from "@/features/user/upsert/update-user-settings.interactor";
import { CreateApiKeyInteractor } from "@/features/api-key/create-api-key.interactor";
import { DeleteApiKeyInteractor } from "@/features/api-key/delete-api-key.interactor";
import { GetApiKeysInteractor } from "@/features/api-key/get-api-keys.interactor";
import { serializeResult } from "@/core/utils/action-result";

export async function updateUserAction(data: UpdateUserDetailsData) {
  return serializeResult(di.get(UpdateUserDetailsInteractor).invoke(data));
}

export async function updateSettingsAction(data: UpdateUserSettingsData) {
  return serializeResult(di.get(UpdateUserSettingsInteractor).invoke(data));
}

export async function createApiKeyAction(data: CreateApiKeyData) {
  return serializeResult(di.get(CreateApiKeyInteractor).invoke(data));
}

export async function deleteApiKeyAction(data: DeleteApiKeyData) {
  return di.get(DeleteApiKeyInteractor).invoke(data);
}

export async function refreshApiKeysAction() {
  return di.get(GetApiKeysInteractor).invoke();
}
