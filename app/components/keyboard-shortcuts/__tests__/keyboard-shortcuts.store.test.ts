import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions", () => ({ upsertP13nAction: upsert }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: toastError }));

import { KeyboardShortcutsStore } from "../keyboard-shortcuts.store";

function createStore() {
  return new KeyboardShortcutsStore({ registerModalStore: () => undefined } as unknown as RootStore);
}

beforeEach(() => {
  upsert.mockReset();
  toastError.mockReset();
});

describe("keyboard shortcuts store", () => {
  it("starts with single-key shortcuts on and takes the loaded preference", () => {
    const store = createStore();
    expect(store.singleKeyShortcutsEnabled).toBe(true);
    store.setPreferences({ singleKeyShortcuts: false });
    expect(store.singleKeyShortcutsEnabled).toBe(false);
    store.setPreferences(null);
    expect(store.singleKeyShortcutsEnabled).toBe(true);
  });

  it("saves the preference optimistically under its own P13n entry", async () => {
    upsert.mockResolvedValue({ ok: true });
    const store = createStore();
    await store.setSingleKeyShortcuts(false);
    expect(upsert).toHaveBeenCalledWith({ p13nId: "keyboard", settings: { singleKeyShortcuts: false } });
    expect(store.singleKeyShortcutsEnabled).toBe(false);
  });

  it("rolls back when the save is refused or throws", async () => {
    const store = createStore();
    upsert.mockResolvedValueOnce({ ok: false, error: {} });
    await store.setSingleKeyShortcuts(false);
    expect(toastError).toHaveBeenCalledOnce();
    expect(store.singleKeyShortcutsEnabled).toBe(true);

    upsert.mockRejectedValueOnce(new Error("offline"));
    await expect(store.setSingleKeyShortcuts(false)).rejects.toThrow("offline");
    expect(store.singleKeyShortcutsEnabled).toBe(true);
  });
});
