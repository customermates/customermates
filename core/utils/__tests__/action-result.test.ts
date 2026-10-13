import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { ForbiddenError } from "@/core/errors/app-errors";
import { createZodError, serializeInteractorFailure } from "@/core/validation/validation.utils";

import { serializeResult, serializeTypedResult } from "../action-result";

function failure(code: CustomErrorCode) {
  return { ok: false as const, error: createZodError("Provider failure", [], { error: code }) };
}

describe("serializeResult", () => {
  it.each([CustomErrorCode.unipileRateLimit, CustomErrorCode.unipileServiceUnavailable])(
    "marks %s as worth retrying",
    async (code) => {
      expect(await serializeResult(failure(code))).toMatchObject({ ok: false, code, retryable: true });
    },
  );

  it.each([
    CustomErrorCode.unipileRequestTimeout,
    CustomErrorCode.unipileSendUnconfirmed,
    CustomErrorCode.unipileProviderRejected,
    CustomErrorCode.unipileDisconnectedAccount,
  ])("never offers a retry for %s", async (code) => {
    const result = await serializeResult(failure(code));

    expect(result).toMatchObject({ ok: false, code });
    expect(result).not.toHaveProperty("retryable");
  });

  it("turns a lock wait that timed out into a retryable busy failure", async () => {
    const lockTimeout = Object.assign(new Error("lock timeout"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { originalCode: "55P03" } } },
    });

    expect(await serializeResult(Promise.reject(lockTimeout))).toMatchObject({
      ok: false,
      code: CustomErrorCode.serviceBusy,
      retryable: true,
    });
    expect(await serializeTypedResult(Promise.reject(lockTimeout))).toMatchObject({
      ok: false,
      failure: { kind: "rate_limit", retryable: true, issues: [{ customCode: CustomErrorCode.serviceBusy }] },
    });
    await expect(serializeResult(Promise.reject(new Error("unexpected")))).rejects.toThrow("unexpected");
  });

  it("serializes a permission refusal as a typed authorization failure", async () => {
    expect(await serializeTypedResult(Promise.reject(new ForbiddenError()))).toMatchObject({
      ok: false,
      failure: { kind: "authorization", issues: [{ customCode: CustomErrorCode.permissionDenied }] },
    });
  });

  it("reports an expired transaction as unavailable without a retry hint", async () => {
    const expired = Object.assign(new Error("transaction expired"), {
      code: "P2028",
    });
    expect(await serializeResult(Promise.reject(expired))).toMatchObject({
      ok: false,
      code: CustomErrorCode.recordTransactionEnded,
    });
    expect(await serializeTypedResult(Promise.reject(expired))).toMatchObject({
      ok: false,
      failure: {
        kind: "unavailable",
        issues: [{ customCode: CustomErrorCode.recordTransactionEnded }],
      },
    });
    expect(await serializeResult(Promise.reject(expired))).not.toHaveProperty("retryable");
  });

  it("leaves a plain validation failure without a code", async () => {
    const result = await serializeResult({ ok: false, error: createZodError("Required", ["to"]) });

    expect(result).not.toHaveProperty("code");
    expect(result).not.toHaveProperty("retryable");
  });
});

describe("serializeInteractorFailure", () => {
  it("tells MCP agents and row actions when a retry can help", () => {
    expect(serializeInteractorFailure(failure(CustomErrorCode.unipileRateLimit).error)).toMatchObject({
      retryable: true,
    });
    expect(serializeInteractorFailure(failure(CustomErrorCode.unipileSendOutcomeUnknown).error)).not.toHaveProperty(
      "retryable",
    );
  });
});
