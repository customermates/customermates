import { describe, expect, it } from "vitest";

import { EventEnvelopeSchema, envelopeActorId, eventEnvelope } from "../event-envelope";

const base = {
  companyId: "11111111-1111-4111-8111-111111111111",
  id: "22222222-2222-4222-8222-222222222222",
  kind: "record.updated",
  subjectId: "33333333-3333-4333-8333-333333333333",
  subjectKind: "record",
  subjectTypeId: null,
  causeId: null,
  payload: {},
  createdAt: new Date("2026-11-09T19:25:38.000Z"),
  deliveredAt: null,
  attempts: 0,
  nextAttemptAt: new Date("2026-11-09T19:25:38.000Z"),
  lastFailureCode: null,
};

describe("event envelope actor", () => {
  it("sends a system job's actor as null so the envelope stays valid", () => {
    for (const actorId of ["system:messaging", "system:trash"]) {
      const envelope = eventEnvelope({ ...base, actorId });
      expect(envelope.actorId).toBeNull();
      expect(EventEnvelopeSchema.safeParse(envelope).success).toBe(true);
    }
  });

  it("keeps a member's actor id and null as they are", () => {
    const member = "44444444-4444-4444-8444-444444444444";
    expect(envelopeActorId(member)).toBe(member);
    expect(envelopeActorId(null)).toBeNull();
  });
});
