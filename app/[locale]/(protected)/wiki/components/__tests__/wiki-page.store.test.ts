import type { RootStore } from "@/core/stores/root.store";

import { autorun } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
}));

vi.mock("../../actions", () => ({
  createWikiPagesAction: actions.create,
  updateWikiPageAction: actions.update,
  deleteWikiPageAction: actions.delete,
  getWikiPageAction: actions.get,
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({
  toastZodErrorTree: vi.fn(),
}));

import { WikiPageStore } from "../wiki-page.store";

function rootStore(canManage = true): RootStore {
  return {
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
const latest = {
  ...page,
  title: "Updated by another editor",
  updatedAt: new Date("2026-09-10T00:00:00.000Z"),
};

beforeEach(() => {
  actions.create.mockReset().mockResolvedValue({ ok: true, data: [page] });
  actions.update.mockReset().mockResolvedValue({ ok: true, data: latest });
  actions.delete.mockReset().mockResolvedValue({ ok: true, data: page });
  actions.get.mockReset().mockResolvedValue({ ok: true, data: latest });
});

describe("Wiki document editing", () => {
  it("creates an unsaved blank draft and persists only on Save", async () => {
    const changed = vi.fn();
    const store = new WikiPageStore(rootStore(), page, changed);
    store.startCreate();
    expect(store.creating).toBe(true);
    expect(store.form).toMatchObject({ id: null, title: "", markdown: "" });
    expect(actions.create).not.toHaveBeenCalled();

    store.onChange("title", "Company Overview");
    store.onChange("markdown", "Overview");
    await store.onSubmit();

    expect(actions.create).toHaveBeenCalledExactlyOnceWith({
      pages: [{ title: "Company Overview", markdown: "Overview" }],
      requireEmpty: false,
    });
    expect(store.creating).toBe(false);
    expect(store.hasUnsavedChanges).toBe(false);
    expect(changed).toHaveBeenCalledWith(page.id);
  });

  it("starts a blank draft that becomes saveable after editing", async () => {
    const store = new WikiPageStore(rootStore(), null, vi.fn());
    store.startCreate();

    expect(store.creating).toBe(true);
    expect(store.form).toMatchObject({ id: null, title: "", markdown: "" });
    expect(store.hasUnsavedChanges).toBe(false);

    store.onChange("title", "Support");

    await store.onSubmit();

    expect(actions.create).toHaveBeenCalledExactlyOnceWith({
      pages: [{ title: "Support", markdown: "" }],
      requireEmpty: false,
    });
  });

  it("saves direct edits with the original concurrency token and suppresses clean saves", async () => {
    const store = new WikiPageStore(rootStore(), page, vi.fn());
    await store.onSubmit();
    expect(actions.update).not.toHaveBeenCalled();
    store.onChange("title", "New title");
    await store.onSubmit();
    expect(actions.update).toHaveBeenCalledExactlyOnceWith({
      id: page.id,
      expectedUpdatedAt: page.updatedAt,
      title: "New title",
      markdown: page.markdown,
    });
    expect(store.form.updatedAt).toEqual(latest.updatedAt);
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("keeps unsaved same-page edits and new drafts through server refreshes", () => {
    const store = new WikiPageStore(rootStore(), page, vi.fn());
    store.onChange("markdown", "My unfinished changes");
    store.receivePage(latest);
    expect(store.form.markdown).toBe("My unfinished changes");
    expect(store.form.updatedAt).toEqual(page.updatedAt);

    store.startCreate();
    store.onChange("title", "A new document");
    store.receivePage(latest);
    expect(store.creating).toBe(true);
    expect(store.form.title).toBe("A new document");
  });

  it("accepts clean refreshes and navigation to a different document", () => {
    const store = new WikiPageStore(rootStore(), page, vi.fn());
    store.receivePage(latest);
    expect(store.form.title).toBe(latest.title);
    store.receivePage({ ...page, id: "10000000-0000-4000-8000-000000000002" });
    expect(store.form.id).toBe("10000000-0000-4000-8000-000000000002");
  });

  it("ignores an older same-page snapshot after a successful Save", async () => {
    const store = new WikiPageStore(rootStore(), page, vi.fn());
    store.onChange("title", "My update");
    await store.onSubmit();
    store.receivePage(page);

    expect(store.form.title).toBe(latest.title);
    expect(store.form.updatedAt).toEqual(latest.updatedAt);
  });

  it("preserves a stale draft, then reloads the current version only when asked", async () => {
    actions.update.mockResolvedValue({
      ok: false,
      conflict: true,
      error: { errors: ["Conflict"] },
    });
    const onChanged = vi.fn();
    const store = new WikiPageStore(rootStore(), page, onChanged);
    store.onChange("markdown", "My draft");
    await store.onSubmit();
    expect(store.conflict).toBe(true);
    expect(store.form.markdown).toBe("My draft");
    expect(store.form.updatedAt).toEqual(page.updatedAt);
    expect(actions.get).not.toHaveBeenCalled();
    await store.reload();
    expect(store.conflict).toBe(false);
    expect(store.form.title).toBe(latest.title);
    expect(store.hasUnsavedChanges).toBe(false);
    expect(onChanged).toHaveBeenCalledWith(latest.id);
  });

  it("keeps a draft if Save or reload validation fails", async () => {
    const error = { errors: ["Validation failed"] };
    actions.update.mockResolvedValue({ ok: false, conflict: false, error });
    actions.get.mockResolvedValue({ ok: false, error });
    const store = new WikiPageStore(rootStore(), page, vi.fn());
    store.onChange("markdown", "My draft");
    await store.onSubmit();
    await store.reload();
    expect(store.form.markdown).toBe("My draft");
    expect(store.error).toEqual(error);
    expect(store.isLoading).toBe(false);
  });

  it("shows a validation error without losing the draft or showing a stale-update banner", async () => {
    const error = {
      kind: "validation",
      issues: [{ code: "too_big", path: ["title"], message: "Too long" }],
    };
    actions.update.mockResolvedValue({ ok: false, conflict: false, error });
    const store = new WikiPageStore(rootStore(), page, vi.fn());
    store.onChange("title", "An unsaved title");

    await store.onSubmit();

    expect(store.conflict).toBe(false);
    expect(store.error).toEqual(error);
    expect(store.form.title).toBe("An unsaved title");
    expect(store.hasUnsavedChanges).toBe(true);
  });

  it("does not mutate for read-only users", async () => {
    const store = new WikiPageStore(rootStore(false), page, vi.fn());
    store.startCreate();
    store.onChange("title", "Attempt");
    await store.onSubmit();
    expect(await store.delete()).toBe(false);
    expect(store.creating).toBe(false);
    expect(actions.create).not.toHaveBeenCalled();
    expect(actions.update).not.toHaveBeenCalled();
    expect(actions.delete).not.toHaveBeenCalled();
  });

  it("retains the page and signals conflict on stale delete", async () => {
    actions.delete.mockResolvedValue({
      ok: false,
      conflict: true,
      error: { errors: ["Conflict"] },
    });
    const changed = vi.fn();
    const store = new WikiPageStore(rootStore(), page, changed);
    expect(await store.delete()).toBe(false);
    expect(store.conflict).toBe(true);
    expect(store.form.id).toBe(page.id);
    expect(changed).not.toHaveBeenCalled();
  });

  it("shows unavailable when the page disappeared before reload", async () => {
    actions.get.mockResolvedValue({ ok: true, data: null });
    const store = new WikiPageStore(rootStore(), page, vi.fn());
    await store.reload();
    expect(store.unavailable).toBe(true);
  });

  it("keeps asynchronous state changes inside MobX actions and blocks a duplicate Save", async () => {
    let finish!: (value: unknown) => void;
    actions.update.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const store = new WikiPageStore(rootStore(), page, vi.fn());
    const dispose = autorun(() => void [store.creating, store.conflict, store.form.updatedAt]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      store.onChange("title", "New title");
      const first = store.onSubmit();
      await store.onSubmit();
      expect(actions.update).toHaveBeenCalledOnce();
      finish({ ok: true, data: latest });
      await first;
      expect(warn.mock.calls.flat().join(" ")).not.toContain("Since strict-mode is enabled");
    } finally {
      warn.mockRestore();
      dispose();
    }
  });
});
