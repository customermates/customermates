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
vi.mock("@/components/forms/form-context", () => ({ useAppForm: () => null }));
vi.mock("@/components/records/record-query-filters", () => ({ RecordQueryFilters: () => null }));
vi.mock("../record-widget-chart", () => ({ RecordWidgetChart: () => createElement("div", { "data-chart": "" }) }));
vi.mock("../record-widget-filters", () => ({ widgetRelationshipChoices: () => [] }));

import { RecordWidgetEditor } from "../record-widget-editor";

const model = createCrmPreset("6487f9fb-7b10-439a-b783-9d3da8184b14");
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
function setGroupLimit(store: WidgetModalStore, groupLimit: number) {
  act(() =>
    runInAction(() => {
      Object.assign(store.form, { measure: { ...(store.form as { measure: object }).measure, groupLimit } });
    }),
  );
}
async function retryPreview() {
  const button = [...container.querySelectorAll<HTMLButtonElement>("[data-preview-error] button")].find(
    (candidate) => candidate.textContent === "ErrorCard.retry",
  );
  if (!button) throw new Error("Expected the inline preview retry");
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

  it("offers no manual preview control", async () => {
    await mount(widgetStore(), "preview");
    await wait(600);
    expect(container.querySelector('button[aria-label="RecordWidgets.preview"]')).toBeNull();
    expect(container.querySelector("[data-preview-error]")).toBeNull();
  });

  it("shows a failed automatic preview inside the preview and retries it from there", async () => {
    mocks.previewRecordWidgetAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await mount(widgetStore(), "preview");
    await wait(600);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-preview-error] [role="alert"]')?.textContent).toBe(
      "RecordWidgets.previewFailed",
    );
    expect(container.querySelector("[data-chart]")).toBeNull();
    await wait(1200);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledOnce();

    await retryPreview();
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-preview-error]")).toBeNull();
    expect(container.querySelector("[data-chart]")).not.toBeNull();
  });

  it("automatically previews a changed measure after a failure and the original measure when selected again", async () => {
    mocks.previewRecordWidgetAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const store = widgetStore();
    await mount(store, "preview");
    await wait(600);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("RecordWidgets.previewFailed");
    setGroupLimit(store, 20);
    await wait(599);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledOnce();
    await wait(1);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(2);
    expect(mocks.previewRecordWidgetAction.mock.calls[1][0]).toMatchObject({ groupLimit: 20 });
    expect(container.querySelector("[data-chart]")).not.toBeNull();
    setGroupLimit(store, 100);
    await wait(600);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(3);
    expect(mocks.previewRecordWidgetAction.mock.calls[2][0]).toMatchObject({ groupLimit: 100 });
  });

  it("automatically previews the refreshed schema after a preview reports a newer revision", async () => {
    const revision = model.revision + 1;
    mocks.getRecordModelAction.mockResolvedValueOnce(model).mockResolvedValue({ ...model, revision });
    mocks.previewRecordWidgetAction.mockResolvedValue(readyPreview(revision));
    await mount(widgetStore(), "preview");
    await wait(600);
    expect(mocks.getRecordModelAction).toHaveBeenCalledTimes(2);
    await wait(600);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-chart]")).not.toBeNull();
  });

  it("keeps the previous render, marked stale, until the next preview arrives", async () => {
    const store = widgetStore();
    await mount(store, "preview");
    await wait(600);
    expect(container.querySelector('[data-preview-current="true"] [data-chart]')).not.toBeNull();
    let resolve: (value: ReturnType<typeof readyPreview>) => void = () => {
      throw new Error("Expected the second preview request");
    };
    mocks.previewRecordWidgetAction.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    setGroupLimit(store, 20);
    await wait(600);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-preview-current="false"] [data-chart]')).not.toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => {
      resolve(readyPreview());
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(container.querySelector('[data-preview-current="true"] [data-chart]')).not.toBeNull();
  });

  it("previews a reopened widget and ignores the previous request's failure", async () => {
    let reject: (error: Error) => void = (_error) => {
      throw new Error("Expected the previous preview request");
    };
    mocks.previewRecordWidgetAction.mockReturnValueOnce(
      new Promise<ReturnType<typeof readyPreview>>((_, fail) => {
        reject = fail;
      }),
    );
    const store = widgetStore();
    await mount(store, "preview");
    await wait(600);
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
