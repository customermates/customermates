import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CountryCode } from "@/generated/prisma";

import { CommonApiResponses } from "@/core/api/interactor-handler";

const UserProfileSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  country: z.enum(CountryCode),
  avatarUrl: z.string().nullable(),
});

export const getUserProfileOperation: ZodOpenApiOperationObject = {
  operationId: "getUserProfile",
  summary: "Get own user profile",
  description: "Retrieves the authenticated user's profile information.",
  tags: ["users"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The user profile was retrieved successfully.",
      content: {
        "application/json": {
          schema: UserProfileSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
