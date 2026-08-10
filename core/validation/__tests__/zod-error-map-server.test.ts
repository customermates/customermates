import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { CustomErrorCode } from "../validation.types";

const registry = vi.hoisted(() => ({
  locale: "en",
  validationTagFor: vi.fn((locale: string) => locale),
}));

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(() => Promise.resolve(registry.locale)),
  getTranslations: vi.fn(() => {
    const locale = registry.locale;
    return Promise.resolve({ raw: (key: string) => `${locale}:${key}` });
  }),
}));

vi.mock("@/i18n/locale-registry", () => ({
  appLocaleOrDefault: (locale: string) => locale,
  validationTagFor: registry.validationTagFor,
}));

import { getZodParseContext } from "../zod-error-map-server";

afterEach(() => {
  registry.locale = "en";
  z.config(z.locales.en());
  vi.clearAllMocks();
});

describe("getZodParseContext", () => {
  it("loads the registry-selected Zod locale without mutating global configuration", async () => {
    registry.locale = "de";
    const context = await getZodParseContext();

    expect(registry.validationTagFor).toHaveBeenCalledWith("de");

    const localized = z.string().min(5).safeParse("a", context);
    expect(localized.success).toBe(false);
    if (!localized.success) expect(localized.error.issues[0].message).toContain("Zu klein");

    const global = z.string().min(5).safeParse("a");
    expect(global.success).toBe(false);
    if (!global.success) expect(global.error.issues[0].message).toContain("Too small");
  });

  it("keeps concurrent custom-error translations isolated per request", async () => {
    registry.locale = "en";
    const englishContext = await getZodParseContext();
    registry.locale = "de";
    const germanContext = await getZodParseContext();
    const schema = z.string().superRefine(async (_value, ctx) => {
      await Promise.resolve();
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.generic } });
    });

    const [english, german] = await Promise.all([
      schema.safeParseAsync("value", englishContext),
      schema.safeParseAsync("value", germanContext),
    ]);

    expect(english.success).toBe(false);
    expect(german.success).toBe(false);
    if (!english.success) expect(english.error.issues[0].message).toBe("en:Common.errors.generic");
    if (!german.success) expect(german.error.issues[0].message).toBe("de:Common.errors.generic");
  });
});
