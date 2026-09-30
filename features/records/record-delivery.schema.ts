import { z } from "zod";
import { RecordEventPayloadSchema, RecordHistoryChangesSchema } from "./record-event.schema";

export const RecordDeliveryEnvelopeSchema = z
  .object({
    version: z.literal(2),
    id: z.uuid(),
    companyId: z.uuid(),
    event: z.enum(["record.created", "record.updated", "record.deleted"]),
    timestamp: z.iso.datetime(),
    actorId: z.uuid(),
    causeId: z.string(),
    cause: RecordEventPayloadSchema.shape.cause,
    record: RecordHistoryChangesSchema,
  })
  .strict();

export type RecordDeliveryEnvelope = z.infer<typeof RecordDeliveryEnvelopeSchema>;
