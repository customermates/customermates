import { describe, it, expect, vi } from "vitest";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { requestedTimeoutMs } from "../messaging.service";

const HEADER = "x-customermates-timeout-ms";
const DEFAULT_MS = 30_000;

describe("unipile request timeout budget", () => {
  it("falls back to the default when no budget is declared", () => {
    expect(requestedTimeoutMs(new Request("https://example.test/"))).toBe(DEFAULT_MS);
  });

  it("honours a longer budget instead of overwriting it with the default", () => {
    const request = new Request("https://example.test/", { headers: { [HEADER]: "90000" } });

    expect(requestedTimeoutMs(request)).toBe(90_000);
  });

  it("strips the internal header so it never reaches unipile", () => {
    const request = new Request("https://example.test/", { headers: { [HEADER]: "90000" } });
    requestedTimeoutMs(request);

    expect(request.headers.get(HEADER)).toBeNull();
  });

  it("ignores a malformed budget rather than disabling the timeout", () => {
    for (const value of ["", "abc", "0", "-1"]) {
      const request = new Request("https://example.test/", { headers: { [HEADER]: value } });
      expect(requestedTimeoutMs(request)).toBe(DEFAULT_MS);
    }
  });

  it("defaults for a plain url, which is how the sdk calls a non-Request input", () => {
    expect(requestedTimeoutMs("https://example.test/")).toBe(DEFAULT_MS);
  });
});
