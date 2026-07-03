import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { ServiceDtoSchema } from "../service.schema";

import { BaseUpdateServiceSchema } from "./update-service-base.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateServiceOperation: ZodOpenApiOperationObject = {
  operationId: "updateService",
  summary: "Update a service",
  description: "Updates an existing service. Only provided fields are updated. Set fields to null to clear them.",
  tags: ["services"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    content: {
      "application/json": {
        schema: BaseUpdateServiceSchema.omit({ id: true }),
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
