import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { SendEmailSchema } from "@/ee/messaging/outbound/send-email.interactor";
import { MessagingMessageDtoSchema } from "@/ee/messaging/inbox/inbox.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const sendEmailOperation: ZodOpenApiOperationObject = {
  operationId: "sendEmail",
  summary: "Send an email",
  description:
    "Sends a real email (or reply) from a connected email account. Provide either threadId (reply; takes precedence if both are given) or connectedAccountId (new email). cc and bcc are plain email strings, unlike `to` which uses the `{ identifier }` object form.",
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
      description:
        "The email was sent successfully. Returns the persisted message (including its thread id) when available, or null when the sent copy could not be resolved yet.",
      content: {
        "application/json": {
          schema: z.union([MessagingMessageDtoSchema, z.null()]),
        },
      },
    },
    ...CommonApiResponses,
  },
};
