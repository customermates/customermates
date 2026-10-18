"use server";

import { getResolveUserOptionsInteractor } from "@/core/di";
import type { ResolveUserOptionsInput } from "@/features/user/get/resolve-user-options.interactor";
import type { AdminUpdateUserDetailsData } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { GetUserByIdData } from "@/features/user/get/get-user-by-id.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { SendFeedbackData } from "@/features/feedback/send-feedback.schema";
import type { DeleteRoleData } from "@/features/role/delete-role.interactor";
import type { UpsertRoleData } from "@/features/role/upsert-role.interactor";
import type { UpsertWebhookData } from "@/features/webhook/upsert-webhook.interactor";
import type { DeleteWebhookData } from "@/features/webhook/delete-webhook.interactor";
import type { ResendWebhookDeliveryData } from "@/features/webhook/resend-webhook-delivery.interactor";
import type { InviteUsersByEmailData } from "@/features/company/invite-users-by-email.interactor";
import type { CreateCheckoutSessionData } from "@/ee/subscription/create-checkout-session.interactor";
import type { GetMemberRemovalData } from "@/features/workspace/get-member-removal.interactor";
import type { RemoveWorkspaceMemberData } from "@/features/workspace/remove-workspace-member.interactor";
import type { RenameWorkspaceData } from "@/features/workspace/rename-workspace.interactor";

import { z } from "zod";

import {
  getGetUsersInteractor,
  getGetUserByIdInteractor,
  getAdminUpdateUserDetailsInteractor,
  getGetOrCreateInviteTokenInteractor,
  getInviteUsersByEmailInteractor,
  getSendFeedbackInteractor,
  getGetRolesInteractor,
  getGetRoleEditorInteractor,
  getUpsertRoleInteractor,
  getDeleteRoleInteractor,
  getCreateCheckoutSessionInteractor,
  getAbandonCheckoutInteractor,
  getRefreshSubscriptionInteractor,
  getGetSubscriptionInteractor,
  getGetBillingPortalUrlInteractor,
  getGetWebhooksInteractor,
  getGetWebhookByIdInteractor,
  getUpsertWebhookInteractor,
  getDeleteWebhookInteractor,
  getGetWebhookDeliveriesInteractor,
  getResendWebhookDeliveryInteractor,
  getRemoveWorkspaceMemberInteractor,
  getGetMemberRemovalInteractor,
  getRenameWorkspaceInteractor,
} from "@/core/di";
import { serializeResult, serializeTypedResult } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { activeUsersQuery } from "@/features/user/get/active-users-query";

export async function createCheckoutSessionAction(data: CreateCheckoutSessionData) {
  const result = await getCreateCheckoutSessionInteractor().invoke(data);
  if (isRedirect(result)) return { ok: true as const, data: { checkout: "started" as const, url: result.redirect } };
  if (result.ok) return result;
  return { ok: false as const, error: z.treeifyError(result.error) };
}

export async function abandonCheckoutAction() {
  return serializeResult(getAbandonCheckoutInteractor().invoke());
}

export async function refreshSubscriptionAction() {
  return serializeResult(getRefreshSubscriptionInteractor().invoke());
}

export async function getSubscriptionAction() {
  return serializeTypedResult(getGetSubscriptionInteractor().invoke());
}

export async function getBillingPortalUrlAction() {
  const result = await getGetBillingPortalUrlInteractor().invoke();
  if (isRedirect(result)) return { ok: true as const, data: { url: result.redirect } };
  return { ok: false as const, error: z.treeifyError(result.error) };
}

export async function sendFeedbackAction(data: SendFeedbackData) {
  return serializeResult(getSendFeedbackInteractor().invoke(data));
}

export async function adminUpdateUserDetailsAction(data: AdminUpdateUserDetailsData) {
  return serializeResult(getAdminUpdateUserDetailsInteractor().invoke(data));
}

export async function removeWorkspaceMemberAction(data: RemoveWorkspaceMemberData) {
  return serializeResult(getRemoveWorkspaceMemberInteractor().invoke(data));
}

export async function getMemberRemovalAction(data: GetMemberRemovalData) {
  return serializeResult(getGetMemberRemovalInteractor().invoke(data));
}

export async function renameWorkspaceAction(data: RenameWorkspaceData) {
  return serializeResult(getRenameWorkspaceInteractor().invoke(data));
}

export async function getOrCreateInviteTokenAction() {
  const result = await getGetOrCreateInviteTokenInteractor().invoke();
  return result.data;
}

export async function inviteUsersByEmailAction(data: InviteUsersByEmailData) {
  return serializeResult(getInviteUsersByEmailInteractor().invoke(data));
}

export async function getRolesAction(params?: GetQueryParams) {
  return unwrapValidated(getGetRolesInteractor().invoke(params));
}

export async function getRoleEditorAction(data: { id?: string }) {
  return serializeResult(getGetRoleEditorInteractor().invoke(data));
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

export async function getActiveUsersAction(params?: GetQueryParams) {
  return unwrapValidated(getGetUsersInteractor().invoke(activeUsersQuery(params)));
}

export async function getUserByIdAction(data: GetUserByIdData) {
  const result = await getGetUserByIdInteractor().invoke(data);
  return result.ok ? result.data : { user: null };
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

export async function resolveWebhookOptionsAction(ids: string[]) {
  const selected = z
    .array(z.uuid())
    .max(100)
    .parse([...new Set(ids)]);
  const results = await Promise.all(selected.map((id) => getGetWebhookByIdInteractor().invoke({ id })));
  return results.flatMap((result) =>
    result.ok
      ? [
          {
            id: result.data.id,
            url: result.data.url,
            description: result.data.description,
          },
        ]
      : [],
  );
}

export async function getWebhookDeliveriesAction(params?: GetQueryParams) {
  return unwrapValidated(getGetWebhookDeliveriesInteractor().invoke(params));
}

export async function resendWebhookDeliveryAction(data: ResendWebhookDeliveryData) {
  return serializeResult(getResendWebhookDeliveryInteractor().invoke(data));
}

export async function resolveUserOptionsAction(input: ResolveUserOptionsInput) {
  return unwrapValidated(getResolveUserOptionsInteractor().invoke(input));
}
