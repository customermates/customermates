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

export const updateUserProfileOperation: ZodOpenApiOperationObject = {
  operationId: "updateUserProfile",
  summary: "Update own user profile",
  description:
    "Partially updates the authenticated user's own profile, the same fields as the account settings page: firstName, lastName, country, avatarUrl (an http or https URL, or '' or null to clear), theme, displayLanguage and formattingLocale. Omitted fields keep their values. Returns the saved profile. Requires: an active workspace membership; no further permission.",
  tags: ["users"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: UpdateUserDetailsSchema,
        examples: { default: { value: { firstName: "Ada", lastName: "Lovelace", country: "gb", theme: "dark" } } },
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
        "Sends a workspace invitation email with the workspace's invitation link to each address, 1 to 20 per call; duplicate addresses receive one email. An invited person joins with no role until an administrator assigns one through POST /v1/members/update. Returns how many emails were sent and how many the email service did not accept (failed); share the link from POST /v1/members/invite-link with those people instead. Requires: Users & Roles Create.",
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
          description: "The invitations were handed to the email service; failed counts the ones it did not accept.",
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
        "Saves another member's profile, role and status in one call, as the members settings page and the MCP update_member action do. Name the member by userId or email (both must match when you send both) and send the fields to change; omitted fields keep their current values. status inactive deactivates the member and frees their seat, active reactivates them; a member waiting for approval needs a status, and a member without a role needs a roleId. An unknown member or roleId answers 404. You cannot update your own membership, a platform operator cannot be deactivated, and the workspace always keeps an active member with a system role (roleSystemRequired). Requires: Users & Roles Edit.",
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
} satisfies Record<string, { post: ZodOpenApiOperationObject }>;
