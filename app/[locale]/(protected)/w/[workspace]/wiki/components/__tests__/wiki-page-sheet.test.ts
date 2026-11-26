import type { ComponentProps, ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { WikiPageLinks } from "@/features/wiki/wiki-graph.schema";
import type { WikiPageKind } from "@/features/wiki/wiki.schema";
import type { WikiPageStore } from "../wiki-page.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Action } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  getLinks: vi.fn(),
  copy: vi.fn(),
  reported: [] as unknown[],
  trash: vi.fn(),
  bar: null as unknown,
  editor: null as unknown,
  controlSlots: null as number | null,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
}));
vi.mock("../../actions", () => ({ getWikiPageLinksAction: harness.getLinks }));
vi.mock("../wiki-link-picker", () => ({ WikiLinkPicker: () => null }));
vi.mock("@/components/modal/app-modal", () => ({
  AppModalTitle: ({ children }: { children?: ReactNode }) => createElement("h2", { "data-modal-title": "" }, children),
  AppModal: ({
    children,
    controls,
    open,
    sheet,
    title,
    titleInContent,
  }: {
    children?: ReactNode;
    controls?: { node: ReactNode; slots: number };
    open: boolean;
    sheet?: boolean;
    title?: string;
    titleInContent?: boolean;
  }) => {
    if (sheet) harness.controlSlots = controls?.slots ?? null;
    return open
      ? createElement(
          "div",
          {
            "data-modal": sheet ? "sheet" : "dialog",
            "data-title": title,
            "data-title-in-content": String(Boolean(titleInContent)),
          },
          controls ? createElement("div", { "data-modal-controls": "" }, controls.node) : null,
          children,
        )
      : null;
  },
}));
vi.mock("@/components/ui/item-actions", () => ({
  ItemActionsTrigger: ({ label, menu }: { label?: string; menu?: ReactNode }) =>
    createElement("div", { "data-menu": label }, menu),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuSeparator: () => createElement("hr"),
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
    variant,
    ...props
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
    variant?: string;
  }) =>
    createElement(
      "button",
      { ...props, type: "button", role: "menuitem", disabled, "data-variant": variant, onClick: () => onSelect?.() },
      children,
    ),
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showTrashConfirmation: harness.trash }),
}));
vi.mock("@/components/editor/editor", () => ({
  Editor: (props: { label?: string; readOnly?: boolean }) => {
    harness.editor = props;
    return createElement("div", { "data-editor": "", "data-readonly": String(Boolean(props.readOnly)) }, props.label);
  },
}));
vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children, id }: { children?: ReactNode; id?: string }) => createElement("form", { id }, children),
}));
vi.mock("@/components/forms/form-field-help", () => ({
  FormFieldHelp: ({ children }: { children?: ReactNode }) => createElement("span", { "data-help": "" }, children),
}));
vi.mock("@/components/forms/form-input", () => ({
  FormInput: ({ id, disabled, maxLength }: { id: string; disabled?: boolean; maxLength?: number }) =>
    createElement("input", { "data-form-input": id, disabled, maxLength }),
}));
vi.mock("@/components/forms/form-textarea", () => ({
  FormTextarea: ({ id, disabled }: { id: string; disabled?: boolean }) =>
    createElement("textarea", { "data-form-textarea": id, disabled }),
}));
vi.mock("@/components/forms/form-select", () => ({
  FormSelect: ({
    id,
    disabled,
    items,
  }: {
    id: string;
    disabled?: boolean;
    items: Array<{ value: string; description?: string; disabled?: boolean }>;
  }) =>
    createElement(
      "select",
      { "data-form-select": id, disabled },
      items.map((item) =>
        createElement(
          "option",
          { key: item.value, disabled: item.disabled, "data-description": item.description },
          item.value,
        ),
      ),
    ),
}));
vi.mock("@/components/forms/unsaved-changes-bar", () => ({
  UnsavedChangesBar: (props: unknown) => {
    harness.bar = props;
    return createElement("div", { "data-unsaved-bar": "" });
  },
}));
vi.mock("@/components/records/record-type-icon", () => ({
  recordTypeIcon: () => () => createElement("span", { "data-record-icon": "" }),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (run: () => unknown) => Promise.resolve().then(run),
  reportApplicationError: (error: unknown) => harness.reported.push(error),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatDescriptiveShortDate: (date: Date) => date.toISOString().slice(0, 10) }),
}));
vi.mock("@/core/utils/use-copy-to-clipboard", () => ({ useCopyToClipboard: () => harness.copy }));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement("a", props, children),
  useWorkspaceSlug: () => "acme",
}));

