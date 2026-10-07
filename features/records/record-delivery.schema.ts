import { z } from "zod";
import { EventEnvelopeSchema } from "@/features/event/event-envelope";
import { RecordEventPayloadSchema, RecordHistoryChangesSchema } from "./record-event.schema";

export const RecordDeliveryEnvelopeSchema = EventEnvelopeSchema.extend({
  event: z.enum(["record.created", "record.updated", "record.deleted"]),
  data: z
    .object({
      causeId: z.string().nullable(),
      cause: RecordEventPayloadSchema.shape.cause,
      record: RecordHistoryChangesSchema,
    })
    .strict(),
}).strict();

export type RecordDeliveryEnvelope = z.infer<typeof RecordDeliveryEnvelopeSchema>;
