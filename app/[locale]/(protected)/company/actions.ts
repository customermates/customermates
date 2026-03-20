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

import { AdminUpdateUserDetailsInteractor } from "@/features/user/upsert/admin-update-user-details.interactor";
import { GetUsersInteractor } from "@/features/user/get/get-users.interactor";
import { GetUserByIdInteractor } from "@/features/user/get/get-user-by-id.interactor";
import { di } from "@/core/dependency-injection/container";
import { GetCompanyDetailsInteractor } from "@/features/company/get-company-details.interactor";
import { GetOrCreateInviteTokenInteractor } from "@/features/company/get-or-create-invite-token.interactor";
import { UpdateCompanyDetailsInteractor } from "@/features/company/update-company-details.interactor";
import { SendFeedbackInteractor } from "@/features/feedback/send-feedback.interactor";
import { DeleteRoleInteractor } from "@/features/role/delete-role.interactor";
import { GetRolesInteractor } from "@/features/role/get-roles.interactor";
import { UpsertRoleInteractor } from "@/features/role/upsert-role.interactor";
import { serializeResult } from "@/core/utils/action-result";
import { CreateCheckoutSessionInteractor } from "@/ee/subscription/create-checkout-session.interactor";
import { RefreshSubscriptionInteractor } from "@/ee/subscription/refresh-subscription.interactor";
import { GetSubscriptionInteractor } from "@/ee/subscription/get-subscription.interactor";
import { GetWebhooksInteractor } from "@/features/webhook/get-webhooks.interactor";
import { UpsertWebhookInteractor } from "@/features/webhook/upsert-webhook.interactor";
import { DeleteWebhookInteractor } from "@/features/webhook/delete-webhook.interactor";
import { GetWebhookDeliveriesInteractor } from "@/features/webhook/get-webhook-deliveries.interactor";
import { ResendWebhookDeliveryInteractor } from "@/features/webhook/resend-webhook-delivery.interactor";
import { GetAuditLogsInteractor } from "@/ee/audit-log/get/get-audit-logs.interactor";

export async function createCheckoutSessionAction() {
  return di.get(CreateCheckoutSessionInteractor).invoke();
}

export async function refreshSubscriptionAction() {
  return di.get(RefreshSubscriptionInteractor).invoke();
}

export async function getSubscriptionAction() {
  return di.get(GetSubscriptionInteractor).invoke();
}

export async function updateCompanyAction(data: UpdateCompanyDetailsData) {
  return serializeResult(di.get(UpdateCompanyDetailsInteractor).invoke(data));
}

export async function sendFeedbackAction(data: SendFeedbackData) {
  return serializeResult(di.get(SendFeedbackInteractor).invoke(data));
}

export async function adminUpdateUserDetailsAction(data: AdminUpdateUserDetailsData) {
  return serializeResult(di.get(AdminUpdateUserDetailsInteractor).invoke(data));
}

export async function getOrCreateInviteTokenAction() {
  return di.get(GetOrCreateInviteTokenInteractor).invoke();
}

export async function getCompanyDetailsAction() {
  return di.get(GetCompanyDetailsInteractor).invoke();
}

export async function getRolesAction(params?: GetQueryParams) {
  const result = await di.get(GetRolesInteractor).invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function upsertRoleAction(data: UpsertRoleData) {
  return serializeResult(di.get(UpsertRoleInteractor).invoke(data));
}

export async function deleteRoleAction(data: DeleteRoleData) {
  return di.get(DeleteRoleInteractor).invoke(data);
}

export async function getUsersAction(params?: GetQueryParams) {
  const result = await di.get(GetUsersInteractor).invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function getUserByIdAction(data: GetUserByIdData) {
  const result = await di.get(GetUserByIdInteractor).invoke(data);
  return result.ok ? result.data : { user: null };
}

export async function getAuditLogsAction(params?: GetQueryParams) {
  const result = await di.get(GetAuditLogsInteractor).invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function upsertWebhookAction(data: UpsertWebhookData) {
  return serializeResult(di.get(UpsertWebhookInteractor).invoke(data));
}

export async function deleteWebhookAction(data: DeleteWebhookData) {
  return serializeResult(di.get(DeleteWebhookInteractor).invoke(data));
}

export async function getWebhooksAction(params?: GetQueryParams) {
  const result = await di.get(GetWebhooksInteractor).invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function getWebhookDeliveriesAction(params?: GetQueryParams) {
  const result = await di.get(GetWebhookDeliveriesInteractor).invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function resendWebhookDeliveryAction(data: ResendWebhookDeliveryData) {
  return di.get(ResendWebhookDeliveryInteractor).invoke(data);
}
