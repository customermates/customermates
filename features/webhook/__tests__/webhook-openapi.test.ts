import { describe, expect, expectTypeOf, it } from "vitest";

import type { z } from "zod";

import { DomainEvent, type DomainEventMap } from "@/features/event/domain-events";
import { WebhookEventSchema } from "../webhook.schema";
import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import type { WebhookMessagingMessageReceivedSchema } from "@/ee/messaging/webhooks/message/message-received.openapi";
import type { WebhookMessagingMessageUpdatedSchema } from "@/ee/messaging/webhooks/message/message-updated.openapi";
import type { WebhookMessagingMessageDeletedSchema } from "@/ee/messaging/webhooks/message/message-deleted.openapi";
import type { WebhookMessagingMessageReactionSchema } from "@/ee/messaging/webhooks/message/message-reaction.openapi";
import type { WebhookMessagingEmailReceivedSchema } from "@/ee/messaging/webhooks/email/email-received.openapi";
import type { WebhookMessagingEmailDeletedSchema } from "@/ee/messaging/webhooks/email/email-deleted.openapi";
import type { WebhookMessagingChatUpdatedSchema } from "@/ee/messaging/webhooks/chat/chat-updated.openapi";
import type { WebhookMessagingChatDeletedSchema } from "@/ee/messaging/webhooks/chat/chat-deleted.openapi";
import type { WebhookMessagingCalendarChangedSchema } from "@/ee/messaging/webhooks/calendar/calendar-changed.openapi";
import type { WebhookMessagingCalendarEventChangedSchema } from "@/ee/messaging/webhooks/calendar/calendar-event-changed.openapi";
import type { WebhookMessagingRelationCreatedSchema } from "@/ee/messaging/webhooks/relation/relation-created.openapi";

type SchemaObject = {
  $ref?: string;
  const?: string;
  enum?: string[];
  properties?: Record<string, SchemaObject>;
};

function documentedWebhookSchemas() {
  const document = generateOpenApiSpec() as {
    webhooks?: Record<
      string,
      {
        post?: {
          requestBody?: { content?: Record<string, { schema?: SchemaObject }> };
        };
      }
    >;
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
  it.each([
    DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
    DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
    DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
  ])("does not expose the internal %s audit event as a customer webhook", (event) => {
    expect(WebhookEventSchema.safeParse(event).success).toBe(false);
  });

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
      expect(schema?.properties?.timestamp, key).toMatchObject({
        type: "string",
        format: "date-time",
      });
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
