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
    const expected = new Intl.NumberFormat("en-US", { currency: Currency.idr, style: "currency" }).format(1234.5);

    expect(store.formatCurrency(1234.5)).toBe(expected);
    expect(expected).toContain("IDR");
  });
});
