import { randomUUID } from "node:crypto";
import { observable, runInAction } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RootStore } from "../root.store";
import type { RecordNavigation } from "@/features/records/record-navigation.schema";
import { recordNavigationKey } from "@/features/records/record-navigation.schema";
import { createCrmPreset } from "@/features/records/crm-preset";

const mocks = vi.hoisted(() => ({ getRecordEditorAction: vi.fn(), getRecordNavigationAction: vi.fn() }));
vi.mock("@/app/[locale]/(protected)/records/actions", () => mocks);

import { RecordWorkspaceStore } from "../record-workspace.store";

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
  const navigation: RecordNavigation = { companyId, schemaRevision: 1, canManageSchema: true, types: [] };
  const model = createCrmPreset(companyId, "EUR");
  const context = {
    model,
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
    mocks.getRecordNavigationAction.mockResolvedValueOnce({ ...f.navigation, schemaRevision: 2 });
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
    second.resolve({ ...f.navigation, schemaRevision: 4, canManageSchema: false });
    await secondLoad;
    first.resolve({ ...f.navigation, schemaRevision: 4, canManageSchema: true });
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
    second.resolve({ ok: true, data: { ...f.context, typeId: f.context.model.types[1].id } });
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
    expect(recordNavigationKey("/company/data-model")).toBe("company");
  });
});