import { WikiPageDocument, WikiPageSheet, linkedPagesOf } from "../wiki-page-sheet";

type SheetProps = ComponentProps<typeof WikiPageSheet>;

const GUIDE = "10000000-0000-4000-8000-000000000001";
const REFUNDS = "10000000-0000-4000-8000-000000000002";
const PRICING = "10000000-0000-4000-8000-000000000003";
const TONE = "10000000-0000-4000-8000-000000000004";
const PEOPLE = "20000000-0000-4000-8000-000000000001";
const DEALS = "20000000-0000-4000-8000-000000000002";
const updatedAt = new Date("2026-11-16T10:00:00.000Z");
const paragraph = { type: "doc", content: [{ type: "paragraph" }] };
const heading = (level: number, text: string) => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

const links: WikiPageLinks = {
  id: REFUNDS,
  linkedFrom: [
    { id: GUIDE, title: "Operating Guide", kind: "guide" },
    { id: PRICING, title: "Pricing", kind: "knowledge" },
  ],
  linksTo: [
    { id: PRICING, title: "Pricing", kind: "knowledge" },
    { id: TONE, title: "Tone of voice", kind: "knowledge" },
  ],
  missing: 1,
  missingPageIds: ["30000000-0000-4000-8000-000000000001"],
  records: [
    { id: PEOPLE, label: "Person", pluralLabel: "People", icon: "user", count: 2, list: false },
    { id: DEALS, label: "Deal", pluralLabel: "Deals", icon: "handshake", color: "info", count: 0, list: true },
  ],
};

const state = observable(
  {
    creating: false,
    canManage: true,
    hasUnsavedChanges: false,
    isLoading: false,
    conflict: false,
    editorDocument: paragraph as object,
    errors: {} as Record<string, string[]>,
    form: {
      id: REFUNDS as string | null,
      title: "Refunds",
      kind: "procedure" as WikiPageKind,
      whenToUse: "When a customer asks for a refund.",
      owner: "",
      verifiedAt: null as Date | null,
      updatedAt: updatedAt as Date | null,
    },
  },
  { editorDocument: observable.ref },
);
const spies = {
  markVerified: vi.fn(),
  delete: vi.fn(),
  showRestored: vi.fn(),
  onChange: vi.fn(),
  onEditorChange: vi.fn(),
  resetDocument: vi.fn(),
};
const permissions = { delete: true };
const store = {
  get creating() {
    return state.creating;
  },
  get canManage() {
    return state.canManage;
  },
  get hasUnsavedChanges() {
    return state.hasUnsavedChanges;
  },
  get isLoading() {
    return state.isLoading;
  },
  get conflict() {
    return state.conflict;
  },
  get editorDocument() {
    return state.editorDocument;
  },
  get form() {
    return state.form;
  },
  getError: (field: string) => state.errors[field],
  allows: (action: Action) => (action === Action.delete ? permissions.delete : state.canManage),
  ...spies,
} as unknown as WikiPageStore;

const callbacks = { onClose: vi.fn(), onSelect: vi.fn(), onTogglePin: vi.fn(), onReload: vi.fn() };
const roots: Root[] = [];
const containers: HTMLElement[] = [];

