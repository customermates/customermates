import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ContactDtoSchema } from "../contact.schema";

import { UpdateContactSchema } from "./update-contact.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateContactOperation: ZodOpenApiOperationObject = {
  operationId: "updateContact",
  summary: "Update a contact",
  description: "Updates an existing contact. Only provided fields are updated. Set fields to null to clear them.",
  tags: ["contacts"],
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
        schema: UpdateContactSchema.omit({ id: true }),
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
