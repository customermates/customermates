import type { RootStore } from "@/core/stores/root.store";

import { describe, expect, it, vi } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";

vi.mock("@/app/actions", () => ({
  deleteCustomColumnAction: vi.fn(),
  upsertCustomColumnAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { CustomColumnModalStore } from "../custom-column-modal.store";

function rootStore(translate: (key: string, values?: Record<string, unknown>) => string): RootStore {
  return {
    localeStore: { getTranslation: translate },
    registerModalStore: vi.fn(),
  } as unknown as RootStore;
}

describe("CustomColumnModalStore default option labels", () => {
  it("creates the initial option in the active UI language", () => {
    const store = new CustomColumnModalStore(
      rootStore((_key, values) => `Option auf Deutsch ${String(values?.number)}`),
    );

    store.initialize(CustomColumnType.singleSelect, EntityType.contact);

    expect(store.form.type).toBe(CustomColumnType.singleSelect);
    if (store.form.type === CustomColumnType.singleSelect)
      expect(store.form.options.options[0].label).toBe("Option auf Deutsch 1");
  });

  it("numbers added options through the same translated template", () => {
    const store = new CustomColumnModalStore(rootStore((_key, values) => `Opzione ${String(values?.number)}`));
    store.initialize(CustomColumnType.singleSelect, EntityType.contact);

    store.addOption();

    if (store.form.type === CustomColumnType.singleSelect)
      expect(store.form.options.options.map((option) => option.label)).toEqual(["Opzione 1", "Opzione 2"]);
  });
});

describe("CustomColumnModalStore default option selection", () => {
  function singleSelectStore() {
    const store = new CustomColumnModalStore(rootStore((_key, values) => `Option ${String(values?.number)}`));
    store.initialize(CustomColumnType.singleSelect, EntityType.contact);
    store.addOption();
    return store;
  }

  function defaults(store: CustomColumnModalStore) {
    if (store.form.type !== CustomColumnType.singleSelect) throw new Error("expected a single select form");
    return store.form.options.options.map((option) => option.isDefault);
  }

  it("clears the default when the active option is toggled again", () => {
    const store = singleSelectStore();
    if (store.form.type !== CustomColumnType.singleSelect) throw new Error("expected a single select form");
    const [first] = store.form.options.options;

    expect(defaults(store)).toEqual([true, false]);

    store.toggleDefaultOption(first);

    expect(defaults(store)).toEqual([false, false]);
  });

  it("moves the default rather than keeping two options selected", () => {
    const store = singleSelectStore();
    if (store.form.type !== CustomColumnType.singleSelect) throw new Error("expected a single select form");
    const second = store.form.options.options[1];

    store.toggleDefaultOption(second);

    expect(defaults(store)).toEqual([false, true]);
  });

  it("leaves the column without a default when the default option is deleted", () => {
    const store = singleSelectStore();
    if (store.form.type !== CustomColumnType.singleSelect) throw new Error("expected a single select form");
    const [first] = store.form.options.options;

    store.deleteOption(first);

    expect(defaults(store)).toEqual([false]);
  });
});
