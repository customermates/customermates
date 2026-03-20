import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ServiceDtoSchema } from "../service.schema";

import { UpdateManyServicesSchema } from "./update-many-services.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateManyServicesOperation: ZodOpenApiOperationObject = {
  operationId: "updateManyServices",
  summary: "Update many services",
  description: "Updates many services in a single request. Each service requires an ID. All other fields are optional.",
  tags: ["services"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: UpdateManyServicesSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The services were updated successfully.",
      content: {
        "application/json": {
          schema: ServiceDtoSchema.array(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
