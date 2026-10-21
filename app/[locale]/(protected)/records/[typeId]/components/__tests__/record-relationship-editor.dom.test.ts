import { act, createElement, type ReactNode } from "react";
import { action, observable } from "mobx";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordEditorStore } from "../record-editor.store";
import type { RecordRelationship, RecordRef } from "@/features/records/record-model.schema";
import type { RecordChoice, RecordChoicesResult } from "@/features/records/get-record-choices.interactor";

vi.mock("@/components/shared/use-navigate-to-href", () => ({ useNavigateToHref: () => vi.fn() }));

const actions = vi.hoisted(() => ({ choices: vi.fn() }));
vi.mock("../../../actions", () => ({ getRecordChoicesAction: (...args: unknown[]) => actions.choices(...args) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    key === "RecordModel.moreRecords" ? `+${values?.count} more` : key,
}));
vi.mock("@/components/entity-detail/entity-detail-field-shell", () => ({
  EntityDetailFieldShell: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-field": "" }, children),
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
  messagesOnSource: false,
  messagesOnTarget: false,
  archived: false,
};
const first: RecordRef = { typeId: relation.sourceTypeId, recordId: "10000000-0000-4000-8000-000000000004" };
const second: RecordRef = { typeId: relation.sourceTypeId, recordId: "10000000-0000-4000-8000-000000000005" };
const linked = {
  ref: { typeId: relation.targetTypeId, recordId: "10000000-0000-4000-8000-000000000006" },
  title: { state: "value" as const, value: { kind: "text" as const, value: "Initial project" } },
};
const results = (records: RecordChoice[]): RecordChoicesResult => ({
  typeLabel: "Project",
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
    presentation: { linkColors: {}, linkIcons: {}, linkLabels: {}, model: { types: [] } },
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
    vi.fn(function () {
      return { observe() {}, unobserve() {}, disconnect() {} };
    }),
  );
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  it("keeps the compact preview while loading the overflow list and its later pages", async () => {
    let overflow!: (result: { ok: true; data: RecordChoicesResult }) => void;
    let nextPage!: (result: { ok: true; data: RecordChoicesResult }) => void;
    actions.choices.mockResolvedValueOnce({ ok: true, data: { ...results([linked]), total: 26 } });
    actions.choices.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          overflow = resolve;
        }),
    );
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
    const more = Array.from(field.querySelectorAll("button")).find((button) =>
      /^\+\d+ more$/.test(button.textContent ?? ""),
    );
    expect(more).toBeDefined();
    act(() => more?.click());
    expect(field.querySelector("[data-chip-id]")?.textContent).toContain("Initial project");
    expect(document.querySelector("[data-linked-record-list]")?.textContent).not.toContain("Initial project");
    await act(async () => {
      overflow({ ok: true, data: { ...results([linked]), total: 26 } });
      await Promise.resolve();
    });
    const next = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Common.table.nextPage",
    );
    act(() => next?.click());
    expect(field.querySelector("[data-chip-id]")?.textContent).toContain("Initial project");
    expect(document.querySelector("[data-linked-record-list]")?.textContent).not.toContain("Initial project");
    await act(async () => {
      nextPage({ ok: true, data: { ...results([]), page: 2, total: 26 } });
      await Promise.resolve();
    });
    expect(document.querySelector("[data-linked-record-list]")?.textContent).not.toContain("Initial project");
    expect(actions.choices.mock.calls.at(-1)?.[0]).toMatchObject({
      page: 2,
      linkedTo: { ref: first, relationId: relation.id },
    });
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
    expect(field.textContent).toBe("");
    expect(field.querySelector("[data-empty-value]")).not.toBeNull();
  });
});

