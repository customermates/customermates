import type { AbstractIntlMessages } from "next-intl";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";
import { REPO_ROOT } from "@/tests/conventions/walk";

const mockEnv = vi.hoisted(() => ({ NEXT_PUBLIC_SENTRY_DSN: undefined as string | undefined }));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("next-intl/server", () => ({ getRequestConfig: <T>(config: T) => config }));

import { messagesForErrorReporting } from "../error-reporting-messages";
import requestConfig from "../request";

type Catalog = {
  ErrorCard: Record<string, string>;
  NotFoundPage: Record<string, string>;
  WithoutErrorReporting: { ErrorCard: Record<string, string>; NotFoundPage: Record<string, string> };
};

function catalog(locale: string): Catalog {
  return JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", `${locale}.json`), "utf8")) as Catalog;
}

describe("error wording without error reporting", () => {
  it.each(APP_LOCALES)("replaces the notification claims in %s and keeps the other copy", (locale) => {
    const source = catalog(locale);
    const messages = messagesForErrorReporting(source as unknown as AbstractIntlMessages, false) as unknown as Catalog;

    expect(messages.ErrorCard).toEqual({ ...source.ErrorCard, ...source.WithoutErrorReporting.ErrorCard });
    expect(messages.NotFoundPage).toEqual({ ...source.NotFoundPage, ...source.WithoutErrorReporting.NotFoundPage });
    expect(messages).not.toHaveProperty("WithoutErrorReporting");
  });

  it.each(APP_LOCALES)("keeps the array messages that t.raw reads as arrays in %s", (locale) => {
    const source = catalog(locale) as unknown as { Subscription: { picker: { features: Record<string, string[]> } } };
    const messages = messagesForErrorReporting(
      source as unknown as AbstractIntlMessages,
      false,
    ) as unknown as typeof source;

    for (const [plan, features] of Object.entries(source.Subscription.picker.features))
      expect(messages.Subscription.picker.features[plan], plan).toEqual(features);
  });

  it("never claims that anyone was notified in English", () => {
    const messages = messagesForErrorReporting(
      catalog("en") as unknown as AbstractIntlMessages,
      false,
    ) as unknown as Catalog;

    expect([
      messages.ErrorCard.contactSupport,
      messages.ErrorCard.unexpectedError,
      messages.NotFoundPage.body,
    ]).not.toEqual(expect.arrayContaining([expect.stringMatching(/notified/i)]));
  });

  it("keeps the reporting wording when errors are reported", () => {
    const source = catalog("en");
    const messages = messagesForErrorReporting(source as unknown as AbstractIntlMessages, true) as unknown as Catalog;

    expect(messages.ErrorCard).toEqual(source.ErrorCard);
    expect(messages).not.toHaveProperty("WithoutErrorReporting");
  });

  it("serves the wording that matches the configured error reporting", async () => {
    const load = requestConfig as unknown as (params: {
      requestLocale: Promise<string>;
    }) => Promise<{ messages: Catalog }>;

    mockEnv.NEXT_PUBLIC_SENTRY_DSN = undefined;
    const unreported = await load({ requestLocale: Promise.resolve("de") });
    expect(unreported.messages.ErrorCard.unexpectedError).toBe(
      catalog("de").WithoutErrorReporting.ErrorCard.unexpectedError,
    );

    mockEnv.NEXT_PUBLIC_SENTRY_DSN = "https://key@sentry.example/1";
    const reported = await load({ requestLocale: Promise.resolve("de") });
    expect(reported.messages.ErrorCard.unexpectedError).toBe(catalog("de").ErrorCard.unexpectedError);
  });
});
