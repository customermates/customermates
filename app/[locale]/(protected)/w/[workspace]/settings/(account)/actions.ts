"use server";

import type { UpdateUserDetailsData } from "@/features/user/upsert/update-user-details.interactor";
import type { CreateApiKeyData } from "@/features/api-key/create-api-key.interactor";
import type { DeleteApiKeyData } from "@/features/api-key/delete-api-key.interactor";

import type { DisconnectConnectedAppData } from "@/features/connected-apps/connected-app.schema";

import {
  getUpdateUserDetailsInteractor,
  getCreateApiKeyInteractor,
  getDeleteApiKeyInteractor,
  getDisconnectConnectedAppInteractor,
  getGetApiKeysInteractor,
  getGetConnectedAppsInteractor,
} from "@/core/di";
import { serializeResult, serializeTypedResult } from "@/core/utils/action-result";

export async function updateUserAction(data: UpdateUserDetailsData) {
  return serializeResult(getUpdateUserDetailsInteractor().invoke(data));
}

export async function createApiKeyAction(data: CreateApiKeyData) {
  return serializeResult(getCreateApiKeyInteractor().invoke(data));
}

export async function deleteApiKeyAction(data: DeleteApiKeyData) {
  return serializeResult(getDeleteApiKeyInteractor().invoke(data));
}

export async function refreshApiKeysAction() {
  return serializeTypedResult(getGetApiKeysInteractor().invoke());
}

export async function disconnectConnectedAppAction(data: DisconnectConnectedAppData) {
  return serializeResult(getDisconnectConnectedAppInteractor().invoke(data));
}

export async function refreshConnectedAppsAction() {
  return serializeTypedResult(getGetConnectedAppsInteractor().invoke());
}
