import { describe, expect, expectTypeOf, it } from "vitest";

import type { z } from "zod";

import type { DomainEvent } from "@/features/event/domain-events";
import { type DomainEventMap } from "@/features/event/domain-events";
import { WebhookEventSchema } from "../webhook.schema";
import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import type { WebhookMessagingMessageReceivedSchema } from "@/features/messaging/webhooks/message-received.openapi";
import type { WebhookMessagingMessageUpdatedSchema } from "@/features/messaging/webhooks/message-updated.openapi";
import type { WebhookMessagingMessageDeletedSchema } from "@/features/messaging/webhooks/message-deleted.openapi";
import type { WebhookMessagingMessageReactionSchema } from "@/features/messaging/webhooks/message-reaction.openapi";
import type { WebhookMessagingEmailReceivedSchema } from "@/features/messaging/webhooks/email-received.openapi";
import type { WebhookMessagingEmailDeletedSchema } from "@/features/messaging/webhooks/email-deleted.openapi";
import type { WebhookMessagingChatUpdatedSchema } from "@/features/messaging/webhooks/chat-updated.openapi";
import type { WebhookMessagingChatDeletedSchema } from "@/features/messaging/webhooks/chat-deleted.openapi";
import type { WebhookMessagingCalendarChangedSchema } from "@/features/messaging/webhooks/calendar-changed.openapi";
import type { WebhookMessagingCalendarEventChangedSchema } from "@/features/messaging/webhooks/calendar-event-changed.openapi";
import type { WebhookMessagingRelationCreatedSchema } from "@/features/messaging/webhooks/relation-created.openapi";

type SchemaObject = {
  $ref?: string;
  const?: string;
  enum?: string[];
  properties?: Record<string, SchemaObject>;
};

function documentedWebhookSchemas() {
  const document = generateOpenApiSpec() as {
    webhooks?: Record<string, { post?: { requestBody?: { content?: Record<string, { schema?: SchemaObject }> } } }>;
    components?: { schemas?: Record<string, SchemaObject> };
  };

  const resolve = (schema: SchemaObject | undefined): SchemaObject | undefined => {
    if (!schema?.$ref) return schema;

    return document.components?.schemas?.[schema.$ref.replace("#/components/schemas/", "")];
  };

  return Object.entries(document.webhooks ?? {}).map(([key, entry]) => ({
    key,
    schema: resolve(entry.post?.requestBody?.content?.["application/json"]?.schema),
  }));
}

describe("webhook OpenAPI coverage", () => {
  it("documents exactly the subscribable events", () => {
    const documented = documentedWebhookSchemas().map(({ key, schema }) => {
      const event = schema?.properties?.event;
      return event?.const ?? event?.enum?.[0] ?? `<missing event literal for ${key}>`;
    });

    expect(documented.sort()).toEqual([...WebhookEventSchema.options].sort());
  });

  it("documents the delivery envelope for every event", () => {
    for (const { key, schema } of documentedWebhookSchemas()) {
      expect(Object.keys(schema?.properties ?? {}), key).toEqual(["event", "data", "timestamp"]);
      expect(Object.keys(schema?.properties?.data.properties ?? {}), key).toEqual([
        "userId",
        "companyId",
        "entityId",
        "payload",
      ]);
      expect(schema?.properties?.timestamp, key).toMatchObject({ type: "string", format: "date-time" });
    }
  });

  it("locks the messaging payload schemas to DomainEventMap", () => {
    expectTypeOf<z.infer<typeof WebhookMessagingMessageReceivedSchema>["data"]>().toEqualTypeOf<
      DomainEventMap[DomainEvent.MESSAGING_MESSAGE_RECEIVED]
    >();
    expectTypeOf<z.infer<typeof WebhookMessagingMessageUpdatedSchema>["data"]>().toEqualTypeOf<
      DomainEventMap[DomainEvent.MESSAGING_MESSAGE_UPDATED]
    >();
    expectTypeOf<z.infer<typeof WebhookMessagingMessageDeletedSchema>["data"]>().toEqualTypeOf<
      DomainEventMap[DomainEvent.MESSAGING_MESSAGE_DELETED]
    >();
    expectTypeOf<z.infer<typeof WebhookMessagingMessageReactionSchema>["data"]>().toEqualTypeOf<
      DomainEventMap[DomainEvent.MESSAGING_MESSAGE_REACTION]
    >();
    expectTypeOf<z.infer<typeof WebhookMessagingEmailReceivedSchema>["data"]>().toEqualTypeOf<
      DomainEventMap[DomainEvent.MESSAGING_EMAIL_RECEIVED]
    >();
    expectTypeOf<z.infer<typeof WebhookMessagingEmailDeletedSchema>["data"]>().toEqualTypeOf<
      DomainEventMap[DomainEvent.MESSAGING_EMAIL_DELETED]
    >();
    expectTypeOf<z.infer<typeof WebhookMessagingChatUpdatedSchema>["data"]>().toEqualTypeOf<
      DomainEventMap[DomainEvent.MESSAGING_CHAT_UPDATED]
    >();
    expectTypeOf<z.infer<typeof WebhookMessagingChatDeletedSchema>["data"]>().toEqualTypeOf<
      DomainEventMap[DomainEvent.MESSAGING_CHAT_DELETED]
    >();
    expectTypeOf<z.infer<typeof WebhookMessagingCalendarChangedSchema>["data"]>().toEqualTypeOf<
      DomainEventMap[DomainEvent.MESSAGING_CALENDAR_CHANGED]
    >();
    expectTypeOf<z.infer<typeof WebhookMessagingCalendarEventChangedSchema>["data"]>().toEqualTypeOf<
      DomainEventMap[DomainEvent.MESSAGING_CALENDAR_EVENT_CHANGED]
    >();
    expectTypeOf<z.infer<typeof WebhookMessagingRelationCreatedSchema>["data"]>().toEqualTypeOf<
      DomainEventMap[DomainEvent.MESSAGING_RELATION_CREATED]
    >();
  });
});
