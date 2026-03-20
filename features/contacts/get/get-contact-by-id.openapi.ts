import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { ContactDtoSchema } from "../contact.schema";

import { GetContactByIdSchema } from "./get-contact-by-id.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const getContactByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getContactById",
  summary: "Get a contact by ID",
  description: "Retrieves a single contact by its unique identifier.",
  tags: ["contacts"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: GetContactByIdSchema,
  },
  responses: {
    "200": {
      description: "The contact was retrieved successfully.",
      content: {
        "application/json": {
          schema: z.object({
            contact: ContactDtoSchema.nullable(),
            customColumns: z.array(CustomColumnDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
