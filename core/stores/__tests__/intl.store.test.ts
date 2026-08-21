import { describe, expect, it } from "vitest";

import type { RootStore } from "../root.store";

import { Currency, Locale } from "@/generated/prisma";

import { IntlStore } from "../intl.store";

describe("IntlStore currency formatting", () => {
  it("formats the company currency as IDR", () => {
    const rootStore = {
      companyStore: { company: { currency: Currency.idr } },
      localeStore: { locale: "en" },
      userStore: { user: { formattingLocale: Locale.en } },
    } as unknown as RootStore;
    const store = new IntlStore(rootStore);
    const expected = new Intl.NumberFormat("en-US", { currency: Currency.idr, style: "currency" }).format(1234.5);

    expect(store.formatCurrency(1234.5)).toBe(expected);
    expect(expected).toContain("IDR");
  });
});

describe("IntlStore locale resolution", () => {
  it("uses the routed display locale before a user is hydrated", () => {
    const store = new IntlStore({
      companyStore: { company: null },
      localeStore: { locale: "de" },
      userStore: { user: null },
    } as unknown as RootStore);

    expect(store.formattingLocale).toBe("de-DE");
  });

  it("uses an explicit formatting preference through the registry", () => {
    const store = new IntlStore({
      companyStore: { company: null },
      localeStore: { locale: "fr" },
      userStore: { user: { formattingLocale: Locale.fr } },
    } as unknown as RootStore);

    expect(store.formattingLocale).toBe("fr-FR");
    expect(store.parseNumber("1\u202f234,5")).toBe(1234.5);
  });

  it("resolves System from the routed display locale", () => {
    const store = new IntlStore({
      companyStore: { company: null },
      localeStore: { locale: "de" },
      userStore: { user: { formattingLocale: Locale.system } },
    } as unknown as RootStore);

    expect(store.formattingLocale).toBe("de-DE");
    expect(store.resolvedFormattingLanguageTag).toBe("de-DE");
  });
});

describe("IntlStore zoned-value hydration gate", () => {
  function createStore() {
    return new IntlStore({
      companyStore: { company: null },
      localeStore: { locale: "en" },
      userStore: { user: { formattingLocale: Locale.en } },
    } as unknown as RootStore);
  }

  const date = new Date("2025-09-09T15:00:00.000Z");

  it("renders no zoned value before the client has mounted, so server output cannot depend on the server's timezone", () => {
    const store = createStore();

    expect(store.rendersZonedValues).toBe(false);
    expect(store.formatNumericalShortDateTime(date)).toBe("");
    expect(store.formatNumericalShortDate(date)).toBe("");
    expect(store.formatDescriptiveLongDateTime(date)).toBe("");
    expect(store.formatTime(date)).toBe("");
    expect(store.formatRelativeTime(date)).toBe("");
  });

  it("renders zoned values once the client has mounted", () => {
    const store = createStore();
    store.markClientHydrated();

    expect(store.rendersZonedValues).toBe(true);
    expect(store.formatNumericalShortDateTime(date)).not.toBe("");
    expect(store.formatTime(date)).not.toBe("");
  });

  it("keeps timezone-independent formatting available before mount", () => {
    const store = createStore();

    expect(store.formatNumber(1234.5)).not.toBe("");
  });
});
