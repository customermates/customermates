"use server";

import type { UpdateUserDetailsData } from "@/features/user/upsert/update-user-details.interactor";
import type { CreateApiKeyData } from "@/features/api-key/create-api-key.interactor";
import type { DeleteApiKeyData } from "@/features/api-key/delete-api-key.interactor";

import {
  getUpdateUserDetailsInteractor,
  getCreateApiKeyInteractor,
  getDeleteApiKeyInteractor,
  getGetApiKeysInteractor,
  getResendVerificationEmailInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

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
  return unwrapValidated(getGetApiKeysInteractor().invoke());
}

export async function resendVerificationEmailFromAppAction(): Promise<{ ok: boolean }> {
  return await getResendVerificationEmailInteractor().invoke();
}
