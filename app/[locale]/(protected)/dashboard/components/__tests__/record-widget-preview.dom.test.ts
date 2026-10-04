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
        contractVersion: 2,
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

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  mocks.getRecordModelAction.mockResolvedValue(model);
  mocks.previewRecordWidgetAction.mockResolvedValue({
    ok: true,
    data: { schemaRevision: model.revision, groups: [], total: 0 },
  });
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

    runInAction(() => {
      Object.assign(store.form, {
        measure: { ...(store.form as { measure: object }).measure, groupLimit: 10 },
      });
    });
    await wait(300);
    runInAction(() => {
      Object.assign(store.form, {
        measure: { ...(store.form as { measure: object }).measure, groupLimit: 20 },
      });
    });
    await wait(600);
    expect(mocks.previewRecordWidgetAction).toHaveBeenCalledTimes(2);
    expect(mocks.previewRecordWidgetAction.mock.calls[1][0]).toMatchObject({ groupLimit: 20 });
  });

  it("does not preview from editor sections that do not show the preview", async () => {
    await mount(widgetStore(), "data");
    await wait(2000);
    expect(mocks.previewRecordWidgetAction).not.toHaveBeenCalled();
  });
});
