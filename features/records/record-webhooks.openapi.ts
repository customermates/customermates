import { z } from "zod";
import type { ZodOpenApiOperationObject } from "zod-openapi";
import { RecordDeliveryEnvelopeSchema } from "./record-delivery.schema";

export const recordWebhookOperations = Object.fromEntries(
  (["record.created", "record.updated", "record.deleted"] as const).map((event) => [
    event,
    {
      post: {
        operationId: event.replace(".", "_"),
        summary: event,
        description:
          "A version-two record event. The payload uses stable type and record references, field IDs and the accepted schema revision. Values are redacted using the subscription owner's current access before delivery. Retries retain the event ID; receivers must deduplicate it. Deleted events do not apply record-query filters.",
        tags: ["webhooks"],
        requestBody: {
          content: {
            "application/json": {
              schema: z.object({
                event: z.literal(event),
                data: z.object({
                  userId: z.uuid(),
                  companyId: z.uuid(),
                  entityId: z.uuid(),
                  payload: RecordDeliveryEnvelopeSchema.extend({ event: z.literal(event) }),
                }),
                timestamp: z.iso.datetime(),
              }),
            },
          },
        },
        responses: { "200": { description: "Webhook received successfully" } },
      } satisfies ZodOpenApiOperationObject,
    },
  ]),
);
