import { randomUUID } from "node:crypto";
import { observable, runInAction, toJS } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RootStore } from "../root.store";
import type { RecordNavigation } from "@/features/records/record-navigation.schema";
import { recordNavigationKey } from "@/features/records/record-navigation.schema";
import { createCrmPreset } from "@/features/records/crm-preset";

const mocks = vi.hoisted(() => ({
  getRecordEditorAction: vi.fn(),
  getRecordNavigationAction: vi.fn(),
}));
vi.mock("@/app/[locale]/(protected)/records/actions", () => mocks);

import { RecordWorkspaceStore } from "../record-workspace.store";
import { RecordEditorStore } from "@/app/[locale]/(protected)/records/[typeId]/components/record-editor.store";
import type { RecordDto } from "@/features/records/record-model.schema";
import type { RecordEditorResult } from "@/features/records/get-record-editor.interactor";
import { NavigationGuardController } from "../navigation-guard.controller";

function fixture() {
  const companyId = randomUUID();
  const userStore = observable({ user: { id: randomUUID(), companyId } });
  const root = {
    userStore,
    registerModalStore: vi.fn(),
    unregisterModalStore: vi.fn(),
    navigationGuard: { tryNavigate: vi.fn((work: () => void) => work()) },
  } as unknown as RootStore;
  const store = new RecordWorkspaceStore(root);
  const navigation: RecordNavigation = {
    companyId,
    schemaRevision: 1,
    canManageSchema: true,
    types: [],
  };
  const model = createCrmPreset(companyId, "EUR");
  const context: RecordEditorResult = {
    model,
    linkColors: {},
    typeId: model.types[0].id,
    record: null,
    canManageSchema: true,
    permittedActions: ["create", "readAll"],
  };
  return { companyId, userStore, root, store, navigation, context };
}

beforeEach(() => vi.resetAllMocks());

