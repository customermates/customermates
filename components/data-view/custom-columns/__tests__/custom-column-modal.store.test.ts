import type { RootStore } from "@/core/stores/root.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";

vi.mock("@/app/actions", () => ({
  deleteCustomColumnAction: vi.fn(),
  upsertCustomColumnAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { upsertCustomColumnAction } from "@/app/actions";

import { CustomColumnModalStore } from "../custom-column-modal.store";

function rootStore(translate: (key: string, values?: Record<string, unknown>) => string): RootStore {
  return {
    localeStore: { getTranslation: translate },
    registerModalStore: vi.fn(),
  } as unknown as RootStore;
}

const SAVED_COLUMN = { id: "col-new", type: CustomColumnType.singleSelect } as CustomColumnDto;

function creationHarness(detail: { id?: string; isOpen?: boolean } = {}) {
  const calls: string[] = [];
  const step = (name: string) => {
    calls.push(name);
    return Promise.resolve(true);
  };
  const dealsStore = { refresh: vi.fn(() => step("refresh")) };
  const dealDetailStore = {
    add: vi.fn(() => step("add")),
    form: { id: detail.id },
    isEditingCustomField: false,
    isOpen: detail.isOpen ?? false,
    loadById: vi.fn(() => step("loadById")),
    setIsEditingCustomField: vi.fn(),
  };
  const store = new CustomColumnModalStore({
    ...rootStore((_key, values) => `Option ${String(values?.number)}`),
    dealDetailStore,
    dealsStore,
  } as unknown as RootStore);
  const onSaved = vi.fn((column: CustomColumnDto) => void calls.push(`saved:${column.id}`));

  return { calls, dealDetailStore, dealsStore, onSaved, store };
}

describe("CustomColumnModalStore creation from a caller", () => {
  beforeEach(() => {
    vi.mocked(upsertCustomColumnAction).mockReset();
    vi.mocked(upsertCustomColumnAction).mockResolvedValue({ ok: true, data: SAVED_COLUMN });
  });

  it("opens a preselected single-select form for the entity type", () => {
    const { store, onSaved } = creationHarness();

    store.openForCreate({ type: CustomColumnType.singleSelect, entityType: EntityType.deal, onSaved });

    expect(store.isOpen).toBe(true);
    expect(store.form.id).toBeUndefined();
    expect(store.form.type).toBe(CustomColumnType.singleSelect);
    expect(store.form.entityType).toBe(EntityType.deal);
  });

  it("locks the preselected type until the modal is reopened another way", () => {
    const { store, onSaved } = creationHarness();

    store.openForCreate({ type: CustomColumnType.singleSelect, entityType: EntityType.deal, onSaved });
    store.changeType(CustomColumnType.plain);

    expect(store.isTypeLocked).toBe(true);
    expect(store.form.type).toBe(CustomColumnType.singleSelect);

    store.initialize(CustomColumnType.plain, EntityType.deal);
    store.changeType(CustomColumnType.currency);

    expect(store.isTypeLocked).toBe(false);
    expect(store.form.type).toBe(CustomColumnType.currency);
  });

  it("hands the saved column to the caller after the list refreshed and the modal closed", async () => {
    const { calls, store, onSaved } = creationHarness();
    store.openForCreate({ type: CustomColumnType.singleSelect, entityType: EntityType.deal, onSaved });

    await store.onSubmit();

    expect(calls).toEqual(["refresh", "saved:col-new"]);
    expect(onSaved).toHaveBeenCalledWith(SAVED_COLUMN);
    expect(store.isOpen).toBe(false);
  });

  it("leaves the entity drawer alone when no record is loaded and none is being created", async () => {
    const { dealDetailStore, store, onSaved } = creationHarness();
    store.openForCreate({ type: CustomColumnType.singleSelect, entityType: EntityType.deal, onSaved });

    await store.onSubmit();

    expect(dealDetailStore.add).not.toHaveBeenCalled();
    expect(dealDetailStore.loadById).not.toHaveBeenCalled();
  });

  it("re-initialises an open entity create form so it picks up the new column", async () => {
    const { dealDetailStore, store } = creationHarness({ isOpen: true });
    store.initialize(CustomColumnType.plain, EntityType.deal);
    store.open();

    await store.onSubmit();

    expect(dealDetailStore.add).toHaveBeenCalledOnce();
  });

  it("reloads a loaded record after the save", async () => {
    const { dealDetailStore, store } = creationHarness({ id: "deal-1" });
    store.initialize(CustomColumnType.plain, EntityType.deal);
    store.open();

    await store.onSubmit();

    expect(dealDetailStore.loadById).toHaveBeenCalledWith("deal-1");
    expect(dealDetailStore.add).not.toHaveBeenCalled();
  });

  it("drops a stale caller once the modal is reopened another way", async () => {
    const { store, onSaved } = creationHarness();
    store.openForCreate({ type: CustomColumnType.singleSelect, entityType: EntityType.deal, onSaved });
    store.initialize(CustomColumnType.plain, EntityType.deal);
    store.open();

    await store.onSubmit();

    expect(onSaved).not.toHaveBeenCalled();
  });

  it("keeps the modal open and skips the caller on a rejected save", async () => {
    vi.mocked(upsertCustomColumnAction).mockResolvedValue({
      ok: false,
      error: { errors: ["rejected"], properties: {} },
    } as unknown as Awaited<ReturnType<typeof upsertCustomColumnAction>>);
    const { store, onSaved } = creationHarness();
    store.openForCreate({ type: CustomColumnType.singleSelect, entityType: EntityType.deal, onSaved });

    await store.onSubmit();

    expect(onSaved).not.toHaveBeenCalled();
    expect(store.isOpen).toBe(true);
  });
});

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
