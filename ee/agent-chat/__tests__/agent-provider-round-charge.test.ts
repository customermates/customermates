import { describe, expect, it } from "vitest";
import { readAgentProviderErrorCharge, readAgentProviderRoundCharge } from "../agent-provider-error";

function metadata(cost: string, success = true, generationId?: string) {
  return {
    gateway: {
      gatewayCost: cost,
      ...(generationId !== undefined ? { generationId } : {}),
      routing: {
        finalProvider: "vertex",
        modelAttempts: [{ providerAttempts: [{ provider: "vertex", credentialType: "system", success }] }],
      },
    },
  };
}

function envelope(attempts: unknown[], currentAttempt: unknown, extra: Record<string, unknown> = {}) {
  return { kind: "ai-sdk-workflow-provider-error", version: 1, attempts, currentAttempt, ...extra };
}

function round(receipt: unknown) {
  return readAgentProviderRoundCharge({ workflow: { providerReceipt: receipt } }, "vertex");
}

describe("provider request and stream receipt aggregation", () => {
  it("includes a billed retry and the distinct successful current request", () => {
    expect(
      round(
        envelope([metadata("0.0005", true, "public-prior")], {
          finishMetadata: metadata("0.0007", true, "public-current"),
        }),
      ),
    ).toEqual({ costMicrocents: 120_000, measured: true, currentAttemptOutcome: "measured" });
  });

  it.each(["0", "0.0007"])("retains measured finish authority with a Gateway debit of %s", (cost) => {
    expect(round(envelope([], { finishMetadata: metadata(cost), errorAttempts: [metadata("0", false)] }))).toEqual({
      costMicrocents: cost === "0" ? 0 : 70_000,
      measured: true,
      currentAttemptOutcome: "measured",
    });
  });

  it("does not let a successful stream hide an unreported earlier retry", () => {
    expect(round(envelope([null], { finishMetadata: metadata("0.0007") }))).toEqual(
      expect.objectContaining({ costMicrocents: 70_000, measured: false, currentAttemptOutcome: "measured" }),
    );
  });

  it("keeps prior positive cost separate from the current proven unbilled outcome", () => {
    expect(round(envelope([metadata("0.0005")], { finishMetadata: metadata("0", false) }))).toEqual({
      costMicrocents: 50_000,
      measured: true,
      currentAttemptOutcome: "notBilled",
    });
  });

  it("deduplicates the same known generation across prior and current receipts", () => {
    expect(
      round(
        envelope([metadata("0.0005", true, "public-shared")], {
          finishMetadata: metadata("0.0005", true, "public-shared"),
        }),
      ),
    ).toEqual({ costMicrocents: 50_000, measured: true, currentAttemptOutcome: "measured" });
  });

  it("treats empty generation identifiers as missing for distinct SDK requests", () => {
    expect(round(envelope([metadata("0.0005", true, "")], { finishMetadata: metadata("0.0005", true, "") }))).toEqual({
      costMicrocents: 100_000,
      measured: true,
      currentAttemptOutcome: "measured",
    });
    expect(
      readAgentProviderErrorCharge(
        new Error("Public failure", {
          cause: {
            kind: "ai-sdk-workflow-provider-error",
            version: 1,
            attempts: [metadata("0.0005", true, ""), metadata("0.0005", true, "")],
          },
        }),
        "vertex",
      ),
    ).toEqual({ costMicrocents: 100_000, measured: true });
  });

  it("deduplicates consistent identified current candidates as one request", () => {
    expect(
      round(
        envelope([], {
          errorAttempts: [metadata("0.0005", true, "public-current"), metadata("0.0005", true, "public-current")],
        }),
      ),
    ).toEqual({ costMicrocents: 50_000, measured: true, currentAttemptOutcome: "measured" });
  });

  it("preserves a positive current floor when a later reader failure reports zero", () => {
    expect(round(envelope([], { errorAttempts: [metadata("0.0005"), metadata("0", false)] }))).toEqual(
      expect.objectContaining({ costMicrocents: 50_000, measured: false, currentAttemptOutcome: "unreadable" }),
    );
  });

  it("does not sum unidentified terminal candidates for the same current request", () => {
    expect(round(envelope([], { errorAttempts: [metadata("0.0005"), metadata("0.0007")] }))).toEqual(
      expect.objectContaining({ costMicrocents: 70_000, measured: false, currentAttemptOutcome: "unreadable" }),
    );
  });

  it("does not let a later zero replace a captured unreadable positive finish", () => {
    const finishMetadata = { gateway: { gatewayCost: "0.0005", routing: {} } };
    expect(round(envelope([], { finishMetadata, errorAttempts: [metadata("0", false)] }))).toEqual(
      expect.objectContaining({ costMicrocents: 50_000, measured: false, currentAttemptOutcome: "unreadable" }),
    );
  });

  it("honors consistently unbilled current candidates without a finish", () => {
    expect(round(envelope([], { errorAttempts: [metadata("0", false), metadata("0", false)] }))).toEqual({
      costMicrocents: 0,
      measured: true,
      currentAttemptOutcome: "notBilled",
    });
  });

  it("requires conservative settlement when bounded callback capture was incomplete", () => {
    expect(
      round(envelope([metadata("0.0005")], { finishMetadata: metadata("0") }, { incompleteAttempts: true })),
    ).toEqual(expect.objectContaining({ costMicrocents: 50_000, measured: false, currentAttemptOutcome: "measured" }));
  });

  it.each([null, {}, { errorAttempts: [] }, { errorAttempts: Array.from({ length: 17 }, () => metadata("0", false)) }])(
    "does not infer a free current request from missing or malformed current receipt %#",
    (current) => {
      expect(round(envelope([], current))).toEqual(
        expect.objectContaining({ costMicrocents: 0, measured: false, currentAttemptOutcome: "unreadable" }),
      );
    },
  );

  it("retains the current positive floor when prior callback capture exceeds its bound", () => {
    expect(
      round(
        envelope(
          Array.from({ length: 16 }, () => metadata("0", false)),
          { finishMetadata: metadata("0.0005") },
        ),
      ),
    ).toEqual(expect.objectContaining({ costMicrocents: 50_000, measured: false }));
  });

  it("preserves explicit storage or writable origin with its charge evidence", () => {
    const receipt = envelope([], { finishMetadata: metadata("0.0005") }, { providerFailure: false });
    expect(readAgentProviderErrorCharge(new Error("Public writable failure", { cause: receipt }), "vertex")).toEqual({
      costMicrocents: 50_000,
      measured: true,
      providerFailure: false,
    });
  });

  it("does not trust malformed accounting flags", () => {
    expect(round(envelope([], { finishMetadata: metadata("0", false) }, { incompleteAttempts: "false" }))).toEqual(
      expect.objectContaining({ measured: false }),
    );
  });

  it("requires the reserved versioned metadata namespace", () => {
    expect(readAgentProviderRoundCharge(metadata("0.0005"), "vertex")).toBeNull();
    expect(round({ ...envelope([], { finishMetadata: metadata("0.0005") }), version: 2 })).toBeNull();
  });
});

