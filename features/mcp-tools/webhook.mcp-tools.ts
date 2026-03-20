import { z } from "zod";

import { encodeToToon, formatDatesInResponse } from "./utils";

import { di } from "@/core/dependency-injection/container";
import { WebhookEventSchema } from "@/features/webhook/webhook.schema";
import { GetWebhooksInteractor } from "@/features/webhook/get-webhooks.interactor";
import { UpsertWebhookInteractor } from "@/features/webhook/upsert-webhook.interactor";
import { DeleteWebhookInteractor } from "@/features/webhook/delete-webhook.interactor";

const ListWebhooksSchema = z.object({
  searchTerm: z.string().optional(),
});

const CreateWebhookSchema = z.object({
  url: z.url(),
  description: z.string().optional(),
  events: z.array(WebhookEventSchema).min(1),
  secret: z.string().optional(),
  enabled: z.boolean().default(true),
});

const UpdateWebhookSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  description: z.string().optional(),
  events: z.array(WebhookEventSchema).min(1),
  secret: z.string().optional(),
  enabled: z.boolean().default(true),
});

const DeleteWebhookSchema = z.object({
  id: z.uuid(),
});

export const listWebhooksTool = {
  name: "list_webhooks",
  description: "List all configured webhooks. Returns id, url, events, enabled status, and timestamps.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ListWebhooksSchema,
  execute: async (params: z.infer<typeof ListWebhooksSchema>) => {
    const result = await di.get(GetWebhooksInteractor).invoke({
      searchTerm: params.searchTerm,
      pagination: { page: 1, pageSize: 1000 },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon(formatDatesInResponse(result.data.items));
  },
};

export const createWebhookTool = {
  name: "create_webhook",
  description:
    "Create a webhook. Provide an optional description to document what this webhook does. Available events: contact.created, contact.updated, contact.deleted, organization.created, organization.updated, organization.deleted, deal.created, deal.updated, deal.deleted, service.created, service.updated, service.deleted, task.created, task.updated, task.deleted.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateWebhookSchema,
  execute: async (params: z.infer<typeof CreateWebhookSchema>) => {
    const result = await di.get(UpsertWebhookInteractor).invoke(params);
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
  description: "Update an existing webhook. Requires all fields (url, events, enabled).",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateWebhookSchema,
  execute: async (params: z.infer<typeof UpdateWebhookSchema>) => {
    const result = await di.get(UpsertWebhookInteractor).invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      id: result.data.id,
      url: result.data.url,
      description: result.data.description,
      events: result.data.events,
    });
  },
};

export const deleteWebhookTool = {
  name: "delete_webhook",
  description: "Delete a webhook by ID. Irreversible.",
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  inputSchema: DeleteWebhookSchema,
  execute: async (params: z.infer<typeof DeleteWebhookSchema>) => {
    const result = await di.get(DeleteWebhookInteractor).invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Deleted webhook ${result.data}`;
  },
};
