import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ServiceDtoSchema } from "../service.schema";

import { CreateServiceSchema } from "./create-service.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createServiceOperation: ZodOpenApiOperationObject = {
  operationId: "createService",
  summary: "Create a service",
  description: "Creates a new service. Name and amount are required. All other fields are optional.",
  tags: ["services"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: CreateServiceSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The service was created successfully.",
      content: {
        "application/json": {
          schema: ServiceDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
