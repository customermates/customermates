import { z } from "zod";

import {
  encodeToToon,
  validationError,
  runInteractor,
  enumHint,
  formatDatesInResponse,
  mcpPage,
  mcpPageSize,
  customErrorMessage,
  filtersDescription,
  sortDescription,
} from "./utils";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { filterFieldsHint } from "@/core/types/filter-field-value-kind";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { WebhookEventSchema } from "@/features/webhook/webhook.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { zx } from "@/core/validation/validation.utils";
import {
  getGetWebhooksApiInteractor,
  getGetWebhookByIdInteractor,
  getUpsertWebhookInteractor,
  getDeleteWebhookInteractor,
  getGetWebhookDeliveriesApiInteractor,
  getResendWebhookDeliveryInteractor,
} from "@/core/di";

const ListWebhooksSchema = z.object({
  searchTerm: z.string().optional().describe("Free-text search against url and description"),
  filters: z
    .array(FilterSchema)
    .optional()
    .describe(filtersDescription(filterFieldsHint([FilterFieldKey.createdAt, FilterFieldKey.updatedAt]))),
  sortDescriptor: SortDescriptorSchema.optional().describe(sortDescription("name, createdAt, updatedAt")),
  page: mcpPage(),
  pageSize: mcpPageSize(100, "Results per page: 5, 10, 25, or 100 (default 100)"),
});

const CreateWebhookSchema = z.object({
  url: zx.secureUrl().describe("Endpoint that will receive event POST requests (https recommended)"),
  description: z.string().optional().describe("Human-readable note about what this webhook does"),
  events: z
    .array(WebhookEventSchema)
    .min(1)
    .describe(`Event types to subscribe to. Each value ${enumHint(WebhookEventSchema.options)}`),
  secret: z.string().optional().describe("Shared secret used to sign outgoing requests"),
  enabled: z.boolean().default(true),
});

const UpdateWebhookSchema = z.object({
  id: z.uuid(),
  url: zx.secureUrl().optional(),
  description: z.string().optional(),
  events: z
    .array(WebhookEventSchema)
    .min(1)
    .optional()
    .describe(`REPLACES the subscribed events. Each value ${enumHint(WebhookEventSchema.options)}`),
  secret: z
    .string()
    .nullable()
    .optional()
    .describe("Omit to keep the current secret. Pass null to clear it. Pass a string to set a new one."),
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
  page: mcpPage(),
  pageSize: mcpPageSize(25, "Results per page: 5, 10, 25, or 100 (default 25)"),
  filters: z
    .array(FilterSchema)
    .optional()
    .describe(filtersDescription(filterFieldsHint([FilterFieldKey.event, FilterFieldKey.createdAt]))),
  sortDescriptor: SortDescriptorSchema.optional().describe(sortDescription("createdAt")),
});

export const listWebhooksTool = {
  name: "list_webhooks",
  description:
    "List configured webhooks. " +
    "Optional: searchTerm (matches url and description), filters, sortDescriptor, page, pageSize. " +
    "Returns items with { id, url, description, events, enabled, createdAt, updatedAt }.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ListWebhooksSchema,
  execute: (params: z.infer<typeof ListWebhooksSchema>) =>
    runInteractor(
      getGetWebhooksApiInteractor().invoke({
        searchTerm: params.searchTerm,
        filters: params.filters,
        sortDescriptor: params.sortDescriptor,
        pagination: { page: params.page, pageSize: params.pageSize },
      }),
      (data) =>
        encodeToToon(
          formatDatesInResponse(
            data.items.map((webhook) => ({
              id: webhook.id,
              url: webhook.url,
              description: webhook.description,
              events: webhook.events,
              enabled: webhook.enabled,
              createdAt: webhook.createdAt,
              updatedAt: webhook.updatedAt,
            })),
          ),
        ),
    ),
};

export const createWebhookTool = {
  name: "create_webhook",
  description:
    "Create a webhook subscription. " +
    "Required: url (https recommended), events[]. " +
    "Optional: description, secret, enabled (default true). " +
    `Event values ${enumHint(WebhookEventSchema.options)}. ` +
    "Returns the new webhook id, url, events.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateWebhookSchema,
  execute: (params: z.infer<typeof CreateWebhookSchema>) =>
    runInteractor(getUpsertWebhookInteractor().invoke(params), (data) =>
      encodeToToon({ id: data.id, url: data.url, description: data.description, events: data.events }),
    ),
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
  execute: (params: z.infer<typeof UpdateWebhookSchema>) =>
    runInteractor(
      getUpsertWebhookInteractor().invoke({
        id: params.id,
        url: params.url,
        description: params.description,
        events: params.events,
        secret: params.secret,
        enabled: params.enabled,
      }),
      (data) =>
        encodeToToon({
          id: data.id,
          url: data.url,
          description: data.description,
          events: data.events,
          enabled: data.enabled,
        }),
    ),
};

export const getWebhookTool = {
  name: "get_webhook",
  description:
    "Fetch one webhook by id. " +
    "Required: id. " +
    "Returns { id, url, description, events, enabled, createdAt, updatedAt, hasSecret }. " +
    "The signing secret itself is never returned. Use list_webhooks to discover ids.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: GetWebhookSchema,
  execute: async ({ id }: z.infer<typeof GetWebhookSchema>) => {
    const result = await getGetWebhookByIdInteractor().invoke({ id });
    if (!result.ok) return validationError(result.error);
    const webhook = result.data;
    if (!webhook) return await customErrorMessage(CustomErrorCode.webhookNotFound);
    return encodeToToon(
      formatDatesInResponse({
        id: webhook.id,
        url: webhook.url,
        description: webhook.description,
        events: webhook.events,
        enabled: webhook.enabled,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
        hasSecret: webhook.secret != null && webhook.secret !== "",
      }),
    );
  },
};

export const listWebhookDeliveriesTool = {
  name: "list_webhook_deliveries",
  description:
    "List recent webhook delivery attempts (success + failure). " +
    "Optional: searchTerm (matches url and event name), page, pageSize (5, 10, 25, or 100), filters, sortDescriptor. " +
    "Sorted newest first. Each item has { id, url, event, statusCode, responseMessage, success, status, deliveredAt, createdAt }. " +
    "Use this to debug failing webhooks.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ListWebhookDeliveriesSchema,
  execute: ({ searchTerm, page, pageSize, filters, sortDescriptor }: z.infer<typeof ListWebhookDeliveriesSchema>) =>
    runInteractor(
      getGetWebhookDeliveriesApiInteractor().invoke({
        searchTerm,
        filters,
        sortDescriptor,
        pagination: { page, pageSize },
      }),
      (data) =>
        encodeToToon({
          items: formatDatesInResponse(data.items),
          total: data.pagination?.total ?? data.items.length,
          page,
        }),
    ),
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
  execute: ({ id }: z.infer<typeof ResendWebhookDeliverySchema>) =>
    runInteractor(
      getResendWebhookDeliveryInteractor().invoke({ id }),
      (data) => `Re-sent webhook delivery ${id} as new delivery ${data}`,
    ),
};

export const deleteWebhookTool = {
  name: "delete_webhook",
  description: "IRREVERSIBLE. Delete a webhook subscription by id. Required: id.",
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  inputSchema: DeleteWebhookSchema,
  execute: (params: z.infer<typeof DeleteWebhookSchema>) =>
    runInteractor(getDeleteWebhookInteractor().invoke(params), (data) => `Deleted webhook ${data}`),
};