async function mount(props: Partial<SheetProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  const render = (next: Partial<SheetProps> = {}) =>
    act(async () => {
      root.render(
        createElement(WikiPageSheet, {
          open: true,
          state: "page",
          store,
          pinned: false,
          canPin: true,
          otherGuide: false,
          ...callbacks,
          ...props,
          ...next,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  await render();
  return { container, render };
}

const holds = (change: () => void) =>
  act(async () => {
    runInAction(change);
    await Promise.resolve();
    await Promise.resolve();
  });
const menuItem = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLButtonElement>(`[data-wiki-page-menu="${id}"]`);
const menuIds = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-wiki-page-menu]")].map((item) => item.getAttribute("data-wiki-page-menu"));
const select = (container: HTMLElement, id: string) =>
  act(async () => {
    menuItem(container, id)?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
const metaParts = (container: HTMLElement) =>
  [...(container.querySelector("[data-wiki-page-meta]")?.children ?? [])].map((part) => part.textContent);
const settings = (container: HTMLElement) => container.querySelector("[data-wiki-page-settings]");

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.reported.length = 0;
  harness.bar = null;
  harness.editor = null;
  harness.controlSlots = null;
  harness.getLinks.mockResolvedValue({ ok: true, data: links });
  harness.copy.mockResolvedValue(undefined);
  permissions.delete = true;
  runInAction(() => {
    Object.assign(state, {
      creating: false,
      canManage: true,
      hasUnsavedChanges: false,
      isLoading: false,
      conflict: false,
      editorDocument: paragraph,
      errors: {},
    });
    Object.assign(state.form, {
      id: REFUNDS,
      title: "Refunds",
      kind: "procedure",
      whenToUse: "When a customer asks for a refund.",
      owner: "",
      verifiedAt: null,
      updatedAt,
    });
  });
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const container of containers.splice(0)) container.remove();
});

describe("linked pages", () => {
  it("lists every page linked from or to this one once, in that order", () => {
    expect(linkedPagesOf(links).map((page) => page.title)).toEqual(["Operating Guide", "Pricing", "Tone of voice"]);
  });
});

describe("Knowledge Base page sheet", () => {
  it("renders nothing while it is closed and reads no links", async () => {
    const { container } = await mount({ open: false });

    expect(container.innerHTML).toBe("");
    expect(harness.getLinks).not.toHaveBeenCalled();
  });

  it("opens as the side sheet records open in, without tabs or chips", async () => {
    const { container } = await mount();

    expect(container.querySelector("[data-modal]")?.getAttribute("data-modal")).toBe("sheet");
    expect(container.querySelector("[data-modal]")?.getAttribute("data-title")).toBe("Refunds");
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector("[data-slot='collapsible-section']")).toBeNull();
    expect(container.textContent).not.toContain("Wiki.onThisPage");
  });

  it("shows a skeleton and no controls while the page is fetched", async () => {
    const { container } = await mount({ state: "loading" });

    expect(container.querySelector("[data-wiki-page-sheet-skeleton]")?.getAttribute("aria-label")).toBe(
      "PageState.loading",
    );
    expect(container.querySelector("[data-modal]")?.getAttribute("data-title")).toBe("PageState.loading");
    expect(container.querySelector("[data-modal-controls]")).toBeNull();
    expect(harness.getLinks).not.toHaveBeenCalled();
  });

  it("says that the page is gone, once, as the sheet's own title, and offers no controls", async () => {
    const { container } = await mount({ state: "error" });

    expect(container.querySelector("[data-modal-title]")?.textContent).toBe("Wiki.unavailableTitle");
    expect(container.querySelector("[data-modal]")?.getAttribute("data-title-in-content")).toBe("true");
    expect(container.textContent).toContain("Wiki.unavailableBody");
    expect(container.textContent).not.toContain("Refunds");
    expect(container.querySelector("[data-modal-controls]")).toBeNull();
  });

  describe("the header", () => {
    it("edits the title and keeps pin, copy link, page settings, verify and delete in the more menu", async () => {
      const { container } = await mount();

      const title = container.querySelector('[data-wiki-page-title][role="heading"]');
      expect(title?.getAttribute("aria-level")).toBe("2");
      expect(title?.querySelector('[data-form-input="title"]')).not.toBeNull();
      expect(container.querySelector("[data-menu]")?.getAttribute("data-menu")).toBe("DataView.moreActions");
      expect(menuIds(container)).toEqual(["pin", "copy-link", "settings", "verify", "delete"]);
      expect(container.querySelector("[data-editor]")?.getAttribute("data-readonly")).toBe("false");
      expect(container.querySelector("[data-unsaved-bar]")).not.toBeNull();
      expect(harness.controlSlots).toBe(1);
    });

    it("shows one visible button that opens the page as a full page where that view exists", async () => {
      const onSwitchView = vi.fn();
      const { container } = await mount({ onSwitchView });

      const button = [...container.querySelectorAll("[data-wiki-page-controls] > button")];
      expect(button.map((control) => control.textContent)).toEqual(["Wiki.view.fullPage"]);
      expect(harness.controlSlots).toBe(3);
      act(() => (button[0] as HTMLButtonElement).click());
      expect(onSwitchView).toHaveBeenCalledOnce();
    });

    it("describes the page in one quiet line: kind, owner, verified date and pages linking here", async () => {
      runInAction(() => {
        state.form.owner = " Support team ";
        state.form.verifiedAt = new Date("2026-11-10T08:00:00.000Z");
      });
      const { container } = await mount();

      expect(metaParts(container)).toEqual([
        "Wiki.kind.procedure",
        "Support team",
        "Wiki.verified.on:2026-11-10",
        "Wiki.linksHere:2",
      ]);

      harness.getLinks.mockResolvedValue({ ok: true, data: { ...links, linkedFrom: [] } });
      await holds(() => {
        state.form.owner = "";
        state.form.verifiedAt = null;
        state.form.updatedAt = new Date("2026-11-17T10:00:00.000Z");
      });
      expect(metaParts(container)).toEqual(["Wiki.kind.procedure"]);
    });

    it("scrolls to the linked pages from the meta line", async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      const { container } = await mount();

      act(() => container.querySelector<HTMLButtonElement>("[data-wiki-links-here]")?.click());
      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView.mock.contexts[0]).toBe(container.querySelector("[data-wiki-page-links]"));
    });

    it("marks a saved page as verified and asks to save first when there are unsaved changes", async () => {
      const { container } = await mount();
      await select(container, "verify");
      expect(spies.markVerified).toHaveBeenCalledOnce();

      await holds(() => (state.hasUnsavedChanges = true));
      expect(menuItem(container, "verify")?.disabled).toBe(true);
      expect(menuItem(container, "verify")?.textContent).toBe("Wiki.verified.saveFirst");
    });

    it("pins and unpins the page on the map", async () => {
      const { container, render } = await mount({ pinned: false });
      expect(menuItem(container, "pin")?.textContent).toBe("Wiki.graph.pin");
      await select(container, "pin");
      expect(callbacks.onTogglePin).toHaveBeenCalledOnce();

      await render({ pinned: true });
      expect(menuItem(container, "pin")?.textContent).toBe("Wiki.graph.unpin");
    });

    it("leaves the pin out where the map is not shown or the page is not on it", async () => {
      const { container, render } = await mount({ canPin: false });
      expect(menuIds(container)).toEqual(["copy-link", "settings", "verify", "delete"]);

      await render({ canPin: true, pinned: null });
      expect(menuIds(container)).toEqual(["copy-link", "settings", "verify", "delete"]);
    });

    it("copies the page's address", async () => {
      const { container } = await mount();
      await select(container, "copy-link");

      expect(harness.copy).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/w/acme/wiki?page=${REFUNDS}`);
    });

    it("moves the page to the trash after confirmation and shows it again when the move is undone", async () => {
      const { container } = await mount();
      expect(menuItem(container, "delete")?.getAttribute("data-variant")).toBe("destructive");
      await select(container, "delete");

      expect(harness.trash).toHaveBeenCalledExactlyOnceWith(
        expect.any(Function),
        "Refunds",
        undefined,
        expect.any(Function),
      );
      const [confirm, , , restored] = harness.trash.mock.calls[0] as [() => unknown, string, undefined, () => unknown];
      confirm();
      expect(spies.delete).toHaveBeenCalledOnce();
      restored();
      expect(spies.showRestored).toHaveBeenCalledExactlyOnceWith(REFUNDS);
    });

    it("offers a reload when the page changed elsewhere", async () => {
      runInAction(() => (state.conflict = true));
      const { container } = await mount();

      expect(container.textContent).toContain("Wiki.conflict");
      act(() =>
        [...container.querySelectorAll("button")].find((button) => button.textContent === "Wiki.reload")?.click(),
      );
      expect(callbacks.onReload).toHaveBeenCalledOnce();
    });
  });

  describe("page settings", () => {
    it("open from the menu with the kind, when to use a procedure, the owner and the dates", async () => {
      runInAction(() => (state.form.verifiedAt = new Date("2026-11-10T08:00:00.000Z")));
      const { container } = await mount();
      expect(settings(container)).toBeNull();

      await select(container, "settings");
      expect(settings(container)?.closest("[data-modal]")?.getAttribute("data-modal")).toBe("dialog");
      expect(container.querySelector('[data-form-select="kind"]')).not.toBeNull();
      expect(container.querySelector('[data-form-textarea="whenToUse"]')).not.toBeNull();
      expect(container.querySelector<HTMLInputElement>('[data-form-input="owner"]')?.maxLength).toBe(80);
      expect(settings(container)?.querySelector("dl")?.textContent).toBe(
        "Wiki.verified.label2026-11-10Wiki.changed2026-11-16",
      );

      await holds(() => {
        state.form.kind = "knowledge";
        state.form.verifiedAt = null;
      });
      expect(container.querySelector('[data-form-textarea="whenToUse"]')).toBeNull();
      expect(settings(container)?.querySelector("dl")?.textContent).toContain("Wiki.verified.never");
    });

    it("do not let a second page become the guide", async () => {
      const { container } = await mount({ otherGuide: true });
      await select(container, "settings");

      const guide = container.querySelector<HTMLOptionElement>('[data-form-select="kind"] option');
      expect(guide?.disabled).toBe(true);
      expect(guide?.getAttribute("data-description")).toBe("Wiki.kind.guideExists");
    });

    it("point to themselves when one of their fields is invalid", async () => {
      runInAction(() => (state.errors = { owner: ["too long"] }));
      const { container } = await mount();

      const hint = container.querySelector<HTMLButtonElement>("[data-wiki-settings-invalid]");
      expect(hint?.textContent).toBe("Wiki.settings.invalid");
      act(() => hint?.click());
      expect(settings(container)).not.toBeNull();
    });

    it("close when another page opens", async () => {
      const { container } = await mount();
      await select(container, "settings");
      expect(settings(container)).not.toBeNull();

      await holds(() => (state.form.id = PRICING));
      expect(settings(container)).toBeNull();
    });
  });

  describe("a reader", () => {
    beforeEach(() => {
      runInAction(() => (state.canManage = false));
      permissions.delete = false;
    });

    it("reads the title as a heading, cannot edit and can copy the link or look at the settings", async () => {
      const { container } = await mount({ canPin: false });

      expect(container.querySelector("h2")?.textContent).toBe("Refunds");
      expect(container.querySelector('[data-form-input="title"]')).toBeNull();
      expect(menuIds(container)).toEqual(["copy-link", "settings"]);
      expect(container.querySelector("[data-editor]")?.getAttribute("data-readonly")).toBe("true");
    });

    it("sees the settings without being able to change them", async () => {
      const { container } = await mount({ canPin: false });
      await select(container, "settings");

      expect(container.querySelector<HTMLSelectElement>('[data-form-select="kind"]')?.disabled).toBe(true);
      expect(container.querySelector<HTMLTextAreaElement>('[data-form-textarea="whenToUse"]')?.disabled).toBe(true);
      expect(container.querySelector<HTMLInputElement>('[data-form-input="owner"]')?.disabled).toBe(true);
    });
  });

  describe("the document", () => {
    it("shows when to use a procedure above its text", async () => {
      const { container } = await mount();
      expect(container.querySelector("[data-wiki-when-to-use]")?.textContent).toBe(
        "Wiki.whenToUse.label When a customer asks for a refund.",
      );

      await holds(() => (state.form.kind = "knowledge"));
      expect(container.querySelector("[data-wiki-when-to-use]")).toBeNull();
    });

    it("reads the page's links once the page shows", async () => {
      await mount();

      expect(harness.getLinks).toHaveBeenCalledExactlyOnceWith({ id: REFUNDS });
    });

    it("ends with the linked pages as pills and opens one on a click", async () => {
      const { container } = await mount();

      const pills = [...container.querySelectorAll("[data-wiki-linked-pages] button")];
      expect(container.querySelector("[data-wiki-linked-pages]")?.textContent).toContain("Wiki.graph.linkedPages");
      expect(pills.map((pill) => pill.textContent)).toEqual(["Operating Guide", "Pricing", "Tone of voice"]);
      expect(container.textContent).toContain("Wiki.graph.missingLinks:1");
      act(() => (pills[0] as HTMLButtonElement).click());
      expect(callbacks.onSelect).toHaveBeenCalledExactlyOnceWith(GUIDE);
    });

    it("ends with the lists the page uses, with the number of single records it links to", async () => {
      const { container } = await mount();

      expect(container.querySelector("[data-wiki-linked-lists]")?.textContent).toContain("Wiki.graph.listsUsed");
      const records = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/records/"]')];
      expect(records.map((link) => [link.getAttribute("href"), link.textContent])).toEqual([
        [`/records/${PEOPLE}`, "People · 2"],
        [`/records/${DEALS}`, "Deals"],
      ]);
    });

    it("leaves the sections out when a page links nowhere", async () => {
      harness.getLinks.mockResolvedValue({
        ok: true,
        data: { ...links, linkedFrom: [], linksTo: [], missing: 0, missingPageIds: [], records: [] },
      });
      const { container } = await mount();

      expect(container.querySelector("[data-wiki-linked-pages]")).toBeNull();
      expect(container.querySelector("[data-wiki-linked-lists]")).toBeNull();
      expect(container.textContent).not.toContain("Wiki.graph.missingLinks");
    });

    it("says that the links could not be read and reports the failure", async () => {
      const failure = new Error("offline");
      harness.getLinks.mockRejectedValue(failure);
      const { container } = await mount();

      expect(container.textContent).toContain("Wiki.graph.linksFailed");
      expect(harness.reported).toEqual([failure]);
    });

    it("reads the links again after the page was saved and when another page opens", async () => {
      await mount();
      await holds(() => (state.form.updatedAt = new Date("2026-11-17T10:00:00.000Z")));
      expect(harness.getLinks).toHaveBeenCalledTimes(2);

      await holds(() => (state.form.id = PRICING));
      expect(harness.getLinks).toHaveBeenLastCalledWith({ id: PRICING });
    });
  });

  describe("a new page", () => {
    beforeEach(() => {
      runInAction(() => {
        state.creating = true;
        Object.assign(state.form, { id: null, title: "", kind: "knowledge", whenToUse: "", updatedAt: null });
      });
    });

    it("has no links yet, only the page settings in the menu and no dates, and cancelling closes the sheet", async () => {
      const { container } = await mount({ pinned: null, onSwitchView: vi.fn() });

      expect(container.querySelector("[data-modal]")?.getAttribute("data-title")).toBe("Wiki.newPage");
      expect(container.querySelector("[data-wiki-page-links]")).toBeNull();
      expect(menuIds(container)).toEqual(["settings"]);
      expect(container.querySelector("[data-wiki-page-controls] > button")).toBeNull();
      expect(harness.getLinks).not.toHaveBeenCalled();
      expect(harness.bar).toMatchObject({ creating: true, onCancel: callbacks.onClose, store });

      await select(container, "settings");
      expect(settings(container)?.querySelector("dl")).toBeNull();
    });

    it("discards changes to an existing page instead of closing", async () => {
      runInAction(() => {
        state.creating = false;
        state.form.id = REFUNDS;
      });
      await mount();

      expect(harness.bar).toMatchObject({ creating: false, onCancel: spies.resetDocument });
    });
  });
});

describe("Knowledge Base page as a full page", () => {
  const onSwitchView = vi.fn();

  async function mountDocument(props: Partial<ComponentProps<typeof WikiPageDocument>> = {}) {
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(
        createElement(WikiPageDocument, {
          state: "page",
          store,
          otherGuide: false,
          onClose: callbacks.onClose,
          onSelect: callbacks.onSelect,
          onReload: callbacks.onReload,
          onSwitchView,
          ...props,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    return container;
  }

  it("shows the page in the content area with the map button and the more menu beside the title", async () => {
    const container = await mountDocument();

    expect(container.querySelector("[data-modal='sheet']")).toBeNull();
    expect(container.querySelector("section[data-wiki-document]")?.getAttribute("data-wiki-document")).toBe("page");
    expect(container.querySelector("section[data-wiki-document]")?.getAttribute("aria-label")).toBe("Wiki.document");
    const header = container.querySelector("[data-slot='card-header']");
    expect(header?.querySelector('[data-wiki-page-title] [data-form-input="title"]')).not.toBeNull();
    expect(header?.querySelector("[data-wiki-page-controls]")).not.toBeNull();
    expect(
      [...container.querySelectorAll("[data-wiki-page-controls] > button")].map((button) => button.textContent),
    ).toEqual(["Wiki.view.showOnMap"]);
    expect(menuIds(container)).toEqual(["copy-link", "settings", "verify", "delete"]);
    expect(container.querySelector("[data-editor]")).not.toBeNull();
    expect(harness.getLinks).toHaveBeenCalledExactlyOnceWith({ id: REFUNDS });
  });

  it("returns to the map on request and offers no pinning away from the map", async () => {
    const container = await mountDocument();

    expect(menuItem(container, "pin")).toBeNull();
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-wiki-page-controls] > button")?.click();
      await Promise.resolve();
    });
    expect(onSwitchView).toHaveBeenCalledOnce();
  });

  it("keeps the headings of a long page beside the text", async () => {
    runInAction(
      () =>
        (state.editorDocument = {
          type: "doc",
          content: [heading(1, "Overview"), heading(2, "Steps"), heading(3, "Exceptions")],
        }),
    );
    const container = await mountDocument();

    const outline = container.querySelector("nav[data-wiki-page-outline]");
    expect(outline?.getAttribute("aria-label")).toBe("Wiki.onThisPage");
    expect([...(outline?.querySelectorAll("button") ?? [])].map((button) => button.textContent)).toEqual([
      "Overview",
      "Steps",
      "Exceptions",
    ]);
  });

  it("shows a skeleton while the page is fetched and says when the page is gone, without a dialog title", async () => {
    const loading = await mountDocument({ state: "loading" });
    expect(loading.querySelector("[data-wiki-page-sheet-skeleton]")).not.toBeNull();
    expect(harness.getLinks).not.toHaveBeenCalled();

    const gone = await mountDocument({ state: "error" });
    expect(gone.querySelector("h2")?.textContent).toBe("Wiki.unavailableTitle");
    expect(gone.querySelector("[data-modal-title]")).toBeNull();
    expect(gone.textContent).toContain("Wiki.unavailableBody");
  });

  it("cancels a new page through the view and lets a reader only read, copy the link, see the settings and return to the map", async () => {
    runInAction(() => {
      state.creating = true;
      Object.assign(state.form, { id: null, title: "", kind: "knowledge", whenToUse: "", updatedAt: null });
    });
    await mountDocument();
    expect(harness.bar).toMatchObject({ creating: true, onCancel: callbacks.onClose });

    runInAction(() => {
      state.creating = false;
      state.canManage = false;
      Object.assign(state.form, { id: REFUNDS, title: "Refunds", updatedAt });
    });
    permissions.delete = false;
    const reader = await mountDocument();
    expect(reader.querySelector("h2")?.textContent).toBe("Refunds");
    expect(menuIds(reader)).toEqual(["copy-link", "settings"]);
    expect(
      [...reader.querySelectorAll("[data-wiki-page-controls] > button")].map((button) => button.textContent),
    ).toEqual(["Wiki.view.showOnMap"]);
  });
});
