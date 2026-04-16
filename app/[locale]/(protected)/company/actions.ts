"use server";

import type { AdminUpdateUserDetailsData } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { GetUserByIdData } from "@/features/user/get/get-user-by-id.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { UpdateCompanyDetailsData } from "@/features/company/update-company-details.interactor";
import type { SendFeedbackData } from "@/features/feedback/send-feedback.schema";
import type { DeleteRoleData } from "@/features/role/delete-role.interactor";
import type { UpsertRoleData } from "@/features/role/upsert-role.interactor";
import type { UpsertWebhookData } from "@/features/webhook/upsert-webhook.interactor";
import type { DeleteWebhookData } from "@/features/webhook/delete-webhook.interactor";
import type { ResendWebhookDeliveryData } from "@/features/webhook/resend-webhook-delivery.interactor";

import {
  getGetUsersInteractor,
  getGetUserByIdInteractor,
  getAdminUpdateUserDetailsInteractor,
  getGetCompanyDetailsInteractor,
  getGetOrCreateInviteTokenInteractor,
  getUpdateCompanyDetailsInteractor,
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

export async function createCheckoutSessionAction() {
  return getCreateCheckoutSessionInteractor().invoke();
}

export async function refreshSubscriptionAction() {
  return getRefreshSubscriptionInteractor().invoke();
}

export async function getSubscriptionAction() {
  const result = await getGetSubscriptionInteractor().invoke();
  return result.data;
}

export async function updateCompanyAction(data: UpdateCompanyDetailsData) {
  return serializeResult(getUpdateCompanyDetailsInteractor().invoke(data));
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

export async function getCompanyDetailsAction() {
  const result = await getGetCompanyDetailsInteractor().invoke();
  return result.data;
}

export async function getRolesAction(params?: GetQueryParams) {
  const result = await getGetRolesInteractor().invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function upsertRoleAction(data: UpsertRoleData) {
  return serializeResult(getUpsertRoleInteractor().invoke(data));
}

export async function deleteRoleAction(data: DeleteRoleData) {
  const result = await getDeleteRoleInteractor().invoke(data);
  return result.data;
}

export async function getUsersAction(params?: GetQueryParams) {
  const result = await getGetUsersInteractor().invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function getUserByIdAction(data: GetUserByIdData) {
  const result = await getGetUserByIdInteractor().invoke(data);
  return result.ok ? result.data : { user: null };
}

export async function getAuditLogsAction(params?: GetQueryParams) {
  const result = await getGetAuditLogsInteractor().invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function upsertWebhookAction(data: UpsertWebhookData) {
  return serializeResult(getUpsertWebhookInteractor().invoke(data));
}

export async function deleteWebhookAction(data: DeleteWebhookData) {
  return serializeResult(getDeleteWebhookInteractor().invoke(data));
}

export async function getWebhooksAction(params?: GetQueryParams) {
  const result = await getGetWebhooksInteractor().invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function getWebhookDeliveriesAction(params?: GetQueryParams) {
  const result = await getGetWebhookDeliveriesInteractor().invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function resendWebhookDeliveryAction(data: ResendWebhookDeliveryData) {
  return getResendWebhookDeliveryInteractor().invoke(data);
}
