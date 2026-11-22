import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  appMode: "cloud",
  loadEditor: vi.fn(),
  copy: vi.fn(),
  closeMenu: null as null | ((event: Event) => void),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/records/leads" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({ appMode: harness.appMode }) }));
vi.mock("@/core/utils/clipboard", () => ({ copyToClipboard: harness.copy }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));
vi.mock("@/components/public-form/public-form-actions-adapter", () => ({
  publicFormTabActions: { loadEditor: harness.loadEditor },
}));
vi.mock("@/components/public-form/public-form-dialog", () => ({
  PublicFormDialog: ({ typeId, listLabel }: { typeId: string; listLabel: string }) =>
    createElement("div", { id: "public-form-dialog", "data-type": typeId }, listLabel),
}));
vi.mock("@/app/actions", () => ({}));
vi.mock("../share-view-dialog", () => ({
  ShareViewDialog: ({ view, link }: { view: DataViewChipDto | null; link: string }) =>
    createElement("div", { id: "share-view-dialog", "data-link": link }, view?.name),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({
    children,
    onCloseAutoFocus,
  }: {
    children: ReactNode;
    onCloseAutoFocus: (event: Event) => void;
  }) => {
    harness.closeMenu = onCloseAutoFocus;
    return createElement("div", { role: "menu" }, children);
  },
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
    ...rest
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect: () => void;
  }) => createElement("button", { ...rest, disabled, onClick: onSelect }, children),
}));

import { ListShareMenu, shareableView } from "../list-share-menu";

import { TYPE_ID, editor, savedForm } from "@/components/public-form/__tests__/public-form-fixtures";

const OWN = { id: "11000000-0000-4000-8000-000000000001", name: "Hot leads" } as DataViewChipDto;
const SHARED = {
  id: "11000000-0000-4000-8000-000000000002",
  name: "Team view",
  sharedBy: { name: "Ana" },
} as unknown as DataViewChipDto;

let container: HTMLDivElement;
let root: Root;

function storeWith(activeViewKey: string) {
  return {
    isReady: true,
    views: [OWN, SHARED],
    activeViewKey,
    viewPathname: undefined,
    refresh: vi.fn(),
  };
}

async function render(activeViewKey = OWN.id) {
  await act(async () => {
    root.render(
      createElement(ListShareMenu, {
        store: storeWith(activeViewKey) as never,
        typeId: TYPE_ID,
        listLabel: "Leads",
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

const item = (attribute: string) => container.querySelector<HTMLButtonElement>(`[${attribute}]`);

function choose(attribute: string) {
  act(() => item(attribute)?.click());
  act(() => harness.closeMenu?.(new Event("focusout", { cancelable: true })));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.appMode = "cloud";
  harness.copy.mockResolvedValue(true);
  harness.loadEditor.mockResolvedValue({ ok: true, data: editor({ form: null }) });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("shareableView", () => {
  it("offers only a saved view of the person's own", () => {
    expect(shareableView([OWN, SHARED], OWN.id)).toBe(OWN);
    expect(shareableView([OWN, SHARED], SHARED.id)).toBeNull();
    expect(shareableView([OWN, SHARED], "all")).toBeNull();
  });
});

describe("ListShareMenu public form", () => {
  it("invites to set up a form while the list has none", async () => {
    await render();

    expect(harness.loadEditor).toHaveBeenCalledWith(TYPE_ID);
    expect(item("data-share-public-form")?.textContent).toContain("PublicForm.dialog.none");
    expect(item("data-share-public-form-link")).toBeNull();
  });

  it("shows whether the form is on, how many submissions it has and its link", async () => {
    const form = savedForm({ enabled: false, submissionCount: 12 });
    harness.loadEditor.mockResolvedValue({ ok: true, data: editor({ form }) });
    await render();

    expect(item("data-share-public-form")?.textContent).toContain(
      'PublicForm.dialog.status:{"state":"off","count":12}',
    );
    expect(item("data-share-public-form-link")?.textContent).toContain(form.url);

    await act(async () => {
      item("data-share-public-form-link")?.click();
      await Promise.resolve();
    });
    expect(harness.copy).toHaveBeenCalledWith(form.url);
  });

  it("opens the form editor in its own dialog once the menu has closed", async () => {
    await render();

    act(() => item("data-share-public-form")?.click());
    expect(container.querySelector("#public-form-dialog")).toBeNull();

    act(() => harness.closeMenu?.(new Event("focusout", { cancelable: true })));
    const dialog = container.querySelector("#public-form-dialog");
    expect(dialog?.getAttribute("data-type")).toBe(TYPE_ID);
    expect(dialog?.textContent).toBe("Leads");
  });

  it("has no public form in the demo", async () => {
    harness.appMode = "demo";
    await render();

    expect(item("data-share-public-form")).toBeNull();
    expect(harness.loadEditor).not.toHaveBeenCalled();
    expect(item("data-share-view")).not.toBeNull();
  });
});

describe("ListShareMenu share this view", () => {
  it("shares the active saved view with its link", async () => {
    await render(OWN.id);

    expect(item("data-share-view")?.disabled).toBe(false);
    choose("data-share-view");

    const dialog = container.querySelector("#share-view-dialog");
    expect(dialog?.textContent).toBe("Hot leads");
    expect(dialog?.getAttribute("data-link")).toContain(`/records/leads?view=${OWN.id}`);
  });

  it("asks to save a view first while the unsaved list or someone else's view is open", async () => {
    await render("all");
    expect(item("data-share-view")?.disabled).toBe(true);
    expect(item("data-share-view")?.textContent).toContain("DataView.share.saveViewFirst");

    await render(SHARED.id);
    expect(item("data-share-view")?.disabled).toBe(true);
  });
});
