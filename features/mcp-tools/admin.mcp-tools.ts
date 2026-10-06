import { z } from "zod";

import {
  customMcpFailure,
  mcpInteractorFailure,
  mcpMessageFailure,
  mcpValidationFailure,
  runInteractor,
  toonResult,
} from "./utils";

import {
  getAdminUpdateUserDetailsInteractor,
  getGetTeamMemberInteractor,
  getInviteUsersByEmailInteractor,
  getUpdateUserDetailsInteractor,
} from "@/core/di";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { UpdateUserDetailsSchema } from "@/features/user/upsert/update-user-details.interactor";
import { AdminUpdateUserDetailsSchema } from "@/features/user/upsert/admin-update-user-details.interactor";
import { GetUserByIdSchema } from "@/features/user/get/get-user-by-id.interactor";
import { InviteUsersByEmailSchema } from "@/features/company/invite-users-by-email.interactor";

const UpdateWorkspaceSettingsSchema = z
  .object({
    firstName: UpdateUserDetailsSchema.shape.firstName.describe("Omit to keep existing"),
    lastName: UpdateUserDetailsSchema.shape.lastName.describe("Omit to keep existing"),
    country: UpdateUserDetailsSchema.shape.country.describe("ISO country code. Omit to keep existing."),
    avatarUrl: UpdateUserDetailsSchema.shape.avatarUrl.describe(
      "HTTPS avatar URL, or '' / null to clear. Omit to keep existing.",
    ),
  })
  .strict();

const ProfileWorkspaceSettingsSchema = UpdateUserDetailsSchema.pick({
  firstName: true,
  lastName: true,
  country: true,
  avatarUrl: true,
}).refine(
  (data) =>
    data.firstName !== undefined ||
    data.lastName !== undefined ||
    data.country !== undefined ||
    data.avatarUrl !== undefined,
  { message: "Profile settings need at least one changed field." },
);

const UpdateWorkspaceSettingsOutputSchema = z.looseObject({ message: z.string() });
const ManageTeamOutputSchema = z
  .looseObject({
    sent: z.number().optional(),
    email: z.string().optional(),
    roleId: z.string().nullable().optional(),
    status: z.string().optional(),
    message: z.string(),
  })
  .describe("action invite returns sent and message; update_member returns email, roleId, status and message.");

export const updateWorkspaceSettingsTool = {
  name: "update_workspace_settings",
  title: "Update workspace settings",
  description:
    "Use this when updating the current user's profile. " +
    "It is a partial update of firstName, lastName, country, avatarUrl; omitted fields keep their current values. " +
    "Money fields carry their own currency: change it, or rename record types, through configure_record_model using stable IDs.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: UpdateWorkspaceSettingsSchema,
  outputSchema: UpdateWorkspaceSettingsOutputSchema,
  execute: async (params: z.infer<typeof UpdateWorkspaceSettingsSchema>) => {
    const input = UpdateWorkspaceSettingsSchema.safeParse(params);
    if (!input.success) return mcpValidationFailure(input.error);
    const parsed = ProfileWorkspaceSettingsSchema.safeParse(input.data);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    return runInteractor(getUpdateUserDetailsInteractor().invoke(parsed.data), (data) =>
      toonResult({
        ...(parsed.data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(parsed.data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(parsed.data.country !== undefined ? { country: data.country } : {}),
        ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        message: "Profile updated",
      }),
    );
  },
};

const ManageTeamSchema = z.object({
  action: z
    .enum(["invite", "update_member"])
    .describe(
      "invite = send invitation emails (emails); update_member = change an existing member's role or status (userId plus roleId and/or status).",
    ),
  emails: InviteUsersByEmailSchema.shape.emails
    .optional()
    .describe("invite action: required, 1 to 20 email addresses, each receives a real invitation email"),
  userId: GetUserByIdSchema.shape.id.optional().describe("update_member action: required, user id from list_users"),
  roleId: AdminUpdateUserDetailsSchema.shape.roleId
    .optional()
    .describe("update_member action: new role id from get_workspace_context roles. Omit to keep the current role."),
  status: AdminUpdateUserDetailsSchema.shape.status
    .optional()
    .describe("update_member action: new status. Omit to keep the current status."),
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
    "action update_member changes an existing member's role or status: pass userId from list_users.items[].id plus roleId from get_workspace_context.roles[].id and/or status, omitted fields keep their current values; " +
    "a member who has no role assigned yet (e.g. a still pending invite) has no role to keep, so you must pass roleId together with the change or the call is rejected. " +
    "last-admin protection is enforced server-side, the workspace can never lose its last active admin. " +
    "invite requires create permission on users; update_member requires update permission and read access to all users (Manage and read All on Users & Roles).",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: ManageTeamSchema,
  outputSchema: ManageTeamOutputSchema,
  execute: async (params: z.infer<typeof ManageTeamSchema>) => {
    if (params.action === "invite") {
      const parsed = InviteUsersByEmailSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getInviteUsersByEmailInteractor().invoke(parsed.data), (data) =>
        toonResult({ sent: data.sent, message: "Invitation emails sent" }),
      );
    }
    const parsed = UpdateMemberSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    const loaded = await getGetTeamMemberInteractor().invoke({
      id: parsed.data.userId,
    });
    if (!loaded.ok) return mcpInteractorFailure(loaded.error);
    const member = loaded.data.user;
    if (!member) return customMcpFailure(CustomErrorCode.userNotFound);
    if (member.roleId == null && parsed.data.roleId == null)
      return mcpMessageFailure("This member has no role assigned yet, so pass roleId together with the change.");

    const candidate = AdminUpdateUserDetailsSchema.safeParse({
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      country: member.country,
      avatarUrl: member.avatarUrl,
      roleId: parsed.data.roleId ?? member.roleId,
      status: parsed.data.status ?? member.status,
    });
    if (!candidate.success) return mcpValidationFailure(candidate.error);
    return runInteractor(getAdminUpdateUserDetailsInteractor().invoke(candidate.data), (data) =>
      toonResult({
        email: data.email,
        roleId: data.roleId,
        status: data.status,
        message: "Member updated",
      }),
    );
  },
};
