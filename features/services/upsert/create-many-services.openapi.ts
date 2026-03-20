import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ServiceDtoSchema } from "../service.schema";

import { CreateManyServicesSchema } from "./create-many-services.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createManyServicesOperation: ZodOpenApiOperationObject = {
  operationId: "createManyServices",
  summary: "Create many services",
  description:
    "Creates many services in a single request. Each service requires a name and an amount (must be greater than 0). All other fields are optional.",
  tags: ["services"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: CreateManyServicesSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The services were created successfully.",
      content: {
        "application/json": {
          schema: ServiceDtoSchema.array(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
