import type { ZodOpenApiOperationObject } from "zod-openapi";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";
import {
  InviteUsersByEmailResultSchema,
  InviteUsersByEmailSchema,
} from "@/features/company/invite-users-by-email.interactor";
import { AdminUpdateUserDetailsSchema } from "@/features/user/upsert/admin-update-user-details.interactor";
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
    ...StructuredApiResponses,
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
  "/v1/members/update": {
    post: {
      operationId: "updateMember",
      summary: "Change a member's role or status",
      description:
        "Saves another member's profile, role and status in one call, as the members settings page does. Read the member from POST /v1/users/search, send every field, and change roleId and/or status: status inactive deactivates the member and frees their seat, active reactivates them. The member is identified by email. You cannot update your own membership, a platform operator cannot be deactivated, and the workspace always keeps an active member with a system role. Requires: Users & Roles Edit.",
      tags: ["members"],
      security: [{ apiKeyAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: AdminUpdateUserDetailsSchema,
            examples: {
              default: {
                value: {
                  email: "new.colleague@example.com",
                  firstName: "Grace",
                  lastName: "Hopper",
                  country: "us",
                  avatarUrl: null,
                  roleId: "00000000-0000-4000-8000-000000000003",
                  status: "inactive",
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
