import type { RootStore } from "@/core/stores/root.store";

import { describe, expect, it, vi } from "vitest";

import { WikiPageStore } from "../wiki-page.store";

function rootStore(appMode: "cloud" | "demo", canManage: boolean): RootStore {
  return {
    appMode,
    userStore: {
      user: { id: "user-1" },
      canManage: vi.fn().mockReturnValue(canManage),
    },
  } as unknown as RootStore;
}

describe("WikiPageStore", () => {
  it("instantiates with the inherited permission computed value", () => {
    const store = new WikiPageStore(rootStore("cloud", true), null, vi.fn());

    expect(store.canManage).toBe(true);
  });

  it("keeps demo Wiki pages read-only", () => {
    const store = new WikiPageStore(rootStore("demo", true), null, vi.fn());

    expect(store.canManage).toBe(false);
  });
});
