import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ServiceDtoSchema } from "../service.schema";

import { UpdateServiceSchema } from "./update-service.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateServiceOperation: ZodOpenApiOperationObject = {
  operationId: "updateService",
  summary: "Update a service",
  description: "Updates an existing service. Only provided fields are updated. Set fields to null to clear them.",
  tags: ["services"],
  security: [{ apiKeyAuth: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: {
        type: "string",
        format: "uuid",
      },
    },
  ],
  requestBody: {
    content: {
      "application/json": {
        schema: UpdateServiceSchema.omit({ id: true }),
      },
    },
  },
  responses: {
    "200": {
      description: "The service was updated successfully.",
      content: {
        "application/json": {
          schema: ServiceDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
