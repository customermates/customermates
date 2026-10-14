import { z } from "zod";

import { mcpValidationFailure, runInteractor, toonResult } from "./utils";

import {
  getAdminUpdateUserDetailsInteractor,
  getGetInvitationLinkInteractor,
  getInviteUsersByEmailInteractor,
  getUpdateUserDetailsInteractor,
} from "@/core/di";
import { UpdateUserDetailsSchema } from "@/features/user/upsert/update-user-details.interactor";
import { UpdateMemberSchema } from "@/features/user/upsert/admin-update-user-details.interactor";
import { InviteUsersByEmailSchema } from "@/features/company/invite-users-by-email.interactor";

const UpdateMyProfileSchema = z
  .object({
    firstName: UpdateUserDetailsSchema.shape.firstName.describe("Omit to keep existing"),
    lastName: UpdateUserDetailsSchema.shape.lastName.describe("Omit to keep existing"),
    country: UpdateUserDetailsSchema.shape.country.describe("ISO country code. Omit to keep existing."),
    avatarUrl: UpdateUserDetailsSchema.shape.avatarUrl.describe(
      "HTTPS avatar URL, or '' / null to clear. Omit to keep existing.",
    ),
    theme: UpdateUserDetailsSchema.shape.theme.describe("Colour theme: system, light or dark. Omit to keep existing."),
    displayLanguage: UpdateUserDetailsSchema.shape.displayLanguage.describe(
      "Language of the app interface. Omit to keep existing.",
    ),
    formattingLocale: UpdateUserDetailsSchema.shape.formattingLocale.describe(
      "Locale for number, date and currency formatting. Omit to keep existing.",
    ),
  })
  .strict();

const ChangedProfileSchema = UpdateMyProfileSchema.refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  { message: "Profile settings need at least one changed field." },
);

const PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "country",
  "avatarUrl",
  "theme",
  "displayLanguage",
  "formattingLocale",
] as const;

const UpdateMyProfileOutputSchema = z.looseObject({ message: z.string() });
const ManageTeamOutputSchema = z
  .looseObject({
    sent: z.number().optional(),
    link: z.string().optional(),
    expiresAt: z.string().optional(),
    email: z.string().optional(),
    roleId: z.string().nullable().optional(),
    status: z.string().optional(),
    message: z.string(),
  })
  .describe(
    "action invite returns sent and message; invite_link returns link, expiresAt and message; update_member returns email, roleId, status and message.",
  );

export const updateMyProfileTool = {
  name: "update_my_profile",
  title: "Update my profile",
  description:
    "Use this when updating the current user's own profile and preferences. " +
    "It is a partial update of firstName, lastName, country, avatarUrl, theme, displayLanguage and formattingLocale; omitted fields keep their current values. " +
    "It never changes other members or workspace configuration.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: UpdateMyProfileSchema,
  outputSchema: UpdateMyProfileOutputSchema,
  execute: async (params: z.infer<typeof UpdateMyProfileSchema>) => {
    const parsed = ChangedProfileSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    return runInteractor(getUpdateUserDetailsInteractor().invoke(parsed.data), (data) =>
      toonResult({
        ...Object.fromEntries(
          PROFILE_FIELDS.filter((field) => parsed.data[field] !== undefined).map((field) => [field, data[field]]),
        ),
        message: "Profile updated",
      }),
    );
  },
};

const ManageTeamMemberSchema = UpdateMemberSchema.pick({
  userId: true,
  email: true,
  roleId: true,
  status: true,
}).refine(({ userId, email }) => Boolean(userId || email), { path: ["userId"], message: "Provide userId or email" });

const ManageTeamSchema = z.object({
  action: z
    .enum(["invite", "invite_link", "update_member"])
    .describe(
      "invite = send invitation emails (emails); invite_link = return the workspace invitation link to share yourself; update_member = change an existing member's role or status (userId or email plus roleId and/or status).",
    ),
  emails: InviteUsersByEmailSchema.shape.emails
    .optional()
    .describe("invite action: required, 1 to 20 email addresses, each receives a real invitation email"),
  userId: UpdateMemberSchema.shape.userId.describe(
    "update_member action: user id from list_users; provide userId or email",
  ),
  email: UpdateMemberSchema.shape.email.describe(
    "update_member action: member email; provide email or userId, and both must match when supplied",
  ),
  roleId: UpdateMemberSchema.shape.roleId.describe(
    "update_member action: new role id from get_workspace_context roles. Omit to keep the current role.",
  ),
  status: UpdateMemberSchema.shape.status.describe(
    "update_member action: new status. Omit to keep the current status.",
  ),
});

export const manageTeamTool = {
  name: "manage_team",
  title: "Manage team",
  description:
    "Use this when administering team members. " +
    "action invite SENDS REAL INVITATION EMAILS to the given addresses (up to 20 per call). " +
    "action invite_link returns the workspace invitation link and its expiresAt, as the Invite modal shows it, creating one valid for 7 days when none is active; anyone who opens it can request to join, so hand it only to the people the user names. " +
    "action update_member changes an existing member's role or status: identify the member by userId from list_users.items[].id or email (both must match if supplied), plus roleId from get_workspace_context.roles[].id and/or status; omitted fields keep their current values; " +
    "a member who has no role assigned yet (e.g. a still pending invite) has no role to keep, so you must pass roleId together with the change or the call is rejected. " +
    "last-admin protection is enforced server-side, the workspace can never lose its last active admin. " +
    "invite requires create permission on users, as does invite_link; update_member requires update permission on users (Edit on Users & Roles), the same check as REST POST /v1/members/update.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: ManageTeamSchema,
  outputSchema: ManageTeamOutputSchema,
  execute: async (params: z.infer<typeof ManageTeamSchema>) => {
    if (params.action === "invite_link") {
      return runInteractor(getGetInvitationLinkInteractor().invoke({}), (data) =>
        toonResult({ link: data.link, expiresAt: data.expiresAt.toISOString(), message: "Invitation link ready" }),
      );
    }
    if (params.action === "invite") {
      const parsed = InviteUsersByEmailSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getInviteUsersByEmailInteractor().invoke(parsed.data), (data) =>
        toonResult({ sent: data.sent, message: "Invitation emails sent" }),
      );
    }
    const parsed = ManageTeamMemberSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    return runInteractor(getAdminUpdateUserDetailsInteractor().invoke(parsed.data), (data) =>
      toonResult({ email: data.email, roleId: data.roleId, status: data.status, message: "Member updated" }),
    );
  },
};
