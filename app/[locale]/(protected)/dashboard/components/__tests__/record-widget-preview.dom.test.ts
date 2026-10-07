import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetModalStore } from "../widget-modal.store";
import { createCrmPreset } from "@/features/records/crm-preset";

const mocks = vi.hoisted(() => ({
  getRecordModelAction: vi.fn(),
  previewRecordWidgetAction: vi.fn(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/app/components/agent-chat/record-ai-action", () => ({ RecordAiAction: () => null }));
vi.mock("../../../records/actions", () => ({ getRecordModelAction: mocks.getRecordModelAction }));
vi.mock("../../actions", () => ({
  previewRecordWidgetAction: mocks.previewRecordWidgetAction,
  discoverWidgetRecordTypesAction: vi.fn(),
}));
vi.mock("@/components/forms/form-autocomplete", () => ({ FormAutocomplete: () => null }));
vi.mock("@/components/forms/form-autocomplete-item", () => ({ FormAutocompleteItem: () => null }));
vi.mock("@/components/forms/form-input", () => ({ FormInput: () => null }));
vi.mock("@/components/forms/form-select", () => ({ FormSelect: () => null }));
vi.mock("@/components/editor-tabs/editor-tabs", () => ({
  EditorTabs: ({ tabs }: { tabs: Array<{ id: string; content: unknown }> }) =>
    createElement(
      "div",
      null,
      tabs.map((tab) => createElement("div", { key: tab.id }, tab.content as never)),
    ),
}));
vi.mock("../record-widget-chart", () => ({ RecordWidgetChart: () => createElement("div", { "data-chart": "" }) }));
vi.mock("../record-widget-filters", () => ({
  RecordWidgetFieldFilters: () => null,
  RecordWidgetRelatedFilters: () => null,
  widgetRelationshipChoices: () => [],
}));

import { RecordWidgetEditor } from "../record-widget-editor";

const model = createCrmPreset("6487f9fb-7b10-439a-b783-9d3da8184b14", "EUR");
let root: Root;
let container: HTMLElement;

function widgetStore() {
  return observable(
    {
      isOpen: true,
      hasUnsavedChanges: false,
      form: {
        kind: "chart",
        name: "Deals",
        expectedRevision: model.revision,
        displayOptions: {},
        measure: {
          source: { typeId: model.types[0].id, filters: [], relationships: [] },
          aggregation: "count",
          valueFieldId: null,
          groupBy: null,
          groupLimit: 100,
        },
      },
      runPreview: <T>(run: () => Promise<T>) => run(),
      onChange: vi.fn(),
    },
    { runPreview: false, onChange: false },
  ) as unknown as WidgetModalStore;
}

async function mount(store: WidgetModalStore, section: "preview" | "data") {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(RecordWidgetEditor, { store, section }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function readyPreview(revision = model.revision) {
  return { ok: true, data: { result: { schemaRevision: revision, groups: [], total: 0 }, groupOptions: [] } };
}
async function requestPreview() {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="RecordWidgets.preview"]');
  if (!button) throw new Error("Expected the preview control");
  expect(button.disabled).toBe(false);
  await act(async () => {
    button.click();
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  vi.useFakeTimers();
  mocks.getRecordModelAction.mockResolvedValue(model);
  mocks.previewRecordWidgetAction.mockResolvedValue(readyPreview());
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("record widget preview", () => {
  it("refreshes the preview after the measure settles without a manual click", async () => {
    const store = widgetStore();
    await mount(store, "preview");
    await wait(599);
    expect(mocks.previewRecordWidgetAction).not.toHaveBeenCalled();
    await wait(1);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-chart]")).not.toBeNull();
    expect(store.onChange).not.toHaveBeenCalled();

    act(() =>
      runInAction(() => {
        Object.assign(store.form, {
          measure: { ...(store.form as { measure: object }).measure, groupLimit: 10 },
        });
      }),
    );
    await wait(300);
    act(() =>
      runInAction(() => {
        Object.assign(store.form, {
          measure: { ...(store.form as { measure: object }).measure, groupLimit: 20 },
        });
      }),
    );
    await wait(600);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(2);
    expect(mocks.previewRecordWidgetAction.mock.calls[1][0]).toMatchObject({ groupLimit: 20 });
  });

  it("does not preview from editor sections that do not show the preview", async () => {
    await mount(widgetStore(), "data");
    await wait(2000);
    expect(mocks.previewRecordWidgetAction).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "preserves a failed manual preview when queued auto preview reaches its deadline (pending=%s)",
    async (pending) => {
      let reject: (error: Error) => void = (_error) => {
        throw new Error("Expected the manual preview request");
      };
      const failure = new TypeError("Failed to fetch");
      const manual = new Promise<ReturnType<typeof readyPreview>>((_, fail) => {
        reject = fail;
      });
      mocks.previewRecordWidgetAction.mockReturnValueOnce(manual);
      await mount(widgetStore(), "preview");
      await wait(300);
      await requestPreview();
      if (pending) await wait(300);
      await act(async () => {
        reject(failure);
        await vi.advanceTimersByTimeAsync(0);
      });
      await wait(pending ? 1 : 300);
      expect(mocks.previewRecordWidgetAction).toHaveBeenCalledOnce();
      expect(container.querySelector('[role="alert"]')?.textContent).toBe("RecordWidgets.previewFailed");
      expect(container.querySelector("[data-chart]")).toBeNull();
      await wait(1200);
      expect(mocks.previewRecordWidgetAction).toHaveBeenCalledOnce();
      expect(container.querySelector('[role="alert"]')?.textContent).toBe("RecordWidgets.previewFailed");

      await requestPreview();
      expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(2);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.querySelector("[data-chart]")).not.toBeNull();
    },
  );

  it("automatically previews a changed measure after manual failure and previews the original measure when selected again", async () => {
    mocks.previewRecordWidgetAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const store = widgetStore();
    await mount(store, "preview");
    await wait(300);
    await requestPreview();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("RecordWidgets.previewFailed");
    act(() =>
      runInAction(() => {
        Object.assign(store.form, { measure: { ...(store.form as { measure: object }).measure, groupLimit: 20 } });
      }),
    );
    await wait(599);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledOnce();
    await wait(1);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(2);
    expect(mocks.previewRecordWidgetAction.mock.calls[1][0]).toMatchObject({ groupLimit: 20 });
    expect(container.querySelector("[data-chart]")).not.toBeNull();
    act(() =>
      runInAction(() => {
        Object.assign(store.form, { measure: { ...(store.form as { measure: object }).measure, groupLimit: 100 } });
      }),
    );
    await wait(600);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(3);
    expect(mocks.previewRecordWidgetAction.mock.calls[2][0]).toMatchObject({ groupLimit: 100 });
  });

  it("automatically previews the refreshed schema after an explicit preview reports a newer revision", async () => {
    const revision = model.revision + 1;
    mocks.getRecordModelAction.mockResolvedValueOnce(model).mockResolvedValue({ ...model, revision });
    mocks.previewRecordWidgetAction.mockResolvedValue(readyPreview(revision));
    await mount(widgetStore(), "preview");
    await wait(300);
    await requestPreview();
    expect(mocks.getRecordModelAction).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-chart]")).toBeNull();
    await wait(600);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-chart]")).not.toBeNull();
  });

  it("releases manual preview ownership when a different form has the same measure", async () => {
    mocks.previewRecordWidgetAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const store = widgetStore();
    await mount(store, "preview");
    await wait(300);
    await requestPreview();
    act(() =>
      runInAction(() => {
        store.form = { ...store.form, name: "A different widget form" };
      }),
    );
    await wait(300);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("[data-chart]")).not.toBeNull();
  });

  it("automatically previews a different same-measure form after the debounce has already settled", async () => {
    mocks.previewRecordWidgetAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const store = widgetStore();
    await mount(store, "preview");
    await wait(300);
    await requestPreview();
    await wait(900);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("RecordWidgets.previewFailed");
    act(() =>
      runInAction(() => {
        store.form = { ...store.form, name: "A different settled widget form" };
      }),
    );
    await wait(0);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("[data-chart]")).not.toBeNull();
  });

  it("previews a reopened widget and ignores the previous manual request's failure", async () => {
    let reject: (error: Error) => void = (_error) => {
      throw new Error("Expected the previous manual preview request");
    };
    mocks.previewRecordWidgetAction.mockReturnValueOnce(
      new Promise<ReturnType<typeof readyPreview>>((_, fail) => {
        reject = fail;
      }),
    );
    const store = widgetStore();
    await mount(store, "preview");
    await wait(300);
    await requestPreview();
    act(() =>
      runInAction(() => {
        store.isOpen = false;
      }),
    );
    await wait(0);
    act(() =>
      runInAction(() => {
        store.isOpen = true;
      }),
    );
    await wait(0);
    await act(async () => {
      reject(new TypeError("Failed to fetch"));
      await vi.advanceTimersByTimeAsync(0);
    });
    await wait(600);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("[data-chart]")).not.toBeNull();
  });
});
