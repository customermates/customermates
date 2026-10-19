import type { ZodOpenApiOperationObject } from "zod-openapi";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";
import {
  InviteUsersByEmailResultSchema,
  InviteUsersByEmailSchema,
} from "@/features/company/invite-users-by-email.interactor";
import { InvitationLinkRequestSchema, InvitationLinkSchema } from "@/features/company/invitation-link";
import {
  AdminUpdateUserDetailsSchema,
  UpdateMemberSchema,
} from "@/features/user/upsert/admin-update-user-details.interactor";
import { UpdateUserDetailsSchema, UserProfileSchema } from "@/features/user/upsert/update-user-details.interactor";
import {
  RemovedWorkspaceMemberSchema,
  RemoveWorkspaceMemberSchema,
} from "@/features/workspace/remove-workspace-member.interactor";

export const updateUserProfileOperation: ZodOpenApiOperationObject = {
  operationId: "updateUserProfile",
  summary: "Update own user profile",
  description:
    "Partially updates the authenticated user's own profile, the same fields as the account settings page: firstName, lastName, avatarUrl (an http or https URL, or '' or null to clear), theme, displayLanguage and formattingLocale. Omitted fields keep their values. Returns the saved profile. Requires: an active workspace membership; no further permission.",
  tags: ["users"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: UpdateUserDetailsSchema,
        examples: { default: { value: { firstName: "Ada", lastName: "Lovelace", theme: "dark" } } },
      },
    },
  },
  responses: {
    "200": {
      description: "The saved profile.",
      content: { "application/json": { schema: UserProfileSchema } },
    },
    ...Object.fromEntries(Object.entries(StructuredApiResponses).filter(([status]) => status !== "404")),
  },
};

export const memberApiPaths = {
  "/v1/members/invite": {
    post: {
      operationId: "inviteMembers",
      summary: "Invite members by email",
      description:
        "Sends a workspace invitation email with the workspace's invitation link to each address, 1 to 20 per call; duplicate addresses receive one email. An invited person joins with no role until an administrator assigns one through POST /v1/members/update. Returns how many emails were sent. Requires: Users & Roles Create.",
      tags: ["members"],
      security: [{ apiKeyAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: InviteUsersByEmailSchema,
            examples: { default: { value: { emails: ["new.colleague@example.com"] } } },
          },
        },
      },
      responses: {
        "200": {
          description: "The invitations were sent.",
          content: { "application/json": { schema: InviteUsersByEmailResultSchema } },
        },
        ...StructuredApiResponses,
      },
    },
  },
  "/v1/members/invite-link": {
    post: {
      operationId: "getInvitationLink",
      summary: "Get the workspace invitation link",
      description:
        "Returns the workspace invitation link and when it expires, as the Share link tab of the Invite dialog shows it. The link is reused until it expires after 7 days; the first call after that creates a new one. Anyone who opens it can register and joins with status Waiting for approval and no role. Requires: Users & Roles Create.",
      tags: ["members"],
      security: [{ apiKeyAuth: [] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: InvitationLinkRequestSchema, examples: { default: { value: {} } } } },
      },
      responses: {
        "200": {
          description: "The current invitation link.",
          content: { "application/json": { schema: InvitationLinkSchema } },
        },
        ...StructuredApiResponses,
      },
    },
  },
  "/v1/members/update": {
    post: {
      operationId: "updateMember",
      summary: "Change a member's role or status",
      description:
        "Saves another member's profile, role and status in one call, as the members settings page and the MCP update_member action do. Name the member by userId or email (both must match when you send both) and send the fields to change; omitted fields keep their current values. status inactive deactivates the member and frees their seat, active reactivates them; a member waiting for approval needs a status, and a member without a role needs a roleId. An unknown member or roleId answers 404. You cannot update your own membership, the only active membership of the last Customermates platform operator cannot be deactivated, and the workspace always keeps an active member with a system role (roleSystemRequired). Requires: Users & Roles Edit.",
      tags: ["members"],
      security: [{ apiKeyAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: UpdateMemberSchema,
            examples: {
              default: {
                value: { userId: "00000000-0000-4000-8000-000000000002", status: "inactive" },
              },
              byEmail: {
                value: {
                  email: "new.colleague@example.com",
                  firstName: "Grace",
                  lastName: "Hopper",
                  roleId: "00000000-0000-4000-8000-000000000003",
                },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "The saved member.",
          content: { "application/json": { schema: AdminUpdateUserDetailsSchema } },
        },
        ...StructuredApiResponses,
      },
    },
  },
  "/v1/members/remove": {
    post: {
      operationId: "removeMember",
      summary: "Remove a member from the workspace",
      description:
        "Removes another member from this workspace, as Remove from workspace in the members settings and the MCP remove_member action do. Name the member by userId or email (both must match when you send both). Works for active, inactive and waiting-for-approval members; removing a member waiting for approval declines the request. The member's status becomes inactive and they are shown as left (a declined request is no longer listed), their API keys and MCP connections for this workspace stop working, the mailboxes and LinkedIn accounts they connected here are disconnected, their routines pause, and an active member's seat is freed. The member gets an email that they were removed; a declined request sends none. Records they own and their history stay. To come back they ask to join again with an invitation link, and an admin has to approve the request. Returns the removed member and the status they had. You cannot remove yourself (leave the workspace in the app instead), the only active membership of the last Customermates platform operator, a member who already left, or the last active member with the Admin role. Requires: Users & Roles Edit.",
      tags: ["members"],
      security: [{ apiKeyAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: RemoveWorkspaceMemberSchema,
            examples: {
              default: { value: { userId: "00000000-0000-4000-8000-000000000002" } },
              byEmail: { value: { email: "former.colleague@example.com" } },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "The member was removed.",
          content: { "application/json": { schema: RemovedWorkspaceMemberSchema } },
        },
        ...StructuredApiResponses,
      },
    },
  },
} satisfies Record<string, { post: ZodOpenApiOperationObject }>;
