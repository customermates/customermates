import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ContactDtoSchema } from "../contact.schema";

import { CreateContactSchema } from "./create-contact.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createContactOperation: ZodOpenApiOperationObject = {
  operationId: "createContact",
  summary: "Create a contact",
  description: "Creates a new contact. First name and last name are required. All other fields are optional.",
  tags: ["contacts"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: CreateContactSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The contact was created successfully.",
      content: {
        "application/json": {
          schema: ContactDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
