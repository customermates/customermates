import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError, serializeInteractorFailure } from "@/core/validation/validation.utils";

import { serializeResult } from "../action-result";

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
