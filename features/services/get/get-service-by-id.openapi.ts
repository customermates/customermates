import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { ServiceDtoSchema } from "../service.schema";

import { GetServiceByIdSchema } from "./get-service-by-id.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const getServiceByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getServiceById",
  summary: "Get a service by ID",
  description:
    "Retrieves a single service by its unique identifier. The response carries `service: null`, not an error, when no service with this id is accessible.",
  tags: ["services"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: GetServiceByIdSchema,
  },
  responses: {
    "200": {
      description: "The service, or `service: null` when no service with this id is accessible.",
      content: {
        "application/json": {
          schema: z.object({
            service: ServiceDtoSchema.nullable(),
            customColumns: z.array(CustomColumnDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
