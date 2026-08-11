import { z } from "zod";

import {
  encodeToToon,
  validationError,
  runInteractor,
  enumHint,
  formatForResponse,
  mcpPage,
  mcpPageSize,
  customErrorMessage,
  filtersDescription,
  sortDescription,
} from "./utils";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
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

const ResendWebhookDeliverySchema = z.object({
  id: z.uuid().describe("Delivery id from action list_deliveries"),
});

const ManageWebhooksSchema = z.object({
  action: z
    .enum(["create", "update", "delete", "get", "list", "list_deliveries", "resend_delivery"])
    .describe("Webhook operation to perform"),
  id: z
    .uuid()
    .optional()
    .describe(
      "Required for update, delete, get (webhook id) and for resend_delivery (delivery id from list_deliveries). " +
        "Optional for list_deliveries (webhook id): scopes deliveries to that webhook's CURRENT url; deliveries made while a different url was configured are not matched.",
    ),
  url: zx
    .secureUrl()
    .optional()
    .describe("Endpoint that will receive event POST requests (https recommended). Required for create."),
  description: z.string().optional().describe("create and update. Human-readable note about what this webhook does."),
  events: z
    .array(WebhookEventSchema)
    .min(1)
    .optional()
    .describe(
      `Required for create; on update REPLACES the subscribed events. Each value ${enumHint(WebhookEventSchema.options)}`,
    ),
  secret: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Shared secret used to sign outgoing requests. create: optional string. update: omit to keep the current secret, pass null to clear it, pass a string to set a new one.",
    ),
  enabled: z.boolean().optional().describe("create (default true) and update."),
  searchTerm: z
    .string()
    .optional()
    .describe("list matches url and description; list_deliveries matches url and event name."),
  filters: z
    .array(FilterSchema)
    .optional()
    .describe(
      "list and list_deliveries only. " +
        filtersDescription(
          `list: ${filterFieldsHint([FilterFieldKey.createdAt, FilterFieldKey.updatedAt])}; list_deliveries: ${filterFieldsHint([FilterFieldKey.event, FilterFieldKey.url, FilterFieldKey.createdAt])}`,
        ),
    ),
  sortDescriptor: SortDescriptorSchema.optional().describe(
    "list and list_deliveries only. " + sortDescription("list: name, createdAt, updatedAt; list_deliveries: createdAt"),
  ),
  page: mcpPage(),
  pageSize: z
    .preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.literal([5, 10, 25, 100]))
    .optional()
    .describe("Results per page: 5, 10, 25, or 100. Default 100 for list, 25 for list_deliveries."),
});

export const manageWebhooksTool = {
  name: "manage_webhooks",
  title: "Manage webhooks",
  description:
    "Use this when you need to manage webhook subscriptions or inspect their deliveries. " +
    "action create requires url and events. " +
    "action update requires id; events REPLACES the full subscription list; secret: omit to keep, null to clear, string to set. " +
    "action delete is IRREVERSIBLE. " +
    "action get returns one webhook (the signing secret itself is never returned). " +
    "action list supports searchTerm, filters, sort, paging. " +
    "action list_deliveries returns delivery attempts newest first; without `id` it spans the whole workspace, with `id` it is scoped to that webhook's CURRENT url (deliveries made while a different url was configured are not matched); narrow further with searchTerm or filters. " +
    "action resend_delivery re-sends a past delivery as a NEW delivery record; pass the delivery id from list_deliveries.",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  inputSchema: ManageWebhooksSchema,
  execute: async (params: z.infer<typeof ManageWebhooksSchema>) => {
    if (params.action === "list") {
      const parsed = ListWebhooksSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      return runInteractor(
        getGetWebhooksApiInteractor().invoke({
          searchTerm: parsed.data.searchTerm,
          filters: parsed.data.filters,
          sortDescriptor: parsed.data.sortDescriptor,
          pagination: { page: parsed.data.page, pageSize: parsed.data.pageSize },
        }),
        (data) =>
          encodeToToon(
            formatForResponse(
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
      );
    }
    if (params.action === "create") {
      const parsed = CreateWebhookSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      return runInteractor(getUpsertWebhookInteractor().invoke(parsed.data), (data) =>
        encodeToToon({ id: data.id, url: data.url, description: data.description, events: data.events }),
      );
    }
    if (params.action === "update") {
      const parsed = UpdateWebhookSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      return runInteractor(
        getUpsertWebhookInteractor().invoke({
          id: parsed.data.id,
          url: parsed.data.url,
          description: parsed.data.description,
          events: parsed.data.events,
          secret: parsed.data.secret,
          enabled: parsed.data.enabled,
        }),
        (data) =>
          encodeToToon({
            id: data.id,
            url: data.url,
            description: data.description,
            events: data.events,
            enabled: data.enabled,
          }),
      );
    }
    if (params.action === "get") {
      const parsed = GetWebhookSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      const result = await getGetWebhookByIdInteractor().invoke({ id: parsed.data.id });
      if (!result.ok) return validationError(result.error);
      const webhook = result.data;
      if (!webhook) return await customErrorMessage(CustomErrorCode.webhookNotFound);
      return encodeToToon(
        formatForResponse({
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
    }
    if (params.action === "delete") {
      const parsed = DeleteWebhookSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      return runInteractor(getDeleteWebhookInteractor().invoke(parsed.data), (data) => `Deleted webhook ${data}`);
    }
    if (params.action === "list_deliveries") {
      const parsed = ListWebhookDeliveriesSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      let filters = parsed.data.filters;
      if (params.id) {
        const webhookResult = await getGetWebhookByIdInteractor().invoke({ id: params.id });
        if (!webhookResult.ok) return validationError(webhookResult.error);
        const webhook = webhookResult.data;
        if (!webhook) return await customErrorMessage(CustomErrorCode.webhookNotFound);
        filters = [
          { field: FilterFieldKey.url, operator: FilterOperatorKey.equals, value: webhook.url },
          ...(filters ?? []),
        ];
      }
      return runInteractor(
        getGetWebhookDeliveriesApiInteractor().invoke({
          searchTerm: parsed.data.searchTerm,
          filters,
          sortDescriptor: parsed.data.sortDescriptor,
          pagination: { page: parsed.data.page, pageSize: parsed.data.pageSize },
        }),
        (data) =>
          encodeToToon({
            items: formatForResponse(data.items),
            total: data.pagination?.total ?? data.items.length,
            page: parsed.data.page,
          }),
      );
    }
    const parsed = ResendWebhookDeliverySchema.safeParse(params);
    if (!parsed.success) return validationError(parsed.error);
    return runInteractor(
      getResendWebhookDeliveryInteractor().invoke({ id: parsed.data.id }),
      (data) => `Re-sent webhook delivery ${parsed.data.id} as new delivery ${data}`,
    );
  },
};
