import { describe, expect, it } from "vitest";

import { runInCausation } from "@/core/decorators/causation-context";

import { isUntrustedAgentRecordWrite, recordCauseBy, splitRecordCause } from "../record-event-cause";
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

  it("marks a cause with the routine or the rules that are running, and with nothing outside of them", async () => {
    const rule = crypto.randomUUID();
    const cause = { kind: "mutation" } as const;

    expect(await runInCausation({ routineDepth: 1 }, () => recordCauseBy({}, cause))).toEqual({
      kind: "mutation",
      routineDepth: 1,
    });
    expect(await runInCausation({ ruleChain: [rule] }, () => recordCauseBy({ via: VIA }, cause))).toEqual({
      kind: "mutation",
      ruleChain: [rule],
      via: VIA,
    });
    expect(await runInCausation({ ruleChain: [] }, () => recordCauseBy({}, cause))).toBe(cause);
    expect(await runInCausation(null, () => recordCauseBy({}, cause))).toBe(cause);
    expect(recordCauseBy({}, cause)).toBe(cause);
  });

  it("marks a cause that an agent run with an untrusted instruction writes, and stores the marker in the payload", async () => {
    const cause = { kind: "mutation" } as const;
    const marked = await runInCausation({ routineDepth: 1, untrustedOrigin: true }, () => recordCauseBy({}, cause));

    expect(marked).toEqual({ kind: "mutation", routineDepth: 1, untrustedOrigin: true });
    expect(splitRecordCause(marked).cause).toEqual(marked);
    expect(RecordEventPayloadSchema.shape.cause.safeParse(marked).success).toBe(true);
    expect(isUntrustedAgentRecordWrite({ cause: marked })).toBe(true);
    expect(await runInCausation({ routineDepth: 1, untrustedOrigin: false }, () => recordCauseBy({}, cause))).toEqual({
      kind: "mutation",
      routineDepth: 1,
    });
    expect(isUntrustedAgentRecordWrite({ cause })).toBe(false);
    expect(isUntrustedAgentRecordWrite(null)).toBe(false);
  });

  it("lets an explicit routine depth of the cause win over the running context", async () => {
    expect(
      await runInCausation({ routineDepth: 2 }, () => recordCauseBy({}, { kind: "mutation", routineDepth: 1 })),
    ).toEqual({ kind: "mutation", routineDepth: 1 });
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
