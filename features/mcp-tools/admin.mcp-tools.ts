import { z } from "zod";
import { CountryCode, Currency } from "@/generated/prisma";

import {
  customErrorMessage,
  encodeToToon,
  enumHint,
  runInteractor,
  validationError,
  VALIDATION_ERROR_PREFIX,
} from "./utils";

import {
  getAdminUpdateUserDetailsInteractor,
  getGetUserByIdInteractor,
  getInviteUsersByEmailInteractor,
  getUpdateCompanySettingsInteractor,
  getUpdateUserDetailsInteractor,
} from "@/core/di";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { UpdateUserDetailsSchema } from "@/features/user/upsert/update-user-details.interactor";
import { AdminUpdateUserDetailsSchema } from "@/features/user/upsert/admin-update-user-details.interactor";
import { GetUserByIdSchema } from "@/features/user/get/get-user-by-id.interactor";
import { UpdateCompanySettingsSchema } from "@/features/company/update-company-settings.interactor";
import { InviteUsersByEmailSchema } from "@/features/company/invite-users-by-email.interactor";

const countryValues = Object.values(CountryCode);
const currencyValues = Object.values(Currency);
const memberStatusValues = AdminUpdateUserDetailsSchema.shape.status.options;

const UpdateWorkspaceSettingsSchema = z.object({
  target: z
    .enum(["profile", "company"])
    .describe("profile = the authenticated user's own profile, company = the company profile (admin rights required)"),
  firstName: UpdateUserDetailsSchema.shape.firstName.describe("profile target: omit to keep existing"),
  lastName: UpdateUserDetailsSchema.shape.lastName.describe("profile target: omit to keep existing"),
  country: UpdateUserDetailsSchema.shape.country.describe(
    `profile target: ISO country code ${enumHint(countryValues)}. Omit to keep existing.`,
  ),
  avatarUrl: UpdateUserDetailsSchema.shape.avatarUrl.describe(
    "profile target: HTTPS avatar URL, or '' / null to clear. Omit to keep existing.",
  ),
  currency: UpdateCompanySettingsSchema.shape.currency
    .optional()
    .describe(`company target: required ${enumHint(currencyValues)}`),
});

export const updateWorkspaceSettingsTool = {
  name: "update_workspace_settings",
  title: "Update workspace settings",
  description:
    "Use this when updating the current user's profile or the company profile. " +
    "target profile is a partial update of firstName, lastName, country, avatarUrl; omitted fields keep their current values. " +
    "target company needs currency plus admin rights.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateWorkspaceSettingsSchema,
  execute: async (params: z.infer<typeof UpdateWorkspaceSettingsSchema>) => {
    if (params.target === "profile") {
      const parsed = UpdateUserDetailsSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      return runInteractor(getUpdateUserDetailsInteractor().invoke(parsed.data), (data) =>
        encodeToToon({ firstName: data.firstName, lastName: data.lastName, message: "Profile updated" }),
      );
    }
    const parsed = UpdateCompanySettingsSchema.required({ currency: true }).safeParse(params);
    if (!parsed.success) return validationError(parsed.error);
    return runInteractor(getUpdateCompanySettingsInteractor().invoke(parsed.data), (data) =>
      encodeToToon({ currency: data.currency, message: "Company settings updated" }),
    );
  },
};

const ManageTeamSchema = z.object({
  action: z
    .enum(["invite", "update_member"])
    .describe("invite = send invitation emails, update_member = change an existing member's role or status"),
  emails: InviteUsersByEmailSchema.shape.emails
    .optional()
    .describe("invite action: required, 1 to 20 email addresses, each receives a real invitation email"),
  userId: GetUserByIdSchema.shape.id.optional().describe("update_member action: required, user id from list_users"),
  roleId: AdminUpdateUserDetailsSchema.shape.roleId
    .optional()
    .describe("update_member action: new role id from get_workspace_context roles. Omit to keep the current role."),
  status: AdminUpdateUserDetailsSchema.shape.status
    .optional()
    .describe(`update_member action: ${enumHint(memberStatusValues)}. Omit to keep the current status.`),
});

const UpdateMemberSchema = z.object({
  userId: GetUserByIdSchema.shape.id,
  roleId: AdminUpdateUserDetailsSchema.shape.roleId.optional(),
  status: AdminUpdateUserDetailsSchema.shape.status.optional(),
});

export const manageTeamTool = {
  name: "manage_team",
  title: "Manage team",
  description:
    "Use this when administering team members. " +
    "action invite SENDS REAL INVITATION EMAILS to the given addresses (up to 20 per call). " +
    "action update_member changes an existing member's role or status: pass userId from list_users plus roleId and/or status, omitted fields keep their current values; " +
    "a member who has no role assigned yet (e.g. a still pending invite) has no role to keep, so you must pass roleId together with the change or the call is rejected. " +
    "last-admin protection is enforced server-side, the workspace can never lose its last active admin. " +
    "Needs users admin rights.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: ManageTeamSchema,
  execute: async (params: z.infer<typeof ManageTeamSchema>) => {
    if (params.action === "invite") {
      const parsed = InviteUsersByEmailSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      return runInteractor(getInviteUsersByEmailInteractor().invoke(parsed.data), (data) =>
        encodeToToon({ sent: data.sent, message: "Invitation emails sent" }),
      );
    }
    const parsed = UpdateMemberSchema.safeParse(params);
    if (!parsed.success) return validationError(parsed.error);
    const loaded = await getGetUserByIdInteractor().invoke({ id: parsed.data.userId });
    if (!loaded.ok) return validationError(loaded.error);
    const member = loaded.data.user;
    if (!member) return customErrorMessage(CustomErrorCode.userNotFound);
    if (member.roleId == null && parsed.data.roleId == null)
      return `${VALIDATION_ERROR_PREFIX} This member has no role assigned yet, so pass roleId together with the change.`;

    const candidate = AdminUpdateUserDetailsSchema.safeParse({
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      country: member.country,
      avatarUrl: member.avatarUrl,
      roleId: parsed.data.roleId ?? member.roleId,
      status: parsed.data.status ?? member.status,
    });
    if (!candidate.success) return validationError(candidate.error);
    return runInteractor(getAdminUpdateUserDetailsInteractor().invoke(candidate.data), (data) =>
      encodeToToon({ email: data.email, roleId: data.roleId, status: data.status, message: "Member updated" }),
    );
  },
};