describe("relationship unlink focus", () => {
  it("opens the picker from blank input space and keeps chip actions independent", async () => {
    actions.choices.mockResolvedValue({ ok: true, data: results([linked]) });
    const store = editor();
    const field = render(store);
    await act(async () => {
      await Promise.resolve();
    });
    const chip = field.querySelector<HTMLButtonElement>("[data-chip-id] button:not([data-relationship-unlink])");
    act(() => chip?.click());
    expect(store.rootStore.recordWorkspaceStore.open).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    act(() => field.querySelector<HTMLElement>("[data-relationship-field]")?.click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector('[role="dialog"] [data-slot="command-input"]')).toBe(document.activeElement);
    expect(store.stageLink).not.toHaveBeenCalled();
  });
  it("does not open the picker from blank read-only input space", async () => {
    actions.choices.mockResolvedValue({ ok: true, data: results([linked]) });
    const field = render(editor(first, [linked], true));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => field.querySelector<HTMLElement>("[data-relationship-field]")?.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("opens overflow records with Enter and keeps keyboard unlink separate", async () => {
    const other: RecordChoice = {
      ref: { ...linked.ref, recordId: "10000000-0000-4000-8000-000000000007" },
      title: { state: "value", value: { kind: "text", value: "Second project" } },
    };
    actions.choices.mockResolvedValue({ ok: true, data: { ...results([linked, other]), total: 30 } });
    const store = editor();
    const field = render(store);
    await act(async () => {
      await Promise.resolve();
    });
    const more = [...field.querySelectorAll("button")].find((button) => /^\+\d+ more$/.test(button.textContent ?? ""));
    act(() => more?.click());
    await act(async () => {
      await Promise.resolve();
    });
    const input = document.querySelector<HTMLInputElement>('[data-slot="command-input"]');
    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(store.rootStore.recordWorkspaceStore.open).toHaveBeenCalledWith(
      linked.ref,
      input,
      field.querySelector('[role="combobox"]'),
    );
    const unlink = document.querySelector<HTMLButtonElement>("[data-linked-record-list] button");
    const selected = document.querySelector('[cmdk-item][aria-selected="true"]');
    act(() => {
      unlink?.focus();
      for (const key of ["ArrowDown", "ArrowUp", "End", "Home", "j"])
        unlink?.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: key === "j", bubbles: true }));
    });
    expect(document.querySelector('[cmdk-item][aria-selected="true"]')).toBe(selected);
    expect(document.activeElement).toBe(unlink);
    act(() => {
      unlink?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      unlink?.click();
    });
    expect(store.rootStore.recordWorkspaceStore.open).toHaveBeenCalledOnce();
    expect(store.stageLink).toHaveBeenCalledWith(
      { action: "unlink", relationId: relation.id, direction: "outgoing", record: linked.ref },
      linked.title,
    );
    expect(document.activeElement).toBe(input);
  });
  it("returns to the current opener after switching from overflow to the Link picker", async () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
      new DOMRect(0, 0, 80, 30),
    ] as unknown as DOMRectList);
    actions.choices.mockResolvedValue({ ok: true, data: { ...results([linked]), total: 30 } });
    const field = render(editor());
    await act(async () => {
      await Promise.resolve();
    });
    const more = [...field.querySelectorAll("button")].find((button) => /^\+\d+ more$/.test(button.textContent ?? ""));
    const close = async () => {
      act(() => {
        document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
    };
    act(() => more?.click());
    await act(async () => {
      await Promise.resolve();
    });
    await close();
    expect(document.activeElement).toBe(more);

    const link = field.querySelector<HTMLButtonElement>('[role="combobox"]');
    act(() => link?.click());
    await act(async () => {
      await Promise.resolve();
    });
    await close();
    expect(document.activeElement).toBe(link);
  });
  it("returns focus to the read-only field when resizing removes its overflow opener", async () => {
    let width = 120;
    const observers: Array<{ callback: ResizeObserverCallback; elements: Set<Element> }> = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        elements = new Set<Element>();
        constructor(readonly callback: ResizeObserverCallback) {
          observers.push(this);
        }
        observe(element: Element) {
          this.elements.add(element);
        }
        unobserve(element: Element) {
          this.elements.delete(element);
        }
        disconnect() {
          this.elements.clear();
        }
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
      new DOMRect(0, 0, 80, 30),
    ] as unknown as DOMRectList);
    const records = Array.from({ length: 4 }, (_, index) => ({
      ...linked,
      ref: { ...linked.ref, recordId: `project-${index}` },
    }));
    actions.choices.mockResolvedValue({ ok: true, data: results(records) });
    const field = render(editor(first, records, true));
    await act(async () => {
      await Promise.resolve();
    });
    const frame = field.querySelector<HTMLElement>("[data-relationship-field]");
    const stack = frame?.firstElementChild;
    const more = [...field.querySelectorAll("button")].find((button) => /^\+\d+ more$/.test(button.textContent ?? ""));
    expect(more).toBeDefined();
    expect(field.querySelector('[role="combobox"]')).toBeNull();
    act(() => more?.click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector("[data-linked-record-list]")).not.toBeNull();

    width = 1200;
    await act(async () => {
      for (const observer of observers)
        if (stack && observer.elements.has(stack)) observer.callback([], observer as unknown as ResizeObserver);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(more?.isConnected).toBe(false);
    act(() => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(document.querySelector("[data-linked-record-list]")).toBeNull();
    expect(document.activeElement).toBe(frame);
  });
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
    const unlinks = () => [
      ...field.querySelectorAll<HTMLButtonElement>('[data-chip-id] [aria-label="RecordModel.unlinkRecord"]'),
    ];
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

describe("relationship overflow after staged edits", () => {
  it("keeps a count-only opener when every record in the preview was unlinked", async () => {
    const records = Array.from({ length: 25 }, (_, index) => ({
      ...linked,
      ref: { ...linked.ref, recordId: `project-${index}` },
    }));
    actions.choices.mockResolvedValue({ ok: true, data: { ...results(records), total: 30 } });
    const store = Object.assign(editor(), {
      form: {
        linkChanges: records.map((record) => ({
          action: "unlink",
          relationId: relation.id,
          direction: "outgoing",
          record: record.ref,
          title: record.title,
        })),
      },
    }) as unknown as RecordEditorStore;
    const field = render(store);
    await act(async () => {
      await Promise.resolve();
    });
    expect(field.querySelector("[data-chip-id]")).toBeNull();
    const more = [...field.querySelectorAll("button")].find((button) => button.textContent === "+5 more");
    expect(more).toBeDefined();
    act(() => more?.click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector("[data-linked-record-list]")).not.toBeNull();
  });
  it("paginates staged additions on an existing record before the persisted results", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(240);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(200);
    const records = Array.from({ length: 30 }, (_, index) => ({
      ref: { ...linked.ref, recordId: `project-${index}` },
      title: { state: "value", value: { kind: "text", value: `New project ${index}` } },
    }));
    actions.choices.mockResolvedValue({ ok: true, data: results([]) });
    const store = Object.assign(editor(), {
      form: {
        linkChanges: records.map((record) => ({
          action: "link",
          relationId: relation.id,
          direction: "outgoing",
          record: record.ref,
          title: record.title,
        })),
      },
    }) as unknown as RecordEditorStore;
    const field = render(store);
    await act(async () => {
      await Promise.resolve();
    });
    const more = [...field.querySelectorAll("button")].find((button) => /^\+\d+ more$/.test(button.textContent ?? ""));
    act(() => more?.click());
    await act(async () => {
      await Promise.resolve();
    });
    const visible = () =>
      [...document.querySelectorAll("[data-linked-record-list] [cmdk-item]")].filter((button) =>
        button.textContent?.startsWith("New project"),
      );
    expect(visible()).toHaveLength(25);
    const next = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Common.table.nextPage",
    );
    expect(next).toBeDefined();
    act(() => next?.click());
    expect(visible()).toHaveLength(5);
    expect(visible()[0].textContent).toBe("New project 25");
  });
});
