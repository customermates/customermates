import { act, createElement, type ReactNode } from "react";
import { action, observable } from "mobx";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordEditorStore } from "../record-editor.store";
import type { RecordRelationship, RecordRef } from "@/features/records/record-model.schema";
import type { RecordChoice, RecordChoicesResult } from "@/features/records/get-record-choices.interactor";

const actions = vi.hoisted(() => ({ choices: vi.fn() }));
vi.mock("../../../actions", () => ({ getRecordChoicesAction: (...args: unknown[]) => actions.choices(...args) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../record-detail-field", () => ({
  RecordDetailField: ({ children }: { children: ReactNode }) => createElement("div", { "data-field": "" }, children),
}));

import { RecordRelationshipEditor } from "../record-relationship-editor";
import { TooltipProvider } from "@/components/ui/tooltip";

const relation: RecordRelationship = {
  id: "10000000-0000-4000-8000-000000000001",
  sourceTypeId: "10000000-0000-4000-8000-000000000002",
  targetTypeId: "10000000-0000-4000-8000-000000000003",
  sourceLabel: "Projects",
  targetLabel: "Organizations",
  sourceCardinality: "many",
  targetCardinality: "many",
  onSourceDelete: "unlink",
  onTargetDelete: "unlink",
  archived: false,
};
const first: RecordRef = { typeId: relation.sourceTypeId, recordId: "10000000-0000-4000-8000-000000000004" };
const second: RecordRef = { typeId: relation.sourceTypeId, recordId: "10000000-0000-4000-8000-000000000005" };
const linked = {
  ref: { typeId: relation.targetTypeId, recordId: "10000000-0000-4000-8000-000000000006" },
  title: { state: "value" as const, value: { kind: "text" as const, value: "Initial project" } },
};
const results = (records: RecordChoice[]): RecordChoicesResult => ({
  records,
  page: 1,
  pageSize: 25,
  total: records.length,
  schemaRevision: 1,
});
function editor(ref = first, summaries: RecordChoice[] = [], isReadOnly = false) {
  return {
    isOpen: true,
    isReadOnly,
    isLoading: false,
    relatedRevision: 0,
    form: { linkChanges: [] },
    record: {
      ref,
      relationships: [
        {
          relationId: relation.id,
          direction: "outgoing",
          records: summaries,
          readableCount: summaries.length,
          hasMore: false,
        },
      ],
    },
    stageLink: vi.fn(),
    presentation: { linkColors: {}, linkIcons: {}, model: { types: [] } },
    rootStore: { recordWorkspaceStore: { open: vi.fn() } },
  } as unknown as RecordEditorStore;
}
let root: Root | undefined;
let host: HTMLDivElement | undefined;
function render(store: RecordEditorStore) {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  act(() =>
    root?.render(
      createElement(
        TooltipProvider,
        null,
        createElement(RecordRelationshipEditor, { store, relationship: relation, direction: "outgoing" }),
      ),
    ),
  );
  return host;
}
beforeEach(() => {
  actions.choices.mockReset();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.unstubAllGlobals();
});