describe("workspace record navigation and drawers", () => {
  it("retains readable navigation on failure and clears recovery after Retry or actor replacement", async () => {
    const f = fixture();
    f.store.setNavigation(f.navigation);
    mocks.getRecordNavigationAction.mockRejectedValueOnce(new Error("Read unavailable"));
    await expect(f.store.refreshNavigation()).rejects.toThrow("Read unavailable");
    expect(f.store.navigation).toEqual(f.navigation);
    expect(f.store.navigationRefreshFailed).toBe(true);
    f.store.setNavigation({ ...f.navigation });
    expect(f.store.navigationRefreshFailed).toBe(true);
    mocks.getRecordNavigationAction.mockResolvedValueOnce({
      ...f.navigation,
      schemaRevision: 2,
    });
    await f.store.refreshNavigation();
    expect(f.store.navigation?.schemaRevision).toBe(2);
    expect(f.store.navigationRefreshFailed).toBe(false);
    mocks.getRecordNavigationAction.mockRejectedValueOnce(new Error("Read unavailable"));
    await expect(f.store.refreshNavigation()).rejects.toThrow("Read unavailable");
    runInAction(() => {
      f.userStore.user = { id: randomUUID(), companyId: f.companyId };
    });
    expect(f.store.navigationRefreshFailed).toBe(false);
    expect(f.store.navigation).toBeNull();
  });

  it("ignores a navigation failure from an older request or actor", async () => {
    const f = fixture();
    const older = Promise.withResolvers<RecordNavigation>();
    mocks.getRecordNavigationAction.mockReturnValueOnce(older.promise).mockResolvedValueOnce(f.navigation);
    const oldRequest = f.store.refreshNavigation();
    const rejected = expect(oldRequest).rejects.toThrow("Old failure");
    await f.store.refreshNavigation();
    older.reject(new Error("Old failure"));
    await rejected;
    expect(f.store.navigationRefreshFailed).toBe(false);
    expect(f.store.navigation).toEqual(f.navigation);
    const previousActor = Promise.withResolvers<RecordNavigation>();
    mocks.getRecordNavigationAction.mockReturnValueOnce(previousActor.promise);
    const pending = f.store.refreshNavigation();
    const actorRejected = expect(pending).rejects.toThrow("Previous actor failure");
    runInAction(() => {
      f.userStore.user = { id: randomUUID(), companyId: f.companyId };
    });
    previousActor.reject(new Error("Previous actor failure"));
    await actorRejected;
    expect(f.store.navigationRefreshFailed).toBe(false);
    expect(f.store.navigation).toBeNull();
  });
  it("enables global drawers only after the active record surface has hydrated", () => {
    const f = fixture();
    expect(f.store.routeReady("/records/projects")).toBe(false);
    const release = f.store.registerRoute("/records/projects");
    const releaseSecond = f.store.registerRoute("/records/projects");
    expect(f.store.routeReady("/records/projects")).toBe(true);
    expect(f.store.routeReady("/records/projects/item")).toBe(false);
    release();
    expect(f.store.routeReady("/records/projects")).toBe(true);
    releaseSecond();
    expect(f.store.routeReady("/records/projects")).toBe(false);
    expect(f.store.routeReady("/dashboard")).toBe(true);
  });
  it("keeps the newest manifest and rejects late responses after an account change", async () => {
    const f = fixture();
    f.store.setNavigation({ ...f.navigation, schemaRevision: 3 });
    f.store.setNavigation(f.navigation);
    expect(f.store.navigation?.schemaRevision).toBe(3);
    const first = Promise.withResolvers<RecordNavigation>();
    const second = Promise.withResolvers<RecordNavigation>();
    mocks.getRecordNavigationAction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const firstLoad = f.store.refreshNavigation();
    const secondLoad = f.store.refreshNavigation();
    second.resolve({
      ...f.navigation,
      schemaRevision: 4,
      canManageSchema: false,
    });
    await secondLoad;
    first.resolve({
      ...f.navigation,
      schemaRevision: 4,
      canManageSchema: true,
    });
    await firstLoad;
    expect(f.store.navigation?.canManageSchema).toBe(false);
    const third = Promise.withResolvers<RecordNavigation>();
    mocks.getRecordNavigationAction.mockReturnValueOnce(third.promise);
    const thirdLoad = f.store.refreshNavigation();
    runInAction(() => {
      f.userStore.user = { id: randomUUID(), companyId: f.companyId };
    });
    third.resolve({ ...f.navigation, schemaRevision: 5 });
    await thirdLoad;
    expect(f.store.navigation).toBeNull();
    f.store.setNavigation({ ...f.navigation, companyId: randomUUID() });
    expect(f.store.navigation).toBeNull();
  });

  it("does not reopen a drawer after leaving the route and respects the draft guard", async () => {
    const f = fixture();
    const pending = Promise.withResolvers<unknown>();
    mocks.getRecordEditorAction.mockReturnValueOnce(pending.promise);
    f.store.open({ typeId: f.context.typeId });
    expect(f.store.isOpening).toBe(true);
    f.store.close();
    pending.resolve({ ok: true, data: f.context });
    await pending.promise;
    await Promise.resolve();
    expect(f.store.editor).toBeNull();
    expect(f.store.isOpening).toBe(false);
    vi.mocked(f.root.navigationGuard.tryNavigate).mockImplementationOnce(() => false);
    f.store.open({ typeId: f.context.typeId });
    expect(mocks.getRecordEditorAction).toHaveBeenCalledOnce();
  });

  it("opens the newest record only and notifies active views after a saved record", async () => {
    const f = fixture();
    const first = Promise.withResolvers<unknown>();
    const second = Promise.withResolvers<unknown>();
    mocks.getRecordEditorAction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    f.store.open({ typeId: f.context.typeId });
    f.store.open({ typeId: f.context.model.types[1].id });
    second.resolve({
      ok: true,
      data: { ...f.context, typeId: f.context.model.types[1].id },
    });
    await second.promise;
    await Promise.resolve();
    first.resolve({ ok: true, data: f.context });
    await first.promise;
    await Promise.resolve();
    expect(f.store.editor?.presentation.typeId).toBe(f.context.model.types[1].id);
    expect(f.root.registerModalStore).toHaveBeenCalledOnce();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const unsubscribe = f.store.subscribe(refresh);
    await f.store.editor?.operationCompleted();
    expect(refresh).toHaveBeenCalledOnce();
    unsubscribe();
    await f.store.invalidate();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("distinguishes stable type routes from the surrounding system pages", () => {
    expect(recordNavigationKey("/records/type-a/record-a")).toBe("records:type-a");
    expect(recordNavigationKey("/records/type-b")).toBe("records:type-b");
    expect(recordNavigationKey("/company/settings")).toBe("company");
    expect(recordNavigationKey("/configure")).toBe("configure-records");
  });
});

describe("record draft handoff", () => {
  function editors() {
    const f = fixture();
    const fieldId = f.context.model.types[0].primaryFieldId;
    if (!fieldId) throw new Error("Expected the starter type's primary field");
    const ref = { typeId: f.context.typeId, recordId: randomUUID() };
    const record = (version: number, name: string): RecordDto => ({
      ref,
      version,
      schemaRevision: 1,
      createdAt: "2026-10-06T00:00:00.000Z",
      updatedAt: "2026-10-06T00:00:00.000Z",
      fields: [
        {
          fieldId,
          result: { state: "value", value: { kind: "text", value: name } },
        },
      ],
      assignedUserIds: [],
      assignedUsers: [],
      relationships: [],
    });
    const page = new RecordEditorStore(f.root, f.context, async () => {}, true);
    const drawer = new RecordEditorStore(f.root, f.context, async () => {});
    page.edit(f.context, record(1, "Saved"));
    drawer.edit(f.context, record(1, "Saved"));
    return { ...f, fieldId, ref, record, page, drawer };
  }

  it("refreshes an already mounted page from a clean same-record drawer without queuing a draft", () => {
    const f = editors();
    f.store.registerPageEditor(f.page);
    f.drawer.edit(f.context, f.record(2, "Updated"));
    expect(f.store.handOffDraft(f.drawer)).toBe(true);
    expect(f.page.record?.version).toBe(2);
    expect(f.page.form.values[f.fieldId]).toBe("Updated");
    expect(f.page.hasUnsavedChanges).toBe(false);
    expect(f.store.takeDraftHandoff(f.ref)).toBeNull();
  });

  it.each([false, true])("uses fresh drawer access and layout at equal revisions (drawer dirty: %s)", (dirtyDrawer) => {
    const f = editors();
    f.store.registerPageEditor(f.page);
    const latest: RecordEditorResult = {
      ...f.context,
      canManageSchema: false,
      permittedActions: ["readOwn"],
      detailLayout: {
        typeId: f.context.typeId,
        schemaRevision: 1,
        hasPersonalization: true,
        layout: { pinnedFields: [f.fieldId], hiddenFields: [], fieldOrder: [f.fieldId] },
        fields: [{ id: f.fieldId, label: "Fresh field label" }],
      },
      record: f.record(1, "Saved"),
    };
    f.drawer.edit(latest, latest.record);
    if (dirtyDrawer) f.drawer.onChange(`values.${f.fieldId}`, "Drawer draft");
    expect(f.store.handOffDraft(f.drawer)).toBe(true);
    expect(f.page.presentation.canManageSchema).toBe(false);
    expect(f.page.presentation.permittedActions).toEqual(["readOwn"]);
    expect(f.page.presentation.detailLayout).toEqual(latest.detailLayout);
    expect(f.page.isReadOnly).toBe(true);
    expect(f.page.form.values[f.fieldId]).toBe(dirtyDrawer ? "Drawer draft" : "Saved");
    expect(f.page.hasUnsavedChanges).toBe(dirtyDrawer);
    expect(f.page.record?.version).toBe(1);
    expect(f.page.presentation.model.revision).toBe(1);
    expect(f.store.takeDraftHandoff(f.ref)).toBeNull();
  });

  it("transfers a same-record drawer draft and rebases it onto a newer mounted page", () => {
    const f = editors();
    f.store.registerPageEditor(f.page);
    f.drawer.onChange(`values.${f.fieldId}`, "Drawer draft");
    f.drawer.onChange("assignedUserIds", [f.userStore.user.id]);
    f.drawer.onChange("captureFieldIds", [f.fieldId]);
    const draft = toJS(f.drawer.form);
    f.page.edit(f.context, f.record(2, "Updated elsewhere"));
    expect(f.store.handOffDraft(f.drawer)).toBe(true);
    expect(f.page.record?.version).toBe(2);
    expect(f.page.form.values[f.fieldId]).toBe("Drawer draft");
    expect(f.page.form.assignedUserIds).toEqual(draft.assignedUserIds);
    expect(f.page.form.captureFieldIds).toEqual(draft.captureFieldIds);
    expect(f.page.savedState.values[f.fieldId]).toBe("Updated elsewhere");
    expect(f.page.conflicts).toEqual([f.fieldId]);
    expect(f.page.hasUnsavedChanges).toBe(true);
    expect(f.store.takeDraftHandoff(f.ref)).toBeNull();
    expect(f.drawer.form.values[f.fieldId]).toBe("Drawer draft");
  });

  it("does not regress a mounted page when schema and record revisions are incomparable", () => {
    const f = editors();
    f.store.registerPageEditor(f.page);
    f.page.edit({ ...f.context, model: { ...f.context.model, revision: 2 } }, f.record(1, "Saved"));
    f.drawer.edit(f.context, f.record(2, "Updated"));
    f.drawer.onChange(`values.${f.fieldId}`, "Drawer draft");
    expect(f.store.handOffDraft(f.drawer)).toBe(false);
    expect(f.page.presentation.model.revision).toBe(2);
    expect(f.page.record?.version).toBe(1);
    expect(f.drawer.staleChange).toBe(true);
    expect(f.drawer.form.values[f.fieldId]).toBe("Drawer draft");
    expect(f.store.takeDraftHandoff(f.ref)).toBeNull();
  });

  it.each([false, true])(
    "discards a mounted page draft only after the guard accepts (drawer dirty: %s)",
    (dirtyDrawer) => {
      const f = editors();
      f.store.registerPageEditor(f.page);
      f.page.edit(f.context, f.record(2, "Updated elsewhere"));
      f.page.onChange(`values.${f.fieldId}`, "Page draft");
      if (dirtyDrawer) f.drawer.onChange(`values.${f.fieldId}`, "Drawer draft");
      expect(f.store.handOffDraft(f.drawer)).toBe(false);
      expect(f.page.form.values[f.fieldId]).toBe("Page draft");
      expect(f.store.handOffDraft(f.drawer, true)).toBe(true);
      expect(f.page.record?.version).toBe(2);
      expect(f.page.savedState.values[f.fieldId]).toBe("Updated elsewhere");
      expect(f.page.form.values[f.fieldId]).toBe(dirtyDrawer ? "Drawer draft" : "Updated elsewhere");
      expect(f.page.hasUnsavedChanges).toBe(dirtyDrawer);
      expect(f.store.takeDraftHandoff(f.ref)).toBeNull();
    },
  );

  it("cancels without losing either draft and transfers before closing after confirmed navigation", () => {
    const f = editors();
    const guard = new NavigationGuardController();
    Object.assign(f.root, { navigationGuard: guard });
    guard.register(f.page);
    f.store.registerPageEditor(f.page);
    f.store.setEditor(f.drawer);
    f.page.onChange(`values.${f.fieldId}`, "Page draft");
    f.drawer.onChange(`values.${f.fieldId}`, "Drawer draft");
    const navigate = vi.fn(() => {
      if (!f.store.handOffDraft(f.drawer, true)) return;
      f.drawer.resetForm();
      f.store.close();
    });
    expect(guard.tryNavigate(navigate)).toBe(false);
    expect(f.page.form.values[f.fieldId]).toBe("Page draft");
    expect(f.drawer.isOpen).toBe(true);
    guard.cancel();
    expect(navigate).not.toHaveBeenCalled();
    expect(f.drawer.form.values[f.fieldId]).toBe("Drawer draft");
    expect(guard.tryNavigate(navigate)).toBe(false);
    guard.confirm();
    expect(navigate).toHaveBeenCalledOnce();
    expect(f.drawer.isOpen).toBe(false);
    expect(f.drawer.hasUnsavedChanges).toBe(false);
    expect(f.page.isOpen).toBe(true);
    expect(f.page.hasUnsavedChanges).toBe(true);
    expect(f.page.form.values[f.fieldId]).toBe("Drawer draft");
    expect(f.store.takeDraftHandoff(f.ref)).toBeNull();
  });

  it("preserves busy editors and discards only the accepted page-owned channel draft", () => {
    const f = editors();
    f.store.registerPageEditor(f.page);
    const compose = {
      sourceContextKey: f.page.channelComposeKey,
      isLoading: false,
      hasUnsavedChanges: true,
      discardNewThread: vi.fn(),
    };
    compose.discardNewThread.mockImplementation(() => {
      compose.sourceContextKey = "";
      compose.hasUnsavedChanges = false;
    });
    Object.assign(f.root, { threadComposeStore: compose });
    f.drawer.onChange(`values.${f.fieldId}`, "Drawer draft");
    expect(f.store.handOffDraft(f.drawer)).toBe(false);
    expect(compose.discardNewThread).not.toHaveBeenCalled();
    compose.isLoading = true;
    expect(f.store.handOffDraft(f.drawer, true)).toBe(false);
    compose.isLoading = false;
    f.page.setPendingOperation("pending-save");
    expect(f.store.handOffDraft(f.drawer, true)).toBe(false);
    f.page.setPendingOperation(null);
    f.page.edit({ ...f.context, model: { ...f.context.model, revision: 2 } }, f.record(1, "Saved"));
    compose.sourceContextKey = f.page.channelComposeKey;
    f.drawer.edit(f.context, f.record(2, "Updated"));
    expect(f.store.handOffDraft(f.drawer, true)).toBe(false);
    expect(compose.discardNewThread).not.toHaveBeenCalled();
    f.page.edit(f.context, f.record(1, "Saved"));
    compose.sourceContextKey = f.page.channelComposeKey;
    expect(f.store.handOffDraft(f.drawer, true)).toBe(true);
    expect(compose.discardNewThread).toHaveBeenCalledOnce();
    expect(f.page.record?.version).toBe(2);
  });

  it("ignores old page cleanup and clears direct handoff on account replacement", () => {
    const f = editors();
    const releaseOld = f.store.registerPageEditor(f.page);
    const replacement = new RecordEditorStore(f.root, f.context, async () => {}, true);
    replacement.edit(f.context, f.record(1, "Saved"));
    const releaseNew = f.store.registerPageEditor(replacement);
    releaseOld();
    f.drawer.onChange(`values.${f.fieldId}`, "Drawer draft");
    expect(f.store.handOffDraft(f.drawer)).toBe(true);
    expect(replacement.form.values[f.fieldId]).toBe("Drawer draft");
    expect(f.page.form.values[f.fieldId]).toBe("Saved");
    releaseNew();
    f.store.registerPageEditor(f.page);
    runInAction(() => {
      f.userStore.user = { id: randomUUID(), companyId: f.companyId };
    });
    expect(f.store.handOffDraft(f.drawer)).toBe(true);
    expect(f.page.form.values[f.fieldId]).toBe("Saved");
    expect(f.store.takeDraftHandoff(f.ref)?.form.values[f.fieldId]).toBe("Drawer draft");
  });

  it("hands a dirty drawer draft to the page for the same record exactly once", () => {
    const f = fixture();
    const ref = { typeId: f.context.typeId, recordId: randomUUID() };
    const editor = {
      record: { ref, version: 3 },
      presentation: f.context,
      hasUnsavedChanges: true,
      savedState: { values: { a: "saved" } },
      form: { values: { a: "draft" } },
    } as unknown as RecordEditorStore;
    f.store.handOffDraft(editor);
    expect(f.store.takeDraftHandoff({ ...ref, recordId: randomUUID() })).toBeNull();
    f.store.handOffDraft(editor);
    expect(f.store.takeDraftHandoff(ref)).toMatchObject({
      form: { values: { a: "draft" } },
      record: { version: 3 },
    });
    expect(f.store.takeDraftHandoff(ref)).toBeNull();
    f.store.handOffDraft({
      ...editor,
      hasUnsavedChanges: false,
    } as unknown as RecordEditorStore);
    expect(f.store.takeDraftHandoff(ref)).toBeNull();
  });
});
