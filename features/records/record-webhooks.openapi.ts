import { z } from "zod";
import type { ZodOpenApiOperationObject } from "zod-openapi";
import { RecordDeliveryEnvelopeSchema } from "./record-delivery.schema";
import { RECORD_EVENT_KINDS, type RecordEventKind } from "./record-event.schema";

const RECORD_EVENT_DOCS: Record<RecordEventKind, { summary: string; description: string }> = {
  "record.created": {
    summary: "Record Created",
    description:
      "Sent when a record that matches the webhook's record source is created, with its values after the change.",
  },
  "record.updated": {
    summary: "Record Updated",
    description:
      "Sent when a field, assignment, identity or link of a matching record changes, with the values before and after the change.",
  },
  "record.deleted": {
    summary: "Record Moved to Trash",
    description:
      "Sent when a matching record moves to Trash, with its values before the delete; record-query filters match the record just before the move.",
  },
  "record.restored": {
    summary: "Record Restored",
    description: "Sent when a matching record comes back from Trash, with its restored values.",
  },
  "record.deletedPermanently": {
    summary: "Record Deleted Permanently",
    description:
      "Sent when a record is deleted permanently, by hand or 30 days after it moved to Trash; it carries only the record reference because the values are erased.",
  },
};

const RECORD_EVENT_PAYLOAD_DETAILS =
  "The payload uses stable type and record references, field IDs and the accepted schema revision. Values are redacted using the subscription owner's current access before delivery. Retries retain the event ID; receivers must deduplicate it.";

export const recordWebhookOperations = Object.fromEntries(
  RECORD_EVENT_KINDS.map((event) => [
    event,
    {
      post: {
        operationId: event.replace(".", "_"),
        summary: RECORD_EVENT_DOCS[event].summary,
        description: `${RECORD_EVENT_DOCS[event].description}\n\n${RECORD_EVENT_PAYLOAD_DETAILS}`,
        tags: ["webhooks"],
        requestBody: {
          content: {
            "application/json": {
              schema: RecordDeliveryEnvelopeSchema.extend({
                event: z.literal(event),
              }),
            },
          },
        },
        responses: { "200": { description: "Webhook received successfully" } },
      } satisfies ZodOpenApiOperationObject,
    },
  ]),
);
