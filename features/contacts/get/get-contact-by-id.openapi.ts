import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { ContactKeySchema } from "../contact-key";
import { ContactDtoSchema } from "../contact.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const getContactByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getContactById",
  summary: "Get a contact by ID",
  description:
    "Retrieves a single contact by its UUID or by a channel it owns. The response carries `contact: null`, not an error, when no accessible contact matches the key, including a key that is neither a UUID nor a recognised channel.",
  tags: ["contacts"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: ContactKeySchema }) },
  responses: {
    "200": {
      description: "The contact, or `contact: null` when no accessible contact matches the key.",
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
