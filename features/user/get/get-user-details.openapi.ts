import type { ZodOpenApiOperationObject } from "zod-openapi";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";
import { UserDetailsDtoSchema } from "@/features/user/get/get-user-details.interactor";

const OwnProfileResponses = Object.fromEntries(
  Object.entries(StructuredApiResponses).filter(([status]) => status !== "404"),
);

export const getUserDetailsOperation: ZodOpenApiOperationObject = {
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
    ...OwnProfileResponses,
  },
};
