"use server";

import type { AdminUpdateUserDetailsData } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { GetUserByIdData } from "@/features/user/get/get-user-by-id.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { SendFeedbackData } from "@/features/feedback/send-feedback.schema";
import type { UpdateCompanySettingsData } from "@/features/company/update-company-settings.interactor";
import type { DeleteRoleData } from "@/features/role/delete-role.interactor";
import type { UpsertRoleData } from "@/features/role/upsert-role.interactor";
import type { UpsertWebhookData } from "@/features/webhook/upsert-webhook.interactor";
import type { DeleteWebhookData } from "@/features/webhook/delete-webhook.interactor";
import type { ResendWebhookDeliveryData } from "@/features/webhook/resend-webhook-delivery.interactor";
import type { InviteUsersByEmailData } from "@/features/company/invite-users-by-email.interactor";
import type { CreateCheckoutSessionData } from "@/ee/subscription/create-checkout-session.interactor";

import { z } from "zod";

import {
  getGetDealsInteractor,
  getGetUsersInteractor,
  getGetUserByIdInteractor,
  getAdminUpdateUserDetailsInteractor,
  getGetCompanySettingsInteractor,
  getUpdateCompanySettingsInteractor,
  getGetOrCreateInviteTokenInteractor,
  getInviteUsersByEmailInteractor,
  getSendFeedbackInteractor,
  getGetRolesInteractor,
  getUpsertRoleInteractor,
  getDeleteRoleInteractor,
  getCreateCheckoutSessionInteractor,
  getRefreshSubscriptionInteractor,
  getGetSubscriptionInteractor,
  getGetWebhooksInteractor,
  getUpsertWebhookInteractor,
  getDeleteWebhookInteractor,
  getGetWebhookDeliveriesInteractor,
  getResendWebhookDeliveryInteractor,
  getGetAuditLogsInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function createCheckoutSessionAction(data: CreateCheckoutSessionData) {
  const result = await getCreateCheckoutSessionInteractor().invoke(data);
  if (isRedirect(result)) return { ok: true as const, data: { url: result.redirect } };
  return { ok: false as const, error: z.treeifyError(result.error) };
}

export async function refreshSubscriptionAction() {
  return serializeResult(getRefreshSubscriptionInteractor().invoke());
}

export async function getSubscriptionAction() {
  const result = await getGetSubscriptionInteractor().invoke();
  return result.data;
}

export async function updateCompanyAction(data: UpdateCompanySettingsData) {
  return serializeResult(getUpdateCompanySettingsInteractor().invoke(data));
}

export async function getDealStageValueSumsAction(columnId: string) {
  const result = await getGetDealsInteractor().invoke({
    grouping: { field: columnId },
    groupPage: { perGroup: 1 },
  });

  if (!result.ok) return { ok: false as const, error: z.treeifyError(result.error) };

  return { ok: true as const, data: result.data.groupValueSums ?? {} };
}

export async function sendFeedbackAction(data: SendFeedbackData) {
  return serializeResult(getSendFeedbackInteractor().invoke(data));
}

export async function adminUpdateUserDetailsAction(data: AdminUpdateUserDetailsData) {
  return serializeResult(getAdminUpdateUserDetailsInteractor().invoke(data));
}

export async function getOrCreateInviteTokenAction() {
  const result = await getGetOrCreateInviteTokenInteractor().invoke();
  return result.data;
}

export async function inviteUsersByEmailAction(data: InviteUsersByEmailData) {
  return serializeResult(getInviteUsersByEmailInteractor().invoke(data));
}

export async function getCompanyDetailsAction() {
  const result = await getGetCompanySettingsInteractor().invoke();
  return result.data;
}

export async function getRolesAction(params?: GetQueryParams) {
  return unwrapValidated(getGetRolesInteractor().invoke(params));
}

export async function upsertRoleAction(data: UpsertRoleData) {
  return serializeResult(getUpsertRoleInteractor().invoke(data));
}

export async function deleteRoleAction(data: DeleteRoleData) {
  return serializeResult(getDeleteRoleInteractor().invoke(data));
}

export async function getUsersAction(params?: GetQueryParams) {
  return unwrapValidated(getGetUsersInteractor().invoke(params));
}

export async function getUserByIdAction(data: GetUserByIdData) {
  const result = await getGetUserByIdInteractor().invoke(data);
  return result.ok ? result.data : { user: null };
}

export async function getAuditLogsAction(params?: GetQueryParams) {
  return unwrapValidated(getGetAuditLogsInteractor().invoke(params));
}

export async function upsertWebhookAction(data: UpsertWebhookData) {
  return serializeResult(getUpsertWebhookInteractor().invoke(data));
}

export async function deleteWebhookAction(data: DeleteWebhookData) {
  return serializeResult(getDeleteWebhookInteractor().invoke(data));
}

export async function getWebhooksAction(params?: GetQueryParams) {
  return unwrapValidated(getGetWebhooksInteractor().invoke(params));
}

export async function getWebhookDeliveriesAction(params?: GetQueryParams) {
  return unwrapValidated(getGetWebhookDeliveriesInteractor().invoke(params));
}

export async function resendWebhookDeliveryAction(data: ResendWebhookDeliveryData) {
  return serializeResult(getResendWebhookDeliveryInteractor().invoke(data));
}
