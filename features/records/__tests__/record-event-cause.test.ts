import { describe, expect, it } from "vitest";

import { recordCauseBy, splitRecordCause } from "../record-event-cause";
import { RecordEventPayloadSchema, RecordOperationCauseSchema } from "../record-event.schema";

const VIA = { kind: "oauthApplication", name: "Claude Desktop" } as const;

describe("record event cause attribution", () => {
  it("adds the credential of the acting user to a cause", () => {
    expect(recordCauseBy({ via: VIA }, { kind: "mutation", routineDepth: 1 })).toEqual({
      kind: "mutation",
      routineDepth: 1,
      via: VIA,
    });
  });

  it("leaves the cause alone for a person working in the browser", () => {
    const cause = { kind: "mutation" } as const;

    expect(recordCauseBy({}, cause)).toBe(cause);
    expect(recordCauseBy({ via: null }, cause)).toBe(cause);
  });

  it("separates the attribution from the cause an event stores in its payload", () => {
    expect(splitRecordCause({ kind: "configuration", operationId: crypto.randomUUID(), via: VIA })).toEqual({
      cause: { kind: "configuration", operationId: expect.any(String) },
      via: VIA,
    });
    expect(splitRecordCause({ kind: "system" })).toEqual({ cause: { kind: "system" }, via: null });
  });

  it("keeps the attribution out of event payloads while an operation can carry it between its steps", () => {
    expect(RecordOperationCauseSchema.parse({ kind: "mutation", via: VIA }).via).toEqual(VIA);
    expect(RecordEventPayloadSchema.shape.cause.safeParse({ kind: "mutation", via: VIA }).success).toBe(false);
  });
});
