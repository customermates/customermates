import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { SendEmailSchema } from "@/ee/messaging/outbound/send-email.interactor";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const sendEmailOperation: ZodOpenApiOperationObject = {
  operationId: "sendEmail",
  summary: "Send an email",
  description:
    "Sends a real email (or reply) from a connected email account. Provide either threadId (reply; takes precedence if both are given) or connectedAccountId (new email). cc and bcc are plain email strings, unlike to which uses the { identifier } object form.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: SendEmailSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The email was sent successfully.",
      content: {
        "application/json": {
          schema: z.null(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
