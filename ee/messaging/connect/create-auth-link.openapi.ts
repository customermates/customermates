import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";

import { CreateAuthLinkSchema } from "./create-auth-link.interactor";

const ConnectLinkRequestSchema = CreateAuthLinkSchema.extend({
  channel: CreateAuthLinkSchema.shape.channel.describe(
    "The channel to connect: google (Gmail), outlook, imap (any other email via IMAP and SMTP), whatsapp, linkedin (Classic), linkedin_sales_navigator, linkedin_recruiter, instagram or telegram.",
  ),
});

const ConnectLinkSchema = z.object({
  url: z.string().describe("Single-use link to open in a browser; it expires after 30 minutes."),
});

export const createConnectLinkOperation: ZodOpenApiOperationObject = {
  operationId: "createConnectLink",
  summary: "Create a link to connect a messaging channel",
  description:
    "Creates a secure link that connects a messaging channel to the inbox of the key's owner, as Connect on the Channels settings page and the MCP connect_messaging_account tool do. The connection cannot be completed over the API: open the url in a browser and finish there, by scanning the QR code for WhatsApp or signing in for email and LinkedIn; the new account then appears in GET /v1/messaging/connected-accounts. The link works once and expires after 30 minutes. Each member gets a number of connected accounts from the plan: Pro 1, Business 3, Enterprise unlimited, Starter none. Without a free slot or without a plan that includes messaging the request answers 400. Requires: Inbox messages Create and a plan that includes messaging.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: ConnectLinkRequestSchema,
        example: { channel: "google" },
      },
    },
  },
  responses: {
    "200": {
      description: "The connect link.",
      content: {
        "application/json": {
          schema: ConnectLinkSchema,
          example: { url: "https://account.example.com/connect/2f6c1b7e" },
        },
      },
    },
    ...StructuredApiResponses,
  },
};
