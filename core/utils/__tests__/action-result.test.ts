import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { EmailVerificationRequiredError } from "@/core/auth/email-verification-required-error";
import { WORKSPACE_CHANGED_DIGEST } from "@/core/errors/workspace-changed";
import { WorkspaceChangedError } from "@/core/errors/workspace-changed-error";
import { createZodError, serializeInteractorFailure } from "@/core/validation/validation.utils";

import {
  serializeActionFailure,
  serializeResult,
  serializeTypedData,
  serializeTypedResult,
  settleOutcome,
} from "../action-result";

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

  it("sends a session held for email verification to the verification page", async () => {
    redirect.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(serializeResult(Promise.reject(new EmailVerificationRequiredError()))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirect).toHaveBeenCalledWith("/auth/verify-email");
  });

  it("redirects a held session to verification instead of treating it as an inactive membership", async () => {
    redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(serializeTypedResult(Promise.reject(new EmailVerificationRequiredError()))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirect).toHaveBeenLastCalledWith("/auth/verify-email");
    redirect.mockReset();
  });

  it("serializes a permission refusal as a typed authorization failure", async () => {
    expect(await serializeTypedResult(Promise.reject(new ForbiddenError()))).toMatchObject({
      ok: false,
      failure: { kind: "authorization", issues: [{ customCode: CustomErrorCode.permissionDenied }] },
    });
  });

  it("answers a membership that is no longer active with a typed refusal the tab treats as a changed workspace", async () => {
    const inactive = () => Promise.reject(new ForbiddenError("User is not active", AppErrorCode.inactiveUser));

    expect(await serializeTypedResult(inactive())).toMatchObject({
      ok: false,
      failure: { kind: "authorization", issues: [{ customCode: CustomErrorCode.userInactive }] },
    });
    const result = await serializeResult(inactive());
    expect(result).toMatchObject({ ok: false, code: CustomErrorCode.userInactive });
    expect(!result.ok && result.error).toMatchObject({ digest: WORKSPACE_CHANGED_DIGEST });
  });

  it("answers a changed workspace with a conflict that carries its digest instead of failing the request", async () => {
    const result = await serializeResult(Promise.reject(new WorkspaceChangedError()));

    expect(result).toMatchObject({ ok: false, code: CustomErrorCode.workspaceChanged });
    expect(result).not.toHaveProperty("retryable");
    expect(!result.ok && result.error).toMatchObject({ digest: WORKSPACE_CHANGED_DIGEST });
    expect(await serializeTypedResult(Promise.reject(new WorkspaceChangedError()))).toMatchObject({
      ok: false,
      failure: { kind: "conflict", issues: [{ customCode: CustomErrorCode.workspaceChanged }] },
    });
  });

  it("keeps the digest off every other failure", async () => {
    const result = await serializeResult(failure(CustomErrorCode.unipileRateLimit));

    expect(!result.ok && result.error).not.toHaveProperty("digest");
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

describe("serializeTypedData", () => {
  it("maps the data of a successful result and leaves a failure untouched", async () => {
    expect(await serializeTypedData({ ok: true, data: 2 }, (value) => value * 3)).toEqual({ ok: true, data: 6 });
    const map = vi.fn();
    expect(await serializeTypedData(Promise.reject(new WorkspaceChangedError()), map)).toMatchObject({
      ok: false,
      failure: { kind: "conflict", issues: [{ customCode: CustomErrorCode.workspaceChanged }] },
    });
    expect(map).not.toHaveBeenCalled();
  });
});

describe("serializeActionFailure", () => {
  it("builds the same failure as serializeResult, with the digest for a changed workspace", async () => {
    const changed = failure(CustomErrorCode.workspaceChanged);

    expect(serializeActionFailure(changed.error)).toEqual(await serializeResult(changed));
    expect(serializeActionFailure(changed.error)).toMatchObject({
      ok: false,
      code: CustomErrorCode.workspaceChanged,
      error: { digest: WORKSPACE_CHANGED_DIGEST },
    });
  });
});

describe("settleOutcome", () => {
  it("keeps a custom outcome shape and settles a changed workspace into a failure", async () => {
    expect(await settleOutcome(Promise.resolve({ redirect: "/billing" }))).toEqual({ redirect: "/billing" });
    const settled = await settleOutcome<{ redirect: string }>(Promise.reject(new WorkspaceChangedError()));
    expect(settled).toMatchObject({ ok: false });
    expect("error" in settled && serializeActionFailure(settled.error)).toMatchObject({
      code: CustomErrorCode.workspaceChanged,
    });
    await expect(settleOutcome(Promise.reject(new Error("unexpected")))).rejects.toThrow("unexpected");
  });

  it("sends a login held for email verification to verify it, as the other action results do", async () => {
    expect(await settleOutcome(Promise.reject(new EmailVerificationRequiredError()))).toEqual({
      redirect: "/auth/verify-email",
    });
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
