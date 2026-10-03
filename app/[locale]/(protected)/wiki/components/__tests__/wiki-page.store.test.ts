import type { RootStore } from "@/core/stores/root.store";

import { autorun } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("../../actions", () => ({
  createWikiPagesAction: actions.create,
  updateWikiPageAction: actions.update,
  deleteWikiPageAction: actions.delete,
  getWikiPageAction: actions.get,
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({
  toastZodErrorTree: actions.toast,
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
  kind: "knowledge" as const,
  whenToUse: null,

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
  actions.toast.mockReset();
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
      pages: [{ title: "Company Overview", markdown: "Overview", kind: "knowledge", whenToUse: undefined }],
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
      pages: [{ title: "Support", markdown: "", kind: "knowledge", whenToUse: undefined }],
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
      kind: "knowledge",
      whenToUse: undefined,
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

  it.each([null, { ...latest, id: "10000000-0000-4000-8000-000000000002" }])(
    "ignores unsolicited replacement snapshots while dirty, creating or saving: %s",
    (replacement) => {
      const store = new WikiPageStore(rootStore(), page, vi.fn());
      store.onChange("title", "Unsaved title");
      store.receivePage(replacement);
      expect(store.form.title).toBe("Unsaved title");
      expect(store.form.id).toBe(page.id);
      store.startCreate("New page");
      store.receivePage(replacement);
      expect(store.creating).toBe(true);
      expect(store.form.title).toBe("New page");
      store.load(page);
      store.setIsLoading(true);
      store.receivePage(replacement);
      expect(store.form.id).toBe(page.id);
      expect(store.isLoading).toBe(true);
    },
  );

  it("accepts clean refreshes and navigation to a different document", () => {
    const store = new WikiPageStore(rootStore(), page, vi.fn());
    store.receivePage(latest);
    expect(store.form.title).toBe(latest.title);
    store.receivePage({ ...page, id: "10000000-0000-4000-8000-000000000002" });
    expect(store.form.id).toBe("10000000-0000-4000-8000-000000000002");
  });

  it("keeps the editor document stable when the same page arrives again", () => {
    const store = new WikiPageStore(rootStore(), page, vi.fn());
    const document = store.editorDocument;
    store.receivePage({ ...page, updatedAt: new Date(page.updatedAt) });
    expect(store.editorDocument).toBe(document);
    store.receivePage(latest);
    expect(store.editorDocument).not.toBe(document);
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
      failure: {
        kind: "conflict",
        issues: [
          {
            code: "custom",
            customCode: CustomErrorCode.wikiPageConflict,
            path: ["expectedUpdatedAt"],
            message: "Conflict",
          },
        ],
      },
    });
    const onChanged = vi.fn();
    const store = new WikiPageStore(rootStore(), page, onChanged);
    store.onChange("markdown", "My draft");
    await store.onSubmit();
    expect(store.conflict).toBe(true);
    expect(actions.toast).not.toHaveBeenCalled();
    expect(store.form.markdown).toBe("My draft");
    expect(store.form.updatedAt).toEqual(page.updatedAt);
    expect(actions.get).not.toHaveBeenCalled();
    await store.reload();
    expect(store.conflict).toBe(false);
    expect(store.form.title).toBe(latest.title);
    expect(store.hasUnsavedChanges).toBe(false);
    expect(onChanged).toHaveBeenCalledWith(latest.id);
  });

  it("preserves a new page and shows the guide admission error without a stale-document recovery", async () => {
    actions.create.mockResolvedValue({
      ok: false,
      failure: {
        kind: "conflict",
        issues: [
          {
            code: "custom",
            customCode: CustomErrorCode.wikiGuideExists,
            path: ["pages"],
            message: "A guide already exists",
          },
        ],
      },
    });
    const changed = vi.fn();
    const store = new WikiPageStore(rootStore(), page, changed);
    store.startCreate();
    store.onChange("title", "My guide");
    store.onChange("kind", "guide");
    store.onChange("markdown", "My rules");

    await store.onSubmit();

    expect(store.conflict).toBe(false);
    expect(store.error).toEqual({ errors: [], properties: { pages: { errors: ["A guide already exists"] } } });
    expect(store.creating).toBe(true);
    expect(store.form).toMatchObject({ id: null, title: "My guide", kind: "guide", markdown: "My rules" });
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.isLoading).toBe(false);
    expect(actions.get).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it("preserves a kind change when another editor has already created the guide", async () => {
    actions.update.mockResolvedValue({
      ok: false,
      failure: {
        kind: "conflict",
        issues: [
          {
            code: "custom",
            customCode: CustomErrorCode.wikiGuideExists,
            path: ["kind"],
            message: "A guide already exists",
          },
        ],
      },
    });
    const changed = vi.fn();
    const store = new WikiPageStore(rootStore(), page, changed);
    store.onChange("kind", "guide");
    store.onChange("markdown", "My rules");

    await store.onSubmit();

    expect(store.conflict).toBe(false);
    expect(store.error).toEqual({ errors: [], properties: { kind: { errors: ["A guide already exists"] } } });
    expect(store.form).toMatchObject({ id: page.id, kind: "guide", markdown: "My rules", updatedAt: page.updatedAt });
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.isLoading).toBe(false);
    expect(actions.get).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it("keeps a draft if Save or reload validation fails", async () => {
    const error = { errors: ["Validation failed"] };
    actions.update.mockResolvedValue({
      ok: false,
      failure: { kind: "validation", issues: [{ code: "custom", path: [], message: "Validation failed" }] },
    });
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
    actions.update.mockResolvedValue({ ok: false, failure: error });
    const store = new WikiPageStore(rootStore(), page, vi.fn());
    store.onChange("title", "An unsaved title");

    await store.onSubmit();

    expect(store.conflict).toBe(false);
    expect(store.error).toEqual({ errors: [], properties: { title: { errors: ["Too long"] } } });
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

  it("retains the page and only toasts on stale delete", async () => {
    actions.delete.mockResolvedValue({
      ok: false,
      failure: {
        kind: "conflict",
        issues: [
          {
            code: "custom",
            customCode: CustomErrorCode.wikiPageConflict,
            path: ["expectedUpdatedAt"],
            message: "Conflict",
          },
        ],
      },
    });
    const changed = vi.fn();
    const store = new WikiPageStore(rootStore(), page, changed);
    expect(await store.delete()).toBe(false);
    expect(store.conflict).toBe(false);
    expect(actions.toast).toHaveBeenCalledExactlyOnceWith({
      errors: [],
      properties: { expectedUpdatedAt: { errors: ["Conflict"] } },
    });
    expect(store.form.id).toBe(page.id);
    expect(changed).not.toHaveBeenCalled();
  });

  it("shows unavailable when the page disappeared before reload", async () => {
    actions.get.mockResolvedValue({ ok: true, data: null });
    const store = new WikiPageStore(rootStore(), page, vi.fn());
    await store.reload();
    expect(store.unavailable).toBe(true);
  });

  it("acknowledges the saved route even if its page disappeared before the response arrived", async () => {
    const created = { ...page, id: "10000000-0000-4000-8000-000000000002" };
    actions.create.mockResolvedValue({ ok: true, data: [created] });
    const store = new WikiPageStore(rootStore(), null, vi.fn());
    store.initializeServerPage(page);
    store.startCreate();
    store.onChange("title", created.title);
    await store.onSubmit();
    expect(store.awaitingSelection).toBe(true);
    store.receiveServerPage(null, created.id);
    expect(store.awaitingSelection).toBe(false);
    expect(store.form.id).toBeNull();
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it.each(["reload", "save", "delete"] as const)(
    "does not apply a late %s result or navigation callback to a successor page",
    async (operation) => {
      let finish!: (value: unknown) => void;
      const pending = new Promise((resolve) => {
        finish = resolve;
      });
      const action = operation === "reload" ? actions.get : operation === "save" ? actions.update : actions.delete;
      action.mockReturnValue(pending);
      const originalChanged = vi.fn();
      const successorChanged = vi.fn();
      const store = new WikiPageStore(rootStore(), page, originalChanged);
      if (operation === "save") store.onChange("title", "Original unsaved title");
      const result = operation === "reload" ? store.reload() : operation === "save" ? store.onSubmit() : store.delete();

      store.releaseView();
      const successor = { ...page, id: "10000000-0000-4000-8000-000000000002", title: "Successor page" };
      store.initializeServerPage(successor, successor.id);
      store.attachOnChanged(successorChanged);
      store.onChange("markdown", "Two unsaved paragraphs on the successor page.\n\nBoth must remain.");
      store.setIsLoading(true);
      const successorForm = { ...store.form };
      finish({ ok: true, data: latest });
      await result;

      expect(store.form).toEqual(successorForm);
      expect(store.hasUnsavedChanges).toBe(true);
      expect(store.isLoading).toBe(true);
      expect(store.conflict).toBe(false);
      expect(store.unavailable).toBe(false);
      expect(originalChanged).not.toHaveBeenCalled();
      expect(successorChanged).not.toHaveBeenCalled();
    },
  );

  it.each(["reload", "save", "delete"] as const)(
    "does not report a late %s failure on a successor page",
    async (operation) => {
      let finish!: (value: unknown) => void;
      const pending = new Promise((resolve) => {
        finish = resolve;
      });
      const action = operation === "reload" ? actions.get : operation === "save" ? actions.update : actions.delete;
      action.mockReturnValue(pending);
      const store = new WikiPageStore(rootStore(), page, vi.fn());
      if (operation === "save") store.onChange("title", "Original unsaved title");
      const result = operation === "reload" ? store.reload() : operation === "save" ? store.onSubmit() : store.delete();

      store.releaseView();
      const successor = { ...page, id: "10000000-0000-4000-8000-000000000002", title: "Successor page" };
      store.initializeServerPage(successor, successor.id);
      finish({
        ok: false,
        error: { errors: ["Original reload failed"] },
        failure: {
          kind: "conflict",
          issues: [{ code: "custom", customCode: CustomErrorCode.wikiPageConflict, path: [], message: "Stale page" }],
        },
      });
      await result;

      expect(store.form).toMatchObject({ id: successor.id, title: successor.title });
      expect(store.error).toBeUndefined();
      expect(store.conflict).toBe(false);
      expect(store.isLoading).toBe(false);
      expect(actions.toast).not.toHaveBeenCalled();
    },
  );

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
