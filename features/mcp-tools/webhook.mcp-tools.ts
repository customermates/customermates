import { z } from "zod";

import { encodeToToon, enumHint, formatDatesInResponse } from "./utils";

import { WebhookEventSchema } from "@/features/webhook/webhook.schema";
import {
  getGetWebhooksInteractor,
  getUpsertWebhookInteractor,
  getDeleteWebhookInteractor,
  getGetWebhookDeliveriesInteractor,
  getResendWebhookDeliveryInteractor,
} from "@/core/app-di";

const webhookEventValues = [
  "contact.created",
  "contact.updated",
  "contact.deleted",
  "organization.created",
  "organization.updated",
  "organization.deleted",
  "deal.created",
  "deal.updated",
  "deal.deleted",
  "service.created",
  "service.updated",
  "service.deleted",
  "task.created",
  "task.updated",
  "task.deleted",
] as const;

const ListWebhooksSchema = z.object({
  searchTerm: z.string().optional().describe("Free-text search against url and description"),
});

const CreateWebhookSchema = z.object({
  url: z.url().describe("HTTPS endpoint that will receive event POST requests"),
  description: z.string().optional().describe("Human-readable note about what this webhook does"),
  events: z
    .array(WebhookEventSchema)
    .min(1)
    .describe(`Event types to subscribe to. Each value ${enumHint(webhookEventValues)}`),
  secret: z.string().optional().describe("Shared secret used to sign outgoing requests"),
  enabled: z.boolean().default(true),
});

const UpdateWebhookSchema = z.object({
  id: z.uuid(),
  url: z.url().optional(),
  description: z.string().optional(),
  events: z
    .array(WebhookEventSchema)
    .min(1)
    .optional()
    .describe(`REPLACES the subscribed events. Each value ${enumHint(webhookEventValues)}`),
  secret: z.string().optional(),
  enabled: z.boolean().optional(),
});

const DeleteWebhookSchema = z.object({
  id: z.uuid(),
});

const GetWebhookSchema = z.object({
  id: z.uuid(),
});

const ListWebhookDeliveriesSchema = z.object({
  searchTerm: z.string().optional().describe("Free-text search against url and event name"),
  page: z.number().int().min(1).default(1),
  pageSize: z
    .union([z.literal(25), z.literal(100)])
    .default(25)
    .describe("Results per page (25 or 100)"),
});

async function findWebhookById(id: string) {
  const listResult = await getGetWebhooksInteractor().invoke({
    pagination: { page: 1, pageSize: 100 },
  });
  if (!listResult.ok) return null;
  return listResult.data.items.find((item) => item.id === id) ?? null;
}

export const listWebhooksTool = {
  name: "list_webhooks",
  description:
    "List configured webhooks. " +
    "Optional: searchTerm (matches url and description). " +
    "Returns items with { id, url, description, events, enabled, createdAt, updatedAt }.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ListWebhooksSchema,
  execute: async (params: z.infer<typeof ListWebhooksSchema>) => {
    const result = await getGetWebhooksInteractor().invoke({
      searchTerm: params.searchTerm,
      pagination: { page: 1, pageSize: 100 },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon(formatDatesInResponse(result.data.items));
  },
};

export const createWebhookTool = {
  name: "create_webhook",
  description:
    "Create a webhook subscription. " +
    "Required: url (must be https), events[]. " +
    "Optional: description, secret, enabled (default true). " +
    `Event values ${enumHint(webhookEventValues)}. ` +
    "Returns the new webhook id, url, events.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateWebhookSchema,
  execute: async (params: z.infer<typeof CreateWebhookSchema>) => {
    const result = await getUpsertWebhookInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      id: result.data.id,
      url: result.data.url,
      description: result.data.description,
      events: result.data.events,
    });
  },
};

export const updateWebhookTool = {
  name: "update_webhook",
  description:
    "Partial update for one webhook. " +
    "Required: id. All other fields optional; only provided fields change. " +
    "WARNING: events[] REPLACES the full event subscription list. " +
    "Idempotent: same payload produces the same state.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateWebhookSchema,
  execute: async (params: z.infer<typeof UpdateWebhookSchema>) => {
    const existing = await findWebhookById(params.id);
    if (!existing) return `Validation error: Webhook ${params.id} not found`;

    const merged = {
      id: params.id,
      url: params.url ?? existing.url,
      description: params.description ?? existing.description ?? undefined,
      events: params.events ?? existing.events,
      secret: params.secret ?? existing.secret ?? undefined,
      enabled: params.enabled ?? existing.enabled,
    };

    const result = await getUpsertWebhookInteractor().invoke(merged);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      id: result.data.id,
      url: result.data.url,
      description: result.data.description,
      events: result.data.events,
      enabled: result.data.enabled,
    });
  },
};

export const getWebhookTool = {
  name: "get_webhook",
  description:
    "Fetch one webhook by id. " +
    "Required: id. " +
    "Returns { id, url, description, events, secret, enabled, createdAt, updatedAt }. " +
    "Use list_webhooks to discover ids.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: GetWebhookSchema,
  execute: async ({ id }: z.infer<typeof GetWebhookSchema>) => {
    const existing = await findWebhookById(id);
    if (!existing) return `Validation error: Webhook ${id} not found`;
    return encodeToToon(formatDatesInResponse(existing));
  },
};

export const listWebhookDeliveriesTool = {
  name: "list_webhook_deliveries",
  description:
    "List recent webhook delivery attempts (success + failure). " +
    "Optional: searchTerm (matches url and event name), page, pageSize (25 or 100). " +
    "Sorted newest first. Each item has { id, url, event, statusCode, responseMessage, success, status, deliveredAt, createdAt }. " +
    "Use this to debug failing webhooks.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ListWebhookDeliveriesSchema,
  execute: async ({ searchTerm, page, pageSize }: z.infer<typeof ListWebhookDeliveriesSchema>) => {
    const result = await getGetWebhookDeliveriesInteractor().invoke({
      searchTerm,
      pagination: { page, pageSize },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      items: formatDatesInResponse(result.data.items),
      total: result.data.pagination?.total ?? result.data.items.length,
      page,
    });
  },
};

const ResendWebhookDeliverySchema = z.object({
  id: z.uuid().describe("Delivery id from list_webhook_deliveries"),
});

export const resendWebhookDeliveryTool = {
  name: "resend_webhook_delivery",
  description:
    "Re-send a past webhook delivery to its original URL with the original payload. " +
    "Required: id (from list_webhook_deliveries). " +
    "Use this to retry a failed delivery or to test whether a webhook URL is reachable. " +
    "Creates a NEW delivery record — does not modify the original.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: ResendWebhookDeliverySchema,
  execute: async ({ id }: z.infer<typeof ResendWebhookDeliverySchema>) => {
    try {
      await getResendWebhookDeliveryInteractor().invoke({ id });
      return `Re-sent webhook delivery ${id}`;
    } catch (error) {
      return `Validation error: ${error instanceof Error ? error.message : "Failed to resend delivery"}`;
    }
  },
};

export const deleteWebhookTool = {
  name: "delete_webhook",
  description: "IRREVERSIBLE. Delete a webhook subscription by id. Required: id.",
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  inputSchema: DeleteWebhookSchema,
  execute: async (params: z.infer<typeof DeleteWebhookSchema>) => {
    const result = await getDeleteWebhookInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Deleted webhook ${result.data}`;
  },
};
