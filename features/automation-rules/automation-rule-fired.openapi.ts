import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { EventEnvelopeSchema } from "@/features/event/event-envelope";

import { AutomationRuleFiredPayloadSchema } from "./automation-rule-fired";

export const WebhookAutomationRuleFiredSchema = EventEnvelopeSchema.extend({
  event: z.literal("automation.rule.fired"),
  data: AutomationRuleFiredPayloadSchema.extend({ entityId: z.uuid() }),
});

export const webhookAutomationRuleFiredOperation: ZodOpenApiOperationObject = {
  operationId: "webhookAutomationRuleFired",
  summary: "Automation Rule Fired",
  description:
    "Sent to the webhook an automation rule names in its Call webhook effect, when the rule fires. The webhook must have selected this event. `actorId` is the owner of the rule; `data.entityId` and `data.ruleId` are the rule, `data.record` the record that started it when there is one.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookAutomationRuleFiredSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
