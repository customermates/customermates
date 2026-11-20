import type { RootStore } from "@/core/stores/root.store";

import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ getAutomationsListAction: vi.fn() }));

vi.mock("../actions", () => actions);
vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

import { AutomationsStore } from "../components/automations.store";

function makeStore() {
  return new AutomationsStore({
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user: {}, can: () => true, canManage: () => true },
  } as unknown as RootStore);
}

const PAGE = { page: 1, pageSize: 25 as const, total: 0, totalPages: 1 };

describe("the automations list store", () => {
  it("remembers that the server cut the list short, and forgets it when the next result is complete", () => {
    const store = makeStore();
    expect(store.truncated).toBe(false);

    store.setItems({ items: [], pagination: PAGE, truncated: true });
    expect(store.truncated).toBe(true);

    store.setItems({ items: [], pagination: PAGE });
    expect(store.truncated).toBe(false);

    store.setItems({ items: [], pagination: PAGE, truncated: false });
    expect(store.truncated).toBe(false);
  });

  it("reads the count of automations the server left out", () => {
    const store = makeStore();

    store.setItems({ items: [], pagination: PAGE, notShown: { rules: 0, routines: 3 } });
    expect(store.truncated).toBe(true);

    store.setItems({ items: [], pagination: PAGE, notShown: { rules: 0, routines: 0 } });
    expect(store.truncated).toBe(false);
  });

  it("takes the flag from a refresh as well as from the first load", async () => {
    actions.getAutomationsListAction.mockResolvedValue({
      ok: true,
      data: { items: [], pagination: PAGE, truncated: true },
    });
    const store = makeStore();
    store.setItems({ items: [], pagination: PAGE });

    await store.refresh();

    expect(store.truncated).toBe(true);
  });
});
