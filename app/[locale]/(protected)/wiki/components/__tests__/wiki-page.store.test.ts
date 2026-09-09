import type { RootStore } from "@/core/stores/root.store";

import { autorun } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../actions", () => ({
  createWikiPagesAction: actions.create,
  updateWikiPageAction: actions.update,
  deleteWikiPageAction: actions.delete,
}));

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

const page = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Company Overview",
  markdown: "Overview",
  createdAt: new Date("2026-09-09T00:00:00.000Z"),
  updatedAt: new Date("2026-09-09T00:00:00.000Z"),
};

beforeEach(() => {
  actions.create.mockReset().mockResolvedValue({ ok: true, data: [page] });
  actions.update.mockReset().mockResolvedValue({ ok: true, data: page });
  actions.delete.mockReset();
});

describe("WikiPageStore", () => {
  it("uses the inherited resource permission", () => {
    const store = new WikiPageStore(rootStore("cloud", true), null, vi.fn());

    expect(store.canManage).toBe(true);
  });

  it("does not duplicate the server's demo-mode write guard in the client", () => {
    const store = new WikiPageStore(rootStore("demo", true), null, vi.fn());

    expect(store.canManage).toBe(true);
  });

  it.each(["create", "update"] as const)(
    "leaves %s mode through a MobX action after the server responds",
    async (mode) => {
      const store = new WikiPageStore(rootStore("cloud", true), mode === "update" ? page : null, vi.fn());
      const dispose = autorun(() => void store.editing);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      try {
        if (mode === "create") store.startCreate();
        else store.startEdit();

        await store.onSubmit();

        expect(store.editing).toBe(false);
        expect(warn.mock.calls.flat().join(" ")).not.toContain("Since strict-mode is enabled");
        if (mode === "create") expect(actions.create).toHaveBeenCalledOnce();
        else expect(actions.update).toHaveBeenCalledOnce();
      } finally {
        warn.mockRestore();
        dispose();
      }
    },
  );
});
