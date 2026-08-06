import { describe, expect, it } from "vitest";

import type { RootStore } from "../root.store";

import { Currency, Locale } from "@/generated/prisma";

import { IntlStore } from "../intl.store";

describe("IntlStore currency formatting", () => {
  it("formats the company currency as IDR", () => {
    const rootStore = {
      companyStore: { company: { currency: Currency.idr } },
      userStore: { user: { formattingLocale: Locale.en } },
    } as unknown as RootStore;
    const store = new IntlStore(rootStore);

    expect(store.formatCurrency(1234.5)).toContain("IDR");
    expect(store.formatCurrency(1234.5)).toContain("1,234.50");
  });
});
