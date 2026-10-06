import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { observable, runInAction, toJS } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordDto } from "@/features/records/record-model.schema";
import type { RecordEditorContext, RecordEditorResult } from "@/features/records/get-record-editor.interactor";
import type {
  RecordDetailLayoutResult,
  SaveRecordDetailLayoutInput,
} from "@/features/records/record-detail-layout.schema";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { NavigationGuardController } from "@/core/stores/navigation-guard.controller";
import { RecordDetailLayoutStore } from "@/core/stores/record-detail-layout.store";

const mocks = vi.hoisted(() => ({
  mutateRecordAction: vi.fn(),
  getRecordEditorAction: vi.fn(),
  readRecordDetailLayoutAction: vi.fn(),
  saveRecordDetailLayoutAction: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@/app/[locale]/(protected)/records/actions", () => mocks);
vi.mock("@/app/actions", () => ({}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
vi.mock("@/core/errors/sentry-client", () => ({ captureError: mocks.report }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/app/components/agent-chat/record-ai-action", () => ({
  RecordAiAction: () => createElement("button", { type: "button" }, "Ask AI"),
}));

import { RecordEditorStore } from "../record-editor.store";
import { RecordDetailPersonalization } from "../record-detail-personalization";
import { RecordPageActions } from "../record-editor-actions";
import { TopBarActionsProvider, useTopBarActions } from "@/app/components/topbar-actions-context";

const views = new Set<Root>();
const layouts = new Set<RecordDetailLayoutStore>();
const editors = new Set<RecordEditorStore>();
const companyId = "10000000-0000-4000-8000-000000000001";
const typeId = presetId(companyId, "organization");
const nameId = presetId(companyId, "organization.name");

function Toolbar() {
  const { actions } = useTopBarActions();
  return createElement("header", null, actions);
}

function harness(readOnly = false) {
  const initial: RecordDetailLayoutResult = {
    typeId,
    schemaRevision: 1,
    hasPersonalization: true,
    layout: { pinnedFields: [nameId], hiddenFields: ["system:updatedAt"], fieldOrder: [nameId] },
    fields: [
      { id: nameId, label: "Name" },
      { id: "system:updatedAt", label: "Updated at" },
    ],
  };
  const layout = new RecordDetailLayoutStore(initial);
  layouts.add(layout);
  const navigationGuard = new NavigationGuardController();
  let composeGeneration = 0;
  const compose = observable(
    {
      sourceContextKey: null as string | null,
      hasUnsavedChanges: false,
      isLoading: false,
      withUnsavedChangesGuard: true,
      captureContext: () => {
        const captured = composeGeneration;
        return () => captured === composeGeneration;
      },
      discardNewThread: vi.fn(() => {
        runInAction(() => {
          composeGeneration += 1;
          compose.hasUnsavedChanges = false;
          compose.sourceContextKey = null;
        });
      }),
    },
    { captureContext: false, discardNewThread: false },
  );
  navigationGuard.register(compose);
  const root = {
    userStore: { user: { id: "actor" } },
    recordWorkspaceStore: { getDetailLayout: () => layout },
    navigationGuard,
    threadComposeStore: compose,
  } as unknown as RootStore;
  const context: RecordEditorContext = {
    model: createCrmPreset(companyId),
    typeId,
    permittedActions: readOnly ? ["readAll"] : ["readAll", "update", "delete"],
    canManageSchema: false,
    detailLayout: initial,
  };
  const record: RecordDto = {
    ref: { typeId, recordId: "10000000-0000-4000-8000-000000000002" },
    version: 1,
    schemaRevision: 1,
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    fields: [{ fieldId: nameId, result: { state: "value", value: { kind: "text", value: "Saved name" } } }],
    assignedUserIds: [],
    assignedUsers: [],
    relationships: [],
  };
  const editor = new RecordEditorStore(root, context, () => Promise.resolve(), true);
  editors.add(editor);
  editor.edit(context, record);
  const latest: RecordEditorResult = {
    ...context,
    record: {
      ...record,
      version: 2,
      fields: [{ fieldId: nameId, result: { state: "value", value: { kind: "text", value: "Draft name" } } }],
    },
  };
  mocks.getRecordEditorAction.mockResolvedValue({ ok: true, data: latest });
  mocks.mutateRecordAction.mockResolvedValue({ ok: true, data: { status: "completed" } });
  mocks.readRecordDetailLayoutAction.mockResolvedValue({ ok: true, data: initial });
  mocks.saveRecordDetailLayoutAction.mockImplementation((input: SaveRecordDetailLayoutInput) =>
    Promise.resolve({
      ok: true,
      data: { ...initial, hasPersonalization: input.layout !== null, layout: input.layout ?? initial.layout },
    }),
  );
  const container = document.createElement("div");
  document.body.append(container);
  const view = createRoot(container);
  views.add(view);
  act(() =>
    view.render(
      createElement(
        TopBarActionsProvider,
        null,
        createElement(Toolbar),
        createElement(
          RecordDetailPersonalization,
          { store: editor },
          createElement(RecordPageActions, {
            store: editor,
            formId: "record-form",
            name: "Saved name",
            deletion: { isPreviewing: false, requestDeletion: vi.fn(), requestMany: vi.fn() },
          }),
        ),
      ),
    ),
  );
  const button = (label: string) => {
    const found =
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
        (control) => (control.getAttribute("aria-label") ?? control.textContent?.trim()) === label,
      ) ?? null;
    expect(found).not.toBeNull();
    if (!found) throw new Error(`Missing control: ${label}`);
    return found;
  };
  return { editor, layout, compose, navigationGuard, latest, button, container };
}

beforeEach(() => {
  vi.resetAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  for (const view of views) act(() => view.unmount());
  views.clear();
  for (const layout of layouts) layout.dispose();
  layouts.clear();
  for (const editor of editors) editor.close();
  editors.clear();
  document.body.innerHTML = "";
});

describe("record detail personalization transaction controls", () => {
  it("keeps Customize disabled through a deferred save and the following record refresh", async () => {
    const h = harness();
    const mutation = Promise.withResolvers<{ ok: true; data: { status: "completed" } }>();
    const refresh = Promise.withResolvers<{ ok: true; data: RecordEditorResult }>();
    mocks.mutateRecordAction.mockReturnValueOnce(mutation.promise);
    mocks.getRecordEditorAction.mockReturnValueOnce(refresh.promise);
    let pending: Promise<void> | undefined;
    act(() => {
      h.editor.onChange(`values.${nameId}`, "Draft name");
      pending = h.editor.onSubmit();
    });
    expect(h.button("Common.actions.reset").disabled).toBe(true);
    expect(h.button("EntityDetail.personalize").disabled).toBe(true);
    act(() => h.button("EntityDetail.personalize").click());
    expect(h.container.querySelector('[aria-label="RecordModel.resetDetailLayout"]')).toBeNull();
    expect(h.editor.form.values[nameId]).toBe("Draft name");
    await act(async () => {
      mutation.resolve({ ok: true, data: { status: "completed" } });
      await Promise.resolve();
    });
    expect(mocks.getRecordEditorAction).toHaveBeenCalledOnce();
    expect(h.editor.isLoading).toBe(false);
    expect(h.editor.refreshRequired).toBe(true);
    expect(h.container.querySelector('[aria-label="Common.actions.reset"]')).toBeNull();
    expect(h.container.querySelector('[aria-label="Common.actions.save"]')).toBeNull();
    expect(h.button("EntityDetail.personalize").disabled).toBe(true);
    act(() => h.button("EntityDetail.personalize").click());
    expect(h.container.querySelector('[aria-label="RecordModel.resetDetailLayout"]')).toBeNull();
    await act(async () => {
      refresh.resolve({ ok: true, data: h.latest });
      await pending;
    });
    expect(h.editor.refreshRequired).toBe(false);
    expect(h.button("EntityDetail.personalize").disabled).toBe(false);
    act(() => h.button("EntityDetail.personalize").click());
    expect(h.button("EntityDetail.donePersonalizing").getAttribute("aria-pressed")).toBe("true");
    expect(h.button("RecordModel.resetDetailLayout").disabled).toBe(false);
    expect(h.editor.form.values[nameId]).toBe("Draft name");
    expect(mocks.saveRecordDetailLayoutAction).not.toHaveBeenCalled();
  });

  it("keeps Customize disabled for a background operation and a failed refresh until record recovery", async () => {
    const h = harness();
    mocks.mutateRecordAction.mockResolvedValueOnce({ ok: true, data: { status: "pending", operationId: "operation" } });
    await act(async () => {
      h.editor.onChange(`values.${nameId}`, "Draft name");
      await h.editor.onSubmit();
    });
    expect(h.editor.isLoading).toBe(false);
    expect(h.editor.pendingOperationId).toBe("operation");
    expect(h.button("EntityDetail.personalize").disabled).toBe(true);
    act(() => h.button("EntityDetail.personalize").click());
    expect(h.container.querySelector('[aria-label="RecordModel.resetDetailLayout"]')).toBeNull();
    mocks.getRecordEditorAction.mockResolvedValueOnce({ ok: false, error: { errors: ["Read unavailable"] } });
    await act(async () => h.editor.operationCompleted());
    expect(h.editor.pendingOperationId).toBeNull();
    expect(h.editor.refreshRequired).toBe(true);
    expect(h.button("EntityDetail.personalize").disabled).toBe(true);
    expect(h.editor.form.values[nameId]).toBe("Draft name");
    await act(async () => h.editor.refreshRecord());
    expect(h.editor.refreshRequired).toBe(false);
    expect(h.button("EntityDetail.personalize").disabled).toBe(false);
    act(() => h.button("EntityDetail.personalize").click());
    expect(h.button("RecordModel.resetDetailLayout").disabled).toBe(false);
    expect(mocks.mutateRecordAction).toHaveBeenCalledOnce();
  });

  it("blocks Done, layout reset, retry and discard during record barriers and retains layout recovery", async () => {
    const h = harness();
    act(() => h.button("EntityDetail.personalize").click());
    const failure = new Error("Layout response lost");
    mocks.saveRecordDetailLayoutAction.mockRejectedValueOnce(failure);
    await act(async () => {
      h.layout.togglePinned("system:updatedAt");
      await h.layout.flush();
    });
    expect(h.layout.saveFailed).toBe(true);
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith(failure);
    const pendingLayout = toJS(h.layout.layout);
    for (const barrier of ["loading", "operation", "refresh"] as const) {
      act(() => {
        h.editor.setIsLoading(barrier === "loading");
        h.editor.setPendingOperation(barrier === "operation" ? "operation" : null);
        h.editor.setRefreshRequired(barrier === "refresh");
      });
      for (const label of [
        "EntityDetail.donePersonalizing",
        "RecordModel.resetDetailLayout",
        "ErrorCard.retry",
        "Common.actions.discard",
      ]) {
        expect(h.button(label).disabled).toBe(true);
        act(() => h.button(label).click());
      }
      expect(h.layout.saveFailed).toBe(true);
      expect(toJS(h.layout.layout)).toEqual(pendingLayout);
      expect(mocks.saveRecordDetailLayoutAction).toHaveBeenCalledOnce();
    }
    act(() => h.editor.setRefreshRequired(false));
    expect(h.button("ErrorCard.retry").disabled).toBe(false);
    await act(async () => {
      h.button("ErrorCard.retry").click();
      expect(mocks.saveRecordDetailLayoutAction).toHaveBeenCalledTimes(2);
      await h.layout.flush();
    });
    expect(h.layout.saveFailed).toBe(false);
    expect(h.layout.dirty).toBe(false);
    expect(toJS(h.layout.layout)).toEqual(pendingLayout);
    expect(mocks.saveRecordDetailLayoutAction).toHaveBeenCalledTimes(2);
    expect(h.button("EntityDetail.donePersonalizing").disabled).toBe(false);
  });

  it.each(["dirty", "read-only"] as const)("keeps personalization available for a %s record", (mode) => {
    const h = harness(mode === "read-only");
    if (mode === "dirty") act(() => h.editor.onChange(`values.${nameId}`, "Draft name"));
    const before = toJS(h.editor.form);
    expect(h.editor.hasUnsavedChanges).toBe(mode === "dirty");
    expect(h.editor.isReadOnly).toBe(mode === "read-only");
    expect(h.button("EntityDetail.personalize").disabled).toBe(false);
    act(() => h.button("EntityDetail.personalize").click());
    expect(h.button("RecordModel.resetDetailLayout").disabled).toBe(false);
    act(() => h.button("EntityDetail.donePersonalizing").click());
    expect(h.button("EntityDetail.personalize").getAttribute("aria-pressed")).toBe("false");
    expect(toJS(h.editor.form)).toEqual(before);
    expect(mocks.mutateRecordAction).not.toHaveBeenCalled();
    expect(mocks.saveRecordDetailLayoutAction).not.toHaveBeenCalled();
  });

  it("still guards an owned channel draft before enabling personalization outside record transactions", () => {
    const h = harness();
    act(() => {
      h.editor.onChange(`values.${nameId}`, "Draft name");
      runInAction(() => {
        h.compose.sourceContextKey = h.editor.channelComposeKey;
        h.compose.hasUnsavedChanges = true;
      });
    });
    expect(h.button("EntityDetail.personalize").disabled).toBe(false);
    act(() => h.button("EntityDetail.personalize").click());
    expect(h.navigationGuard.isPending).toBe(true);
    expect(h.compose.discardNewThread).not.toHaveBeenCalled();
    expect(h.container.querySelector('[aria-label="RecordModel.resetDetailLayout"]')).toBeNull();
    act(() => h.navigationGuard.cancel());
    expect(h.compose.hasUnsavedChanges).toBe(true);
    act(() => h.button("EntityDetail.personalize").click());
    act(() => h.navigationGuard.confirm());
    expect(h.compose.discardNewThread).toHaveBeenCalledOnce();
    expect(h.button("EntityDetail.donePersonalizing").getAttribute("aria-pressed")).toBe("true");
    expect(h.editor.form.values[nameId]).toBe("Draft name");
    expect(h.editor.hasUnsavedChanges).toBe(true);
    expect(mocks.saveRecordDetailLayoutAction).not.toHaveBeenCalled();
  });
});
