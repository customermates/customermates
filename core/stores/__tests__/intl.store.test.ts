import { afterEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "../root.store";

import { Currency, Locale } from "@/generated/prisma";
import { DEFAULT_LOCALE, formattingTagFor } from "@/i18n/locale-registry";

import { IntlStore } from "../intl.store";

describe("IntlStore currency formatting", () => {
  it("formats the company currency as IDR", () => {
    const rootStore = {
      companyStore: { company: { currency: Currency.idr } },
      userStore: { user: { formattingLocale: Locale.en } },
    } as unknown as RootStore;
    const store = new IntlStore(rootStore);
    const expected = new Intl.NumberFormat("en-US", { currency: Currency.idr, style: "currency" }).format(1234.5);

    expect(store.formatCurrency(1234.5)).toBe(expected);
    expect(expected).toContain("IDR");
  });
});

describe("IntlStore locale resolution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the deterministic default before a user is hydrated", () => {
    const store = new IntlStore({
      companyStore: { company: null },
      userStore: { user: null },
    } as unknown as RootStore);

    expect(store.formattingLocale).toBe(formattingTagFor(DEFAULT_LOCALE));
  });

  it("uses an explicit formatting preference through the registry", () => {
    const store = new IntlStore({
      companyStore: { company: null },
      userStore: { user: { formattingLocale: Locale.fr } },
    } as unknown as RootStore);

    expect(store.formattingLocale).toBe("fr-FR");
    expect(store.parseNumber("1\u202f234,5")).toBe(1234.5);
  });

  it("resolves System from the browser only after the user is available", () => {
    vi.stubGlobal("navigator", { language: "de-DE" });
    const store = new IntlStore({
      companyStore: { company: null },
      userStore: { user: { formattingLocale: Locale.system } },
    } as unknown as RootStore);

    expect(store.formattingLocale).toBeUndefined();
    expect(store.resolvedFormattingLanguageTag).toBe("de-DE");
  });
});
