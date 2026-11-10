import { z } from "zod";
import type { EventLog } from "@/generated/prisma";

export const EventEnvelopeSchema = z
  .object({
    event: z.string(),
    id: z.uuid(),
    timestamp: z.iso.datetime(),
    companyId: z.uuid(),
    actorId: z.uuid().nullable(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

const ActorIdSchema = z.uuid();

export function envelopeActorId(actorId: string | null): string | null {
  return actorId !== null && ActorIdSchema.safeParse(actorId).success ? actorId : null;
}

export function subjectKindOf(kind: string): string {
  return kind.slice(0, kind.indexOf("."));
}

export function eventEnvelope(event: EventLog): EventEnvelope {
  const payload =
    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload : {};
  return {
    event: event.kind,
    id: event.id,
    timestamp: event.createdAt.toISOString(),
    companyId: event.companyId,
    actorId: envelopeActorId(event.actorId),
    data: { entityId: event.subjectId, ...payload },
  };
}
