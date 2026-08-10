import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const registry = vi.hoisted(() => ({
  validationTagFor: vi.fn(() => "de"),
}));

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(() => Promise.resolve("en")),
  getTranslations: vi.fn(() => Promise.resolve({ raw: (key: string) => key })),
}));

vi.mock("@/i18n/locale-registry", () => ({
  appLocaleOrDefault: () => "en",
  validationTagFor: registry.validationTagFor,
}));

import { configureZodLocale } from "../zod-error-map-server";

afterEach(() => {
  z.config(z.locales.en());
  vi.clearAllMocks();
});

describe("configureZodLocale", () => {
  it("loads the Zod locale selected by the registry adapter", async () => {
    await configureZodLocale();

    expect(registry.validationTagFor).toHaveBeenCalledWith("en");
    const result = z.string().min(5).safeParse("a");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toContain("Zu klein");
  });
});
