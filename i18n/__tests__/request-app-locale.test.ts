import { afterEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ locale: "en" }));

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve(request.locale),
}));

import { DEFAULT_LOCALE } from "../locale-registry";
import { getRequestAppLocale } from "../request-app-locale";

afterEach(() => {
  request.locale = "en";
});

describe("getRequestAppLocale", () => {
  it("preserves an application locale", async () => {
    request.locale = "it";

    await expect(getRequestAppLocale()).resolves.toBe("it");
  });

  it("falls back when the request locale is outside the application domain", async () => {
    request.locale = "nl";

    await expect(getRequestAppLocale()).resolves.toBe(DEFAULT_LOCALE);
  });
});
