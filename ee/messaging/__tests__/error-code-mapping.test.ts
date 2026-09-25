import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, UNIPILE_API_KEY: "test-key" } }));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError, interactorFailureKind } from "@/core/validation/validation.utils";

import { UnipileRequestError, unipileErrorCode } from "../messaging.service";

describe("a timeout is not a rejection", () => {
  it("maps a client timeout to the timeout code rather than the generic rejection", () => {
    expect(unipileErrorCode(new UnipileRequestError(0, null, ""))).toBe(CustomErrorCode.unipileRequestTimeout);
  });

  it("keeps a real 5xx on service unavailable", () => {
    expect(unipileErrorCode(new UnipileRequestError(503, null, ""))).toBe(CustomErrorCode.unipileServiceUnavailable);
  });

  it("keeps an unclassified 4xx on unknown", () => {
    expect(unipileErrorCode(new UnipileRequestError(418, null, ""))).toBe(CustomErrorCode.unipileUnknown);
  });

  it("does not let the timeout branch swallow a rate limit", () => {
    expect(unipileErrorCode(new UnipileRequestError(429, null, ""))).toBe(CustomErrorCode.unipileRateLimit);
  });
});

describe("a permission refusal is not a provider outage", () => {
  const refused = new UnipileRequestError(
    403,
    "provider/insufficient_permissions",
    JSON.stringify({ type: "provider/insufficient_permissions", detail: "This profile can't be accessed" }),
  );

  it("does not invite a retry that can never succeed", () => {
    expect(unipileErrorCode(refused)).toBe(CustomErrorCode.unipileResourceNotFound);
    expect(unipileErrorCode(refused)).not.toBe(CustomErrorCode.unipileProviderError);
  });

  it("leaves other provider failures on the provider-error code", () => {
    expect(unipileErrorCode(new UnipileRequestError(500, "provider/server_error", ""))).toBe(
      CustomErrorCode.unipileProviderError,
    );
  });
});

describe("a provider failure reaches API clients with the kind they branch on", () => {
  it.each([
    ["a provider rate limit", new UnipileRequestError(429, "provider/rate_limited", ""), "rate_limit"],
    ["a Unipile rate limit", new UnipileRequestError(429, null, ""), "rate_limit"],
    ["a client timeout", new UnipileRequestError(0, null, ""), "unavailable"],
    ["a Unipile outage", new UnipileRequestError(503, null, ""), "unavailable"],
    ["a provider outage", new UnipileRequestError(500, "provider/server_error", ""), "unavailable"],
    ["a missing resource", new UnipileRequestError(404, "api/resource_not_found", ""), "not_found"],
    [
      "a profile the account cannot see",
      new UnipileRequestError(403, "provider/insufficient_permissions", ""),
      "not_found",
    ],
    ["a disconnected account", new UnipileRequestError(401, "provider/invalid_credentials", ""), "validation"],
  ])("classifies %s as %s", (_label, err, kind) => {
    const error = createZodError("Provider failure", [], { error: unipileErrorCode(err) });

    expect(interactorFailureKind(error)).toBe(kind);
  });
});
