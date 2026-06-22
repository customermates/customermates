import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ContactDtoSchema } from "../contact.schema";

import { UpdateManyContactsSchema } from "./update-many-contacts.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateManyContactsOperation: ZodOpenApiOperationObject = {
  operationId: "updateManyContacts",
  summary: "Update many contacts",
  description:
    "Updates many contacts in a single request. Each contact is addressed by id (the contact UUID, an " +
    "email or phone, or 'provider:value' for a handle). All other fields are optional.",
  tags: ["contacts"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: UpdateManyContactsSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The contacts were updated successfully.",
      content: {
        "application/json": {
          schema: ContactDtoSchema.array(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
