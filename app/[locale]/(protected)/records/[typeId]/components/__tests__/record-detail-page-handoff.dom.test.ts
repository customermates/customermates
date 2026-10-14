import { act, createElement, StrictMode, Suspense, use, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordDto } from "@/features/records/record-model.schema";
import type { RecordEditorResult } from "@/features/records/get-record-editor.interactor";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";

const mocks = vi.hoisted(() => ({
  getRecordEditorAction: vi.fn(),
  getRecordNavigationAction: vi.fn(),
  mutateRecordAction: vi.fn(),
}));
const rootHolder = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/app/[locale]/(protected)/records/actions", () => mocks);
vi.mock("@/app/actions", () => ({}));
vi.mock("@/core/utils/background-task.service", () => ({}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => rootHolder.current }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/records/use-record-route-ready", () => ({ useRecordRouteReady: () => undefined }));
vi.mock("../record-trash-banner", () => ({ RecordTrashBanner: () => null }));
vi.mock("../record-editor", () => ({ RecordEditor: () => null }));
vi.mock("../record-editor-content", async () => {
  const { observer } = await import("mobx-react-lite");
  const { createElement } = await import("react");
  const { presetId } = await import("@/features/records/crm-preset");
  return {
    RecordEditorContent: observer(function RecordEditorContent({
      store,
    }: {
      store: { form: { values: Record<string, unknown> } };
    }) {
      const nameId = presetId("10000000-0000-4000-8000-000000000001", "organization.name");
      return createElement("output", null, String(store.form.values[nameId] ?? ""));
    }),
  };
});

import { RecordWorkspaceStore } from "@/core/stores/record-workspace.store";
import { RecordEditorStore } from "../record-editor.store";
import { RecordDetailPage } from "../record-detail-page";

const companyId = "10000000-0000-4000-8000-000000000001";
const typeId = presetId(companyId, "organization");
const nameId = presetId(companyId, "organization.name");
const views = new Set<Root>();

function record(recordId: string, name: string): RecordDto {
  return {
    ref: { typeId, recordId },
    version: 1,
    schemaRevision: 1,
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    fields: [{ fieldId: nameId, result: { state: "value", value: { kind: "text", value: name } } }],
    assignedUserIds: [],
    assignedUsers: [],
    memberUsers: [],
    relationships: [],
  };
}

function harness() {
  const userStore = observable({ user: { id: "actor", companyId } });
  const root = {
    userStore,
    registerModalStore: vi.fn(),
    unregisterModalStore: vi.fn(),
    navigationGuard: { tryNavigate: vi.fn((work: () => void) => work()), register: vi.fn(), unregister: vi.fn() },
    layoutStore: { setRuntimeIdentity: vi.fn(), clearRuntimeIdentity: vi.fn() },
  } as unknown as RootStore & { recordWorkspaceStore: RecordWorkspaceStore };
  root.recordWorkspaceStore = new RecordWorkspaceStore(root);
  rootHolder.current = root;
  const initial = (recordId: string): RecordEditorResult => ({
    model: createCrmPreset(companyId),
    linkColors: {},
    linkIcons: {},
    linkLabels: {},
    typeId,
    permittedActions: ["readAll", "update"],
    canManageSchema: false,
    record: record(recordId, "Saved name"),
  });
  const page = initial("10000000-0000-4000-8000-000000000002");
  const handOffFromDrawer = (draft: string, result = page) => {
    const drawer = new RecordEditorStore(root, result, () => Promise.resolve());
    drawer.edit(result, result.record);
    drawer.onChange(`values.${nameId}`, draft);
    expect(root.recordWorkspaceStore.handOffDraft(drawer, true)).toBe(true);
    drawer.resetForm();
    drawer.close();
    root.recordWorkspaceStore.close();
  };
  const container = document.createElement("div");
  document.body.append(container);
  const view = createRoot(container);
  views.add(view);
  const render = (node: ReactNode) =>
    act(async () => {
      view.render(node);
      await Promise.resolve();
    });
  const queued = () => root.recordWorkspaceStore.peekDraftHandoff(page.record?.ref).queued;
  return { root, userStore, page, initial, handOffFromDrawer, container, render, queued };
}

function Pending({ promise }: { promise: Promise<null> }) {
  use(promise);
  return null;
}

beforeEach(() => {
  vi.resetAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  for (const view of views) act(() => view.unmount());
  views.clear();
  document.body.innerHTML = "";
});

describe("record page draft handoff", () => {
  it("restores the drawer draft after an abandoned suspended first mount", async () => {
    const h = harness();
    h.handOffFromDrawer("Drawer draft");
    const never = new Promise<null>(() => undefined);
    await h.render(
      createElement(
        Suspense,
        { fallback: createElement("p", null, "Loading") },
        createElement(RecordDetailPage, { initial: h.page }),
        createElement(Pending, { promise: never }),
      ),
    );
    expect(h.container.textContent).toBe("Loading");
    expect(h.queued()).not.toBeNull();
    await h.render(null);
    await h.render(createElement(RecordDetailPage, { initial: h.page }));
    expect(h.container.textContent).toBe("Drawer draft");
    expect(h.queued()).toBeNull();
  });

  it.each([false, true])("restores the draft once on a normal mount (StrictMode: %s)", async (strict) => {
    const h = harness();
    h.handOffFromDrawer("Drawer draft");
    const page = createElement(RecordDetailPage, { initial: h.page });
    await h.render(strict ? createElement(StrictMode, null, page) : page);
    expect(h.container.textContent).toBe("Drawer draft");
    expect(h.queued()).toBeNull();
    await h.render(null);
    await h.render(createElement(RecordDetailPage, { initial: h.page }));
    expect(h.container.textContent).toBe("Saved name");
  });

  it("does not restore a draft queued for another record", async () => {
    const h = harness();
    h.handOffFromDrawer("Other draft", h.initial("10000000-0000-4000-8000-000000000003"));
    await h.render(createElement(RecordDetailPage, { initial: h.page }));
    expect(h.container.textContent).toBe("Saved name");
  });

  it("restores a replacement draft queued while the first mount was suspended", async () => {
    const h = harness();
    h.handOffFromDrawer("First draft");
    const gate = Promise.withResolvers<null>();
    await h.render(
      createElement(
        Suspense,
        { fallback: createElement("p", null, "Loading") },
        createElement(RecordDetailPage, { initial: h.page }),
        createElement(Pending, { promise: gate.promise }),
      ),
    );
    h.handOffFromDrawer("Replacement draft");
    await act(async () => {
      gate.resolve(null);
      await gate.promise;
    });
    expect(h.container.textContent).toBe("Replacement draft");
    expect(h.queued()).toBeNull();
  });

  it("does not restore a draft queued by the previous actor", async () => {
    const h = harness();
    h.handOffFromDrawer("Drawer draft");
    runInAction(() => {
      h.userStore.user = { id: "next-actor", companyId };
    });
    await h.render(createElement(RecordDetailPage, { initial: h.page }));
    expect(h.container.textContent).toBe("Saved name");
  });

  it("applies a newer server result once and keeps an unsaved draft against it", async () => {
    const h = harness();
    await h.render(createElement(RecordDetailPage, { initial: h.page }));
    const store = h.root.recordWorkspaceStore.activeEditor;
    expect(store?.record?.version).toBe(1);
    await h.render(createElement(RecordDetailPage, { initial: h.page }));
    expect(store?.staleChange).toBe(false);
    const latest = (version: number, name: string): RecordEditorResult => ({
      ...h.page,
      record: { ...record(h.page.record?.ref.recordId ?? "", name), version },
    });
    await h.render(createElement(RecordDetailPage, { initial: latest(2, "Server name") }));
    expect(h.container.textContent).toBe("Server name");
    expect(store?.record?.version).toBe(2);
    act(() => store?.onChange(`values.${nameId}`, "Page draft"));
    await h.render(createElement(RecordDetailPage, { initial: latest(3, "Newer name") }));
    expect(h.container.textContent).toBe("Page draft");
    expect(store?.record?.version).toBe(2);
    expect(store?.staleChange).toBe(true);
  });
});
