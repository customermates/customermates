import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, UNIPILE_API_KEY: "test-key" } }));

import { UnipileRequestError, isUnipileProviderUnprocessable, isUnipileTimeout } from "../messaging.service";

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
