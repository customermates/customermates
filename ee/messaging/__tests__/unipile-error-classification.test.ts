import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, UNIPILE_API_KEY: "test-key" } }));

import {
  UnipileRequestError,
  isUnipileProviderUnprocessable,
  isUnipileSourceForbidden,
  isUnipileTimeout,
} from "../messaging.service";

function unprocessable(detail: string): UnipileRequestError {
  return new UnipileRequestError(
    422,
    "provider/unprocessable_entity",
    JSON.stringify({
      object: "Error",
      status: 422,
      type: "provider/unprocessable_entity",
      title: "Unprocessable entity",
      detail,
    }),
  );
}

describe("isUnipileProviderUnprocessable", () => {
  it("recognises the provider rejections seen in production", () => {
    expect(isUnipileProviderUnprocessable(unprocessable("LIST completed"))).toBe(true);
    expect(isUnipileProviderUnprocessable(unprocessable("SELECT completed"))).toBe(true);
  });

  it("does not classify on the detail text, so an unseen provider phrase still matches", () => {
    expect(isUnipileProviderUnprocessable(unprocessable("FETCH completed"))).toBe(true);
  });

  it("ignores a different status carrying the same type", () => {
    expect(isUnipileProviderUnprocessable(new UnipileRequestError(400, "provider/unprocessable_entity", "{}"))).toBe(
      false,
    );
  });

  it("ignores a 422 of a different type", () => {
    expect(isUnipileProviderUnprocessable(new UnipileRequestError(422, "api/invalid_parameters", "{}"))).toBe(false);
  });

  it("ignores errors that are not Unipile rejections", () => {
    expect(isUnipileProviderUnprocessable(new Error("boom"))).toBe(false);
    expect(isUnipileProviderUnprocessable(null)).toBe(false);
    expect(isUnipileProviderUnprocessable(undefined)).toBe(false);
  });

  it("stays distinct from the timeout classifier", () => {
    const timeout = new UnipileRequestError(0, null, "{}");

    expect(isUnipileTimeout(timeout)).toBe(true);
    expect(isUnipileProviderUnprocessable(timeout)).toBe(false);
    expect(isUnipileTimeout(unprocessable("LIST completed"))).toBe(false);
  });
});

describe("isUnipileSourceForbidden", () => {
  const forbidden = new UnipileRequestError(
    403,
    "provider/insufficient_permissions",
    JSON.stringify({
      object: "Error",
      status: 403,
      type: "provider/insufficient_permissions",
      title: "Insufficient permissions",
      detail: "You need to have admin rights of the company page.",
      req_id: "req-sgo",
    }),
  );

  it("recognises a source the account may not read", () => {
    expect(isUnipileSourceForbidden(forbidden)).toBe(true);
  });

  it("stays distinct from the retryable classifiers, since permission never recovers", () => {
    expect(isUnipileProviderUnprocessable(forbidden)).toBe(false);
    expect(isUnipileTimeout(forbidden)).toBe(false);
  });

  it("ignores a 403 of a different type and other statuses", () => {
    expect(isUnipileSourceForbidden(new UnipileRequestError(403, "api/account_restricted", "{}"))).toBe(false);
    expect(isUnipileSourceForbidden(new UnipileRequestError(401, "provider/insufficient_permissions", "{}"))).toBe(
      false,
    );
    expect(isUnipileSourceForbidden(new Error("boom"))).toBe(false);
  });
});

describe("customer data never reaches the exception message", () => {
  const body = JSON.stringify({
    object: "Error",
    status: 500,
    type: "api/internal_error",
    detail: "Delivery to buyer@example-customer.com failed permanently.",
    req_id: "req-priv",
  });

  it("keeps a customer address out of err.message, which becomes the Sentry title and a stored row", () => {
    const err = new UnipileRequestError(500, "api/internal_error", body);

    expect(err.message).not.toContain("buyer@example-customer.com");
    expect(err.message).toContain("[redacted]");
    expect(err.message).toContain("req-priv");
  });

  it("bounds the message so a large body cannot be stored or indexed whole", () => {
    const huge = new UnipileRequestError(500, "api/internal_error", "x".repeat(50_000));

    expect(huge.message.length).toBeLessThan(700);
  });

  it("still exposes the raw body to callers that need it", () => {
    expect(new UnipileRequestError(500, "api/internal_error", body).bodyText).toContain("buyer@example-customer.com");
  });
});
