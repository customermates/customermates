"use server";

import type { ManageIncomingWebhookData } from "@/features/incoming-webhook/incoming-webhook.schema";

import { getGetRecordNavigationInteractor, getManageIncomingWebhookInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function manageIncomingWebhookAction(data: ManageIncomingWebhookData) {
  return serializeResult(getManageIncomingWebhookInteractor().invoke(data));
}

export async function listIncomingWebhookListsAction() {
  return serializeResult(getGetRecordNavigationInteractor().invoke());
}
