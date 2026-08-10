import { describe, expect, it } from "vitest";

import {
  APP_LOCALE_COOKIE_NAME,
  appLocaleCookie,
  appLocaleCookieUpdate,
  appLocaleReconciliationTarget,
  browserAppLocale,
  displayLanguageNavigationTarget,
  expiredAppLocaleCookie,
} from "../locale-preference";
import {
  normalizeStoredDisplayLanguage,
  normalizeStoredFormattingLocale,
  resolveUserFormattingTag,
} from "../user-locale";

describe("locale preferences", () => {
  it("matches complete browser tags before falling back to their base language", () => {
    expect(browserAppLocale(["invalid", "fr-CA", "de-DE"])).toBe("fr");
    expect(browserAppLocale(["IT-it"])).toBe("it");
    expect(browserAppLocale(["pt-BR"])).toBe("en");
  });

  it("navigates System through locale negotiation and explicit preferences through their locale", () => {
    expect(displayLanguageNavigationTarget("system", "/profile/settings")).toBe("/profile/settings");
    expect(displayLanguageNavigationTarget("it", "/profile/settings")).toBe("/it/profile/settings");
    expect(displayLanguageNavigationTarget("system", "/de/profile/settings?tab=mine#open")).toBe(
      "/profile/settings?tab=mine#open",
    );
    expect(displayLanguageNavigationTarget("it", "/de/profile/settings?tab=mine#open")).toBe(
      "/it/profile/settings?tab=mine#open",
    );
    expect(displayLanguageNavigationTarget("it", "/de?tab=mine#open")).toBe("/it?tab=mine#open");
  });

  it("reconciles a newly synchronized preference with the rendered app locale", () => {
    expect(appLocaleReconciliationTarget("fr", "de", "/dashboard?tab=mine#open", "en")).toBe(
      "/fr/dashboard?tab=mine#open",
    );
    expect(appLocaleReconciliationTarget("fr", "fr", "/dashboard", "en")).toBeNull();
    expect(appLocaleReconciliationTarget("system", "de", "/dashboard?tab=mine#open", "en")).toBe(
      "/en/dashboard?tab=mine#open",
    );
    expect(appLocaleReconciliationTarget("it", "en", "/it/dashboard?tab=mine#open", "en")).toBe(
      "/it/dashboard?tab=mine#open",
    );
    expect(appLocaleReconciliationTarget("system", "de", "/dashboard", "de")).toBeNull();
    expect(appLocaleReconciliationTarget("retired", "de", "/dashboard", "en")).toBeNull();
  });

  it("writes, preserves, replaces, and removes the dedicated application preference cookie", () => {
    expect(APP_LOCALE_COOKIE_NAME).not.toBe("NEXT_LOCALE");
    expect(appLocaleCookieUpdate("it", "theme=dark")).toBe(appLocaleCookie("it"));
    expect(appLocaleCookieUpdate("it", `${APP_LOCALE_COOKIE_NAME}=it; theme=dark`)).toBeNull();
    expect(appLocaleCookieUpdate("de", `${APP_LOCALE_COOKIE_NAME}=it`)).toBe(appLocaleCookie("de"));
    expect(appLocaleCookieUpdate("system", `${APP_LOCALE_COOKIE_NAME}=it`)).toBe(expiredAppLocaleCookie());
    expect(appLocaleCookieUpdate("system", "theme=dark")).toBeNull();
    expect(appLocaleCookieUpdate(null, `${APP_LOCALE_COOKIE_NAME}=it`)).toBeNull();
  });

  it("normalizes retired stored preferences to System", () => {
    expect(normalizeStoredDisplayLanguage("fr")).toBe("fr");
    expect(normalizeStoredDisplayLanguage("retired")).toBe("system");
    expect(normalizeStoredFormattingLocale("de")).toBe("de");
    expect(normalizeStoredFormattingLocale("retired")).toBe("system");
  });

  it("uses an explicit formatting locale and resolves System through display locale", () => {
    expect(resolveUserFormattingTag({ formattingLocale: "de" }, "fr")).toBe("de-DE");
    expect(resolveUserFormattingTag({ formattingLocale: "system" }, "fr")).toBe("fr-FR");
    expect(resolveUserFormattingTag({ formattingLocale: "retired" }, "it")).toBe("it-IT");
  });
});
