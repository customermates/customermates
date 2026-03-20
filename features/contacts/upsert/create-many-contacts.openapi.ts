import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ContactDtoSchema } from "../contact.schema";

import { CreateManyContactsSchema } from "./create-many-contacts.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createManyContactsOperation: ZodOpenApiOperationObject = {
  operationId: "createManyContacts",
  summary: "Create many contacts",
  description:
    "Creates many contacts in a single request. Each contact requires first name and last name. All other fields are optional.",
  tags: ["contacts"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: CreateManyContactsSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The contacts were created successfully.",
      content: {
        "application/json": {
          schema: ContactDtoSchema.array(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
