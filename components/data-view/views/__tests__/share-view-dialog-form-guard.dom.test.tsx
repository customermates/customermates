import type { Root } from "react-dom/client";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
import type { PublicFormTabStore as Store } from "@/components/public-form/public-form-tab.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  wide: true,
  appMode: "cloud",
  store: null as unknown,
  actions: {
    loadEditor: vi.fn(),
    save: vi.fn(),
    loadRules: vi.fn(),
  },
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => harness.wide }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({ appMode: harness.appMode }) }));
vi.mock("@/core/utils/clipboard", () => ({ copyToClipboard: vi.fn().mockResolvedValue(true) }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));
vi.mock("@/app/actions", () => ({
  getDataViewShareOptionsAction: vi.fn().mockResolvedValue({ ok: true, data: { roles: [] } }),
  managePublicLinkAction: vi.fn().mockResolvedValue({ ok: true, data: { allowed: true, link: null, reason: null } }),
  shareDataViewAction: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));
vi.mock("@/components/public-form/public-form-actions-adapter", () => ({ publicFormTabActions: harness.actions }));
vi.mock("@/components/public-form/public-form-tab", () => ({
  PublicFormTab: ({ store }: { store: unknown }) => {
    harness.store = store;
    return createElement("div", { id: "form-tab" });
  },
}));
vi.mock("@/components/modal/app-modal", () => ({
  AppModal: ({ children, size }: { children: unknown; size?: string }) =>
    createElement("div", { "data-modal-size": size ?? "default" }, children as never),
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
vi.mock("@/components/forms/form-footer-actions", () => ({
  FormFooterActions: () => createElement("div", { id: "share-footer" }),
}));
vi.mock("@/components/forms/selectable-card", () => ({
  SelectableCard: ({ label }: { label: string }) => createElement("div", null, label),
}));
vi.mock("@/components/ui/radio-group", () => ({
  RadioGroup: ({ children }: { children: unknown }) => createElement("div", null, children as never),
}));
vi.mock("@/components/shared/copyable-code", () => ({
  CopyableCode: ({ value }: { value: string }) => createElement("code", null, value),
}));
vi.mock("../public-link-option", () => ({ PublicLinkOption: () => createElement("div", { id: "public-link" }) }));
vi.mock("@/components/ui/segmented-control", () => ({
  SegmentedControl: ({
    items,
    value,
    onValueChange,
  }: {
    items: Array<{ value: string; label: string }>;
    value: string;
    onValueChange: (value: string) => void;
  }) =>
    createElement(
      "div",
      null,
      items.map((item) =>
        createElement(
          "button",
          {
            key: item.value,
            "data-segment": item.value,
            "aria-pressed": item.value === value,
            onClick: () => onValueChange(item.value),
          },
          item.label,
        ),
      ),
    ),
}));

import { ShareViewDialog } from "../share-view-dialog";

import { TEXTS, TYPE_ID, editor, savedForm } from "@/components/public-form/__tests__/public-form-fixtures";

const VIEW = {
  id: "11000000-0000-4000-8000-000000000001",
  name: "All leads",
  isPublic: false,
  visibility: "private",
  roleIds: [],
} as unknown as DataViewChipDto;

let container: HTMLDivElement;
let root: Root;

async function renderDialog(props: { formTypeId?: string | null; kind?: "list" | "dashboard" } = {}) {
  await act(async () => {
    root.render(
      createElement(ShareViewDialog, {
        kind: props.kind ?? "list",
        formTypeId: props.formTypeId === undefined ? TYPE_ID : props.formTypeId,
        link: "https://app.example.com/records/leads",
        view: VIEW,
        onOpenChange: vi.fn(),
        onShared: vi.fn().mockResolvedValue(undefined),
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

const segment = (value: string) => {
  const found = container.querySelector<HTMLButtonElement>(`[data-segment="${value}"]`);
  if (!found) throw new Error(`Segment ${value} did not render.`);
  return found;
};

const size = () => container.querySelector("[data-modal-size]")?.getAttribute("data-modal-size");
const pressed = (value: string) => segment(value).getAttribute("aria-pressed");

async function openFormAndEdit() {
  await renderDialog();
  act(() => segment("form").click());
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
  harness.appMode = "cloud";
  harness.store = null;
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

describe("ShareViewDialog form tab", () => {
  it("is offered for a list with a form and widens the dialog for the two panes on a wide screen", async () => {
    await renderDialog();
    expect(size()).toBe("default");

    act(() => segment("form").click());

    expect(container.querySelector("#form-tab")).not.toBeNull();
    expect(size()).toBe("5xl");
    expect(container.querySelector("#share-footer")).toBeNull();
  });

  it("keeps the default width on a narrow screen", async () => {
    harness.wide = false;
    await renderDialog();

    act(() => segment("form").click());

    expect(size()).toBe("default");
  });

  it("has no form tab for a dashboard, the demo or a list without a form", async () => {
    await renderDialog({ kind: "dashboard" });
    expect(container.querySelector('[data-segment="form"]')).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);

    harness.appMode = "demo";
    await renderDialog();
    expect(container.querySelector('[data-segment="form"]')).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);

    harness.appMode = "cloud";
    await renderDialog({ formTypeId: null });
    expect(container.querySelector('[data-segment="form"]')).toBeNull();
  });
});

describe("ShareViewDialog unsaved form edits", () => {
  it("switches tabs without asking while nothing was edited", async () => {
    await renderDialog();
    act(() => segment("form").click());
    await act(async () => {
      await (harness.store as Store).load(TEXTS);
    });

    act(() => segment("share").click());

    expect(container.querySelector("#discard-dialog")).toBeNull();
    expect(pressed("share")).toBe("true");
    expect(container.querySelector("#form-tab")).toBeNull();
  });

  it("asks before leaving the form tab with unsaved edits and stays when the person cancels", async () => {
    const store = await openFormAndEdit();

    act(() => segment("share").click());

    expect(container.querySelector("#discard-dialog")).not.toBeNull();
    expect(pressed("form")).toBe("true");
    expect(container.querySelector("#form-tab")).not.toBeNull();

    act(() => container.querySelector<HTMLButtonElement>("#discard-cancel")?.click());

    expect(container.querySelector("#discard-dialog")).toBeNull();
    expect(pressed("form")).toBe("true");
    expect(store.draft?.title).toBe("Talk to us");
  });

  it("leaves the form tab and drops the edits once the person confirms", async () => {
    await openFormAndEdit();

    act(() => segment("share").click());
    act(() => container.querySelector<HTMLButtonElement>("#discard-confirm")?.click());

    expect(container.querySelector("#discard-dialog")).toBeNull();
    expect(pressed("share")).toBe("true");
    expect(container.querySelector("#form-tab")).toBeNull();
  });

  it("starts a fresh draft when the form tab is opened again after discarding", async () => {
    await openFormAndEdit();
    act(() => segment("share").click());
    act(() => container.querySelector<HTMLButtonElement>("#discard-confirm")?.click());

    act(() => segment("form").click());
    const store = harness.store as Store;
    await act(async () => {
      await store.load(TEXTS);
    });

    expect(store.draft?.title).toBe("Contact us");
    expect(store.edited).toBe(false);
  });

  it("does not ask when opening the form tab", async () => {
    await renderDialog();

    act(() => segment("form").click());

    expect(container.querySelector("#discard-dialog")).toBeNull();
    expect(pressed("form")).toBe("true");
  });
});