describe("relationship loading presentation and response ownership", () => {
  it("keeps an empty editable loading indicator inside the existing Link control", async () => {
    let finish!: (result: { ok: true; data: RecordChoicesResult }) => void;
    actions.choices.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const field = render(editor());
    const control = field.querySelector<HTMLButtonElement>('[role="combobox"]');
    expect(control?.disabled).toBe(true);
    expect(control?.getAttribute("aria-busy")).toBe("true");
    expect(control?.querySelector('[data-selection-loading="value"]')).not.toBeNull();
    expect(field.querySelector('[role="status"]')?.closest('[role="combobox"]')).toBe(control);
    await act(async () => {
      finish({ ok: true, data: results([]) });
      await Promise.resolve();
    });
    expect(control?.disabled).toBe(false);
    expect(control?.textContent).toBe("RecordModel.linkRecord");
    expect(field.querySelector('[data-selection-loading="value"]')).toBeNull();
  });
  it("uses its initial readable summary only while the first page is loading, then accepts an empty fresh reply", async () => {
    let finish!: (result: { ok: true; data: RecordChoicesResult }) => void;
    actions.choices.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const field = render(editor(first, [linked]));
    expect(field.textContent).toContain("Initial project");
    expect(field.querySelector('[aria-label="RecordModel.unlinkRecord"]')).toBeNull();
    await act(async () => {
      finish({ ok: true, data: results([]) });
      await Promise.resolve();
    });
    expect(field.textContent).not.toContain("Initial project");
    expect(field.querySelector<HTMLButtonElement>('[role="combobox"]')?.disabled).toBe(false);
  });
  it("does not let an old record's late choices replace the current record", async () => {
    const finishes: Array<(result: { ok: true; data: RecordChoicesResult }) => void> = [];
    actions.choices.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishes.push(resolve);
        }),
    );
    const field = render(editor(first, [linked]));
    render(editor(second));
    await act(async () => {
      finishes[1]({ ok: true, data: results([]) });
      await Promise.resolve();
    });
    await act(async () => {
      finishes[0]({ ok: true, data: results([linked]) });
      await Promise.resolve();
    });
    expect(field.textContent).not.toContain("Initial project");
    expect(field.querySelector<HTMLButtonElement>('[role="combobox"]')?.disabled).toBe(false);
  });
  it("does not reuse the first-page summary while loading a later page", async () => {
    let nextPage!: (result: { ok: true; data: RecordChoicesResult }) => void;
    actions.choices.mockResolvedValueOnce({ ok: true, data: { ...results([linked]), total: 26 } });
    actions.choices.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          nextPage = resolve;
        }),
    );
    const field = render(editor(first, [linked]));
    await act(async () => {
      await Promise.resolve();
    });
    const next = Array.from(field.querySelectorAll("button")).find(
      (button) => button.textContent === "Common.table.nextPage",
    );
    expect(next).toBeDefined();
    act(() => next?.click());
    expect(field.textContent).not.toContain("Initial project");
    expect(field.querySelector<HTMLButtonElement>('[role="combobox"]')?.disabled).toBe(true);
    await act(async () => {
      nextPage({ ok: true, data: { ...results([]), page: 2, total: 26 } });
      await Promise.resolve();
    });
    expect(field.textContent).not.toContain("Initial project");
  });
  it("retains restricted title presentation and does not offer writes in a read-only loading preview", async () => {
    let finish!: (result: { ok: true; data: RecordChoicesResult }) => void;
    actions.choices.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const restricted: RecordChoice = { ref: linked.ref, title: { state: "restricted" } };
    const field = render(editor(first, [restricted], true));
    expect(field.textContent).toContain("RecordModel.restricted");
    expect(field.textContent).not.toContain("Initial project");
    expect(field.querySelector('[role="combobox"]')).toBeNull();
    expect(field.querySelector('[aria-label="RecordModel.unlinkRecord"]')).toBeNull();
    await act(async () => {
      finish({ ok: true, data: results([]) });
      await Promise.resolve();
    });
    expect(field.textContent).toBe("—");
  });
});

describe("relationship unlink focus", () => {
  it("moves focus to the next linked record after unlinking, then to the Link control", async () => {
    const other: RecordChoice = {
      ref: { typeId: relation.targetTypeId, recordId: "10000000-0000-4000-8000-000000000007" },
      title: { state: "value", value: { kind: "text", value: "Second project" } },
    };
    actions.choices.mockResolvedValue({ ok: true, data: results([linked, other]) });
    const form = observable({ linkChanges: [] as unknown[] });
    const store = Object.assign(editor(), {
      form,
      stageLink: action((change: object, title: unknown) => {
        form.linkChanges.push({ ...change, title });
      }),
    }) as unknown as RecordEditorStore;
    const field = render(store);
    await act(async () => {
      await Promise.resolve();
    });
    const unlinks = () => [...field.querySelectorAll<HTMLButtonElement>('[aria-label="RecordModel.unlinkRecord"]')];
    expect(unlinks()).toHaveLength(2);
    unlinks()[0].focus();
    act(() => unlinks()[0].click());
    expect(unlinks()).toHaveLength(1);
    expect(document.activeElement).toBe(unlinks()[0]);
    act(() => unlinks()[0].click());
    expect(unlinks()).toHaveLength(0);
    expect(document.activeElement).toBe(field.querySelector('[role="combobox"]'));
  });
});
