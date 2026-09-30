import type { RootStore } from "@/core/stores/root.store";

import { describe, expect, it, vi } from "vitest";
import { Currency } from "@/generated/prisma";

const actions = vi.hoisted(() => ({ updateCompanyAction: vi.fn() }));
vi.mock("../../../actions", () => actions);

import { CompanySettingsStore } from "../company-settings.store";

function makeRootStore() {
  return {
    companyStore: {
      company: { currency: Currency.eur },
      setCompany: vi.fn(),
    },
  } as unknown as RootStore;
}

describe("CompanySettingsStore", () => {
  it("saves only currency and refreshes its clean state", async () => {
    const rootStore = makeRootStore();
    const store = new CompanySettingsStore(rootStore);
    store.onChange("currency", Currency.usd);
    actions.updateCompanyAction.mockResolvedValue({ ok: true, data: { currency: Currency.usd } });

    await store.onSubmit();

    expect(actions.updateCompanyAction).toHaveBeenCalledWith({ currency: Currency.usd });
    expect(rootStore.companyStore.setCompany).toHaveBeenCalledWith({ currency: Currency.usd });
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("keeps an unsaved currency change after a failed update", async () => {
    const store = new CompanySettingsStore(makeRootStore());
    store.onChange("currency", Currency.usd);
    const error = { formErrors: ["failed"], fieldErrors: {} };
    actions.updateCompanyAction.mockResolvedValue({ ok: false, error });

    await store.onSubmit();

    expect(store.form.currency).toBe(Currency.usd);
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.error).toEqual(error);
  });
});
