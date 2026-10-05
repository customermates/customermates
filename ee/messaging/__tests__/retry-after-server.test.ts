import { describe, expect, it, vi } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";

const intl = vi.hoisted(() => ({ locale: "en" }));

vi.mock("next-intl/server", async () => {
  const { readFileSync } = await import("node:fs");
  const catalog = (locale: string) =>
    JSON.parse(readFileSync(`${process.cwd()}/i18n/locales/${locale}.json`, "utf8")) as Record<string, never>;

  return {
    getLocale: () => Promise.resolve(intl.locale),
    getTranslations: (namespace: string) => {
      const scope = namespace.split(".").reduce((node, key) => node[key], catalog(intl.locale));
      const t = (key: string) => scope[key];
      t.raw = (key: string) => scope[key];
      return Promise.resolve(t);
    },
  };
});

import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { retryAfterPhrase } from "../retry-after.server";

async function rateLimitText(locale: string, seconds: number | null) {
  intl.locale = locale;
  const result = await fail(CustomErrorCode.unipileRateLimit, [], { retryAfter: await retryAfterPhrase(seconds) });

  return result.error.issues[0].message;
}

describe("server-rendered rate-limit text", () => {
  it.each(APP_LOCALES)("names a known wait and a localized fallback without ICU syntax in %s", async (locale) => {
    const known = await rateLimitText(locale, 90);
    const unknown = await rateLimitText(locale, null);

    for (const text of [known, unknown]) expect(text).not.toMatch(/[{}]/);
    expect(known).toContain(new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(2, "minute"));
    expect(unknown).not.toBe(known);
  });
});
