"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { ManageIncomingWebhookData } from "@/features/incoming-webhook/incoming-webhook.schema";

import { getGetIncomingWebhooksInteractor, getManageIncomingWebhookInteractor } from "@/core/di";
import { serializeResult, serializeTypedResult } from "@/core/utils/action-result";

export async function getIncomingWebhooksAction(params?: GetQueryParams) {
  return serializeTypedResult(getGetIncomingWebhooksInteractor().invoke(params));
}

export async function manageIncomingWebhookAction(data: ManageIncomingWebhookData) {
  return serializeResult(getManageIncomingWebhookInteractor().invoke(data));
}
