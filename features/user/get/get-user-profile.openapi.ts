import type { ZodOpenApiOperationObject } from "zod-openapi";

import { CommonApiResponses } from "@/core/api/interactor-handler";
import { UserDetailsDtoSchema } from "@/features/user/get/get-user-details.interactor";

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
          schema: UserDetailsDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
