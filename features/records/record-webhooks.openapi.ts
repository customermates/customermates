import { z } from "zod";
import type { ZodOpenApiOperationObject } from "zod-openapi";
import { RecordDeliveryEnvelopeSchema } from "./record-delivery.schema";
import { RECORD_EVENT_KINDS } from "./record-event.schema";

export const recordWebhookOperations = Object.fromEntries(
  RECORD_EVENT_KINDS.map((event) => [
    event,
    {
      post: {
        operationId: event.replace(".", "_"),
        summary: event,
        description:
          "A record event. The payload uses stable type and record references, field IDs and the accepted schema revision. Values are redacted using the subscription owner's current access before delivery. Retries retain the event ID; receivers must deduplicate it. record.deleted means the record moved to Trash and record.restored that it came back; deleted events do not apply record-query filters. record.deletedPermanently carries only the reference because the values are erased.",
        tags: ["webhooks"],
        requestBody: {
          content: {
            "application/json": {
              schema: RecordDeliveryEnvelopeSchema.extend({ event: z.literal(event) }),
            },
          },
        },
        responses: { "200": { description: "Webhook received successfully" } },
      } satisfies ZodOpenApiOperationObject,
    },
  ]),
);