describe("OVHcloud rejections before generation", () => {
  function ovhError(envelopeValue: Record<string, unknown>) {
    return Object.assign(new Error("A provider request failed before complete usage was available."), {
      cause: envelopeValue,
    });
  }

  it.each([400, 401, 403, 404, 422, 429])(
    "releases the round of a single OVH request rejected with %i before generating",
    (statusCode) => {
      const single = { kind: "ai-sdk-workflow-provider-error", version: 1, attempts: [null], statusCode };
      expect(readAgentProviderErrorCharge(ovhError(single), "ovh")).toEqual({ costMicrocents: 0, measured: true });
      expect(
        readAgentProviderErrorCharge(ovhError(envelope([], { errorAttempts: [null] }, { statusCode })), "ovh"),
      ).toEqual({ costMicrocents: 0, measured: true });
    },
  );

  it.each([408, 500, 503, undefined])("keeps an OVH failure with status %s unreadable", (statusCode) => {
    const single = { kind: "ai-sdk-workflow-provider-error", version: 1, attempts: [null], statusCode };
    expect(readAgentProviderErrorCharge(ovhError(single), "ovh")).toMatchObject({ measured: false });
  });

  it("keeps an OVH rejection after an earlier attempt, a partial stream or incomplete attempts unreadable", () => {
    const statusCode = 400;
    for (const value of [
      { kind: "ai-sdk-workflow-provider-error", version: 1, attempts: [null, null], statusCode },
      envelope([null], { errorAttempts: [null] }, { statusCode }),
      envelope([], { finishMetadata: null, errorAttempts: [null] }, { statusCode }),
      envelope([], { errorAttempts: [null] }, { statusCode, incompleteAttempts: true }),
      envelope([], { errorAttempts: [null] }, { statusCode, providerFailure: false }),
    ])
      expect(readAgentProviderErrorCharge(ovhError(value), "ovh")).toMatchObject({ measured: false });
  });

  it("leaves a Gateway rejection on the Gateway receipt rule", () => {
    const single = { kind: "ai-sdk-workflow-provider-error", version: 1, attempts: [null], statusCode: 400 };
    expect(readAgentProviderErrorCharge(ovhError(single), "vertex")).toMatchObject({ measured: false });
  });
});
