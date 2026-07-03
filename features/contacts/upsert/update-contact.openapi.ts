import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { ContactKeySchema } from "../contact-key";
import { ContactDtoSchema } from "../contact.schema";

import { BaseUpdateContactSchema } from "./update-contact-base.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateContactOperation: ZodOpenApiOperationObject = {
  operationId: "updateContact",
  summary: "Update a contact",
  description: "Updates an existing contact. Only provided fields are updated. Set fields to null to clear them.",
  tags: ["contacts"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: ContactKeySchema }) },
  requestBody: {
    content: {
      "application/json": {
        schema: BaseUpdateContactSchema.omit({ id: true }),
      },
    },
  },
  responses: {
    "200": {
      description: "The contact was updated successfully.",
      content: {
        "application/json": {
          schema: ContactDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
