import type { Root } from "react-dom/client";
import type { PublicFormTabStore as Store } from "@/components/public-form/public-form-tab.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  wide: true,
  store: null as unknown,
  onTabClose: null as null | (() => void),
  actions: {
    loadEditor: vi.fn(),
    save: vi.fn(),
    loadRules: vi.fn(),
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => harness.wide }));
vi.mock("@/components/public-form/public-form-actions-adapter", () => ({ publicFormTabActions: harness.actions }));
vi.mock("@/components/public-form/public-form-tab", () => ({
  PublicFormTab: ({ store, onClose }: { store: unknown; onClose: () => void }) => {
    harness.store = store;
    harness.onTabClose = onClose;
    return createElement("div", { id: "form-tab" });
  },
}));
vi.mock("@/components/modal/app-modal", () => ({
  AppModal: ({ children, size, onClose }: { children: unknown; size?: string; onClose: () => void }) =>
    createElement(
      "div",
      { "data-modal-size": size ?? "default" },
      createElement("button", { id: "modal-close", onClick: onClose }),
      children as never,
    ),
  AppModalTitle: ({ children }: { children: unknown }) => createElement("h2", null, children as never),
}));
vi.mock("@/components/modal/confirm-dialog", () => ({
  DiscardChangesDialog: ({
    open,
    onCancel,
    onConfirm,
  }: {
    open: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  }) =>
    open
      ? createElement(
          "div",
          { id: "discard-dialog" },
          createElement("button", { id: "discard-cancel", onClick: onCancel }),
          createElement("button", { id: "discard-confirm", onClick: onConfirm }),
        )
      : null,
}));

import { PublicFormDialog } from "../public-form-dialog";

import { TEXTS, TYPE_ID, editor, savedForm } from "./public-form-fixtures";

let container: HTMLDivElement;
let root: Root;
const onClose = vi.fn();

async function renderDialog() {
  await act(async () => {
    root.render(createElement(PublicFormDialog, { typeId: TYPE_ID, listLabel: "Leads", onClose }));
    await Promise.resolve();
  });
}

const size = () => container.querySelector("[data-modal-size]")?.getAttribute("data-modal-size");
const click = (selector: string) => act(() => container.querySelector<HTMLButtonElement>(selector)?.click());

async function loadAndEdit() {
  await renderDialog();
  const store = harness.store as Store;
  await act(async () => {
    await store.load(TEXTS);
  });
  act(() => store.patch({ title: "Talk to us" }));
  return store;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.wide = true;
  harness.store = null;
  harness.onTabClose = null;
  harness.actions.loadEditor.mockResolvedValue({ ok: true, data: editor({ form: savedForm() }) });
  harness.actions.loadRules.mockResolvedValue({ ok: true, data: { items: [] } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PublicFormDialog", () => {
  it("opens the form editor for the list on its own, wide on a wide screen", async () => {
    await renderDialog();

    expect(container.querySelector("#form-tab")).not.toBeNull();
    expect((harness.store as Store).typeId).toBe(TYPE_ID);
    expect(container.textContent).toContain('PublicForm.dialog.title:{"list":"Leads"}');
    expect(size()).toBe("5xl");
  });

  it("keeps the default width on a narrow screen", async () => {
    harness.wide = false;
    await renderDialog();

    expect(size()).toBe("default");
  });

  it("closes without asking while nothing was edited", async () => {
    await renderDialog();
    await act(async () => {
      await (harness.store as Store).load(TEXTS);
    });

    click("#modal-close");

    expect(container.querySelector("#discard-dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks before closing with unsaved edits and stays open when the person cancels", async () => {
    const store = await loadAndEdit();

    click("#modal-close");
    expect(container.querySelector("#discard-dialog")).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    click("#discard-cancel");
    expect(container.querySelector("#discard-dialog")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(store.draft?.title).toBe("Talk to us");
  });

  it("closes once the person confirms dropping the edits", async () => {
    await loadAndEdit();

    click("#modal-close");
    expect(container.querySelector("#discard-dialog")).not.toBeNull();

    click("#discard-confirm");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not ask a second time when the editor's own cancel closes it, since its footer already asked", async () => {
    await loadAndEdit();

    act(() => harness.onTabClose?.());

    expect(container.querySelector("#discard-dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
