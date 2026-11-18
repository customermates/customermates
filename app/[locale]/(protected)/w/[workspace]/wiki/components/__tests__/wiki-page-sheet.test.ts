import type * as TooltipModule from "@/components/ui/tooltip";
import type { ComponentProps, ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { AppModalActionProps } from "@/components/modal/app-modal-action";
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
  actions: [] as unknown[],
  trash: vi.fn(),
  bar: null as unknown,
  editor: null as unknown,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
}));
vi.mock("../../actions", () => ({ getWikiPageLinksAction: harness.getLinks }));
vi.mock("../wiki-link-picker", () => ({ WikiLinkPicker: () => null }));
vi.mock("@/components/ui/tooltip", async (importOriginal) => {
  const actual = await importOriginal<typeof TooltipModule>();
  return {
    ...actual,
    Tooltip: (props: ComponentProps<typeof actual.Tooltip>) =>
      createElement(actual.TooltipProvider, null, createElement(actual.Tooltip, props)),
  };
});
vi.mock("@/components/modal/app-modal", () => ({
  AppModalTitle: ({ children }: { children?: ReactNode }) => createElement("h2", { "data-modal-title": "" }, children),
  AppModal: ({
    actions,
    children,
    open,
    sheet,
    title,
    titleInContent,
  }: {
    actions?: unknown[];
    children?: ReactNode;
    open: boolean;
    sheet?: boolean;
    title?: string;
    titleInContent?: boolean;
  }) => {
    harness.actions = actions ?? [];
    return open
      ? createElement(
          "div",
          {
            "data-modal": sheet ? "sheet" : "dialog",
            "data-title": title,
            "data-title-in-content": String(Boolean(titleInContent)),
          },
          children,
        )
      : null;
  },
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

import { WikiPageDocument, WikiPageSheet } from "../wiki-page-sheet";

type SheetProps = ComponentProps<typeof WikiPageSheet>;

const GUIDE = "10000000-0000-4000-8000-000000000001";
const REFUNDS = "10000000-0000-4000-8000-000000000002";
const PRICING = "10000000-0000-4000-8000-000000000003";
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
  linksTo: [{ id: PRICING, title: "Pricing", kind: "knowledge" }],
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
const action = (id: string) =>
  (harness.actions as AppModalActionProps[]).find((candidate) => candidate.id === id) as
    | (AppModalActionProps & { onClick: () => void | Promise<void>; disabled?: boolean; pressed?: boolean })
    | undefined;
const actionIds = () => (harness.actions as AppModalActionProps[]).map((candidate) => candidate.id);
const openSegment = (container: HTMLElement, name: "page" | "links" | "details") =>
  act(async () => {
    const tab = container.querySelector<HTMLButtonElement>(`#wiki-page-sheet-tab-${name}`);
    tab?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    tab?.focus();
    await Promise.resolve();
  });
const chips = (container: HTMLElement) =>
  [...(container.querySelector("[data-wiki-page-chips]")?.children ?? [])].map((chip) => chip.textContent);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.reported.length = 0;
  harness.actions = [];
  harness.bar = null;
  harness.editor = null;
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

describe("Knowledge Base page sheet", () => {
  it("renders nothing while it is closed and reads no links", async () => {
    const { container } = await mount({ open: false });

    expect(container.innerHTML).toBe("");
    expect(harness.getLinks).not.toHaveBeenCalled();
  });

  it("opens as the side sheet records open in", async () => {
    const { container } = await mount();

    expect(container.querySelector("[data-modal]")?.getAttribute("data-modal")).toBe("sheet");
    expect(container.querySelector("[data-modal]")?.getAttribute("data-title")).toBe("Refunds");
  });

  it("shows a skeleton and no actions while the page is fetched", async () => {
    const { container } = await mount({ state: "loading" });

    expect(container.querySelector("[data-wiki-page-sheet-skeleton]")?.getAttribute("aria-label")).toBe(
      "PageState.loading",
    );
    expect(container.querySelector("[data-modal]")?.getAttribute("data-title")).toBe("PageState.loading");
    expect(actionIds()).toEqual([]);
    expect(harness.getLinks).not.toHaveBeenCalled();
  });

  it("says that the page is gone, once, as the sheet's own title, and offers no actions on it", async () => {
    const { container } = await mount({ state: "error" });

    expect(container.querySelector("[data-modal-title]")?.textContent).toBe("Wiki.unavailableTitle");
    expect(container.querySelector("[data-modal]")?.getAttribute("data-title-in-content")).toBe("true");
    expect(container.textContent).toContain("Wiki.unavailableBody");
    expect(container.textContent).not.toContain("Refunds");
    expect(actionIds()).toEqual([]);
  });

  describe("an editor", () => {
    it("edits the title in the heading and gets verify, pin, copy link and delete in the action rail", async () => {
      const { container } = await mount();

      const title = container.querySelector('[data-wiki-page-title][role="heading"]');
      expect(title?.getAttribute("aria-level")).toBe("2");
      expect(title?.querySelector('[data-form-input="title"]')).not.toBeNull();
      expect(actionIds()).toEqual(["verify", "pin", "copy-link", "delete"]);
      expect(container.querySelector("[data-editor]")?.getAttribute("data-readonly")).toBe("false");
      expect(container.querySelector("[data-unsaved-bar]")).not.toBeNull();
    });

    it("describes the page in chips: kind, pages linking here, owner, verified date and the pin", async () => {
      runInAction(() => {
        state.form.owner = " Support team ";
        state.form.verifiedAt = new Date("2026-11-10T08:00:00.000Z");
      });
      const { container, render } = await mount({ pinned: true });

      expect(chips(container)).toEqual([
        "Wiki.kind.procedure",
        "Wiki.graph.linkedFromCount:2",
        "Support team",
        "Wiki.verified.on:2026-11-10",
        "Wiki.graph.pinned",
      ]);

      harness.getLinks.mockResolvedValue({ ok: true, data: { ...links, linkedFrom: [] } });
      await holds(() => {
        state.form.owner = "";
        state.form.verifiedAt = null;
        state.form.updatedAt = new Date("2026-11-17T10:00:00.000Z");
      });
      await render({ pinned: false });
      expect(chips(container)).toEqual(["Wiki.kind.procedure"]);
    });

    it("marks a saved page as verified and asks to save first when there are unsaved changes", async () => {
      await mount();
      expect(action("verify")).toMatchObject({
        label: "Wiki.verified.mark",
        tooltip: "Wiki.verified.help",
        disabled: false,
      });
      await act(async () => action("verify")?.onClick());
      expect(spies.markVerified).toHaveBeenCalledOnce();

      await holds(() => (state.hasUnsavedChanges = true));
      expect(action("verify")).toMatchObject({ tooltip: "Wiki.verified.saveFirst", disabled: true });
    });

    it("pins and unpins the page on the map and explains what a pin does", async () => {
      const { render } = await mount({ pinned: false });
      expect(action("pin")).toMatchObject({ label: "Wiki.graph.pin", tooltip: "Wiki.graph.pinHelp", pressed: false });
      await act(async () => action("pin")?.onClick());
      expect(callbacks.onTogglePin).toHaveBeenCalledOnce();

      await render({ pinned: true });
      expect(action("pin")).toMatchObject({
        label: "Wiki.graph.unpin",
        tooltip: "Wiki.graph.unpinHelp",
        pressed: true,
      });
    });

    it("leaves the pin out where the map is not shown or the page is not on it", async () => {
      const { render } = await mount({ canPin: false });
      expect(actionIds()).toEqual(["verify", "copy-link", "delete"]);

      await render({ canPin: true, pinned: null });
      expect(actionIds()).toEqual(["verify", "copy-link", "delete"]);
    });

    it("copies the page's address", async () => {
      await mount();
      await act(async () => action("copy-link")?.onClick());

      expect(harness.copy).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/w/acme/wiki?page=${REFUNDS}`);
    });

    it("moves the page to the trash after confirmation and shows it again when the move is undone", async () => {
      await mount();
      await act(async () => action("delete")?.onClick());

      expect(action("delete")).toMatchObject({ variant: "destructive", disabled: false });
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

  describe("a reader", () => {
    beforeEach(() => {
      runInAction(() => (state.canManage = false));
      permissions.delete = false;
    });

    it("reads the title as a heading, cannot edit and can only copy the link", async () => {
      const { container } = await mount({ canPin: false });

      expect(container.querySelector("h2")?.textContent).toBe("Refunds");
      expect(container.querySelector('[data-form-input="title"]')).toBeNull();
      expect(actionIds()).toEqual(["copy-link"]);
      expect(container.querySelector("[data-editor]")?.getAttribute("data-readonly")).toBe("true");
    });

    it("sees the details without being able to change them", async () => {
      const { container } = await mount({ canPin: false });
      await openSegment(container, "details");

      expect(container.querySelector<HTMLSelectElement>('[data-form-select="kind"]')?.disabled).toBe(true);
      expect(container.querySelector<HTMLTextAreaElement>('[data-form-textarea="whenToUse"]')?.disabled).toBe(true);
      expect(container.querySelector<HTMLInputElement>('[data-form-input="owner"]')?.disabled).toBe(true);
    });
  });

  describe("the page segment", () => {
    it("shows when to use a procedure above its text", async () => {
      const { container } = await mount();
      expect(container.textContent).toContain("Wiki.whenToUse.label: When a customer asks for a refund.");

      await holds(() => (state.form.kind = "knowledge"));
      expect(container.textContent).not.toContain("Wiki.whenToUse.label");
    });

    it("lists the headings of a long page and leaves a short page without an outline", async () => {
      runInAction(
        () =>
          (state.editorDocument = {
            type: "doc",
            content: [heading(1, "Overview"), heading(2, "Steps"), heading(3, "Exceptions")],
          }),
      );
      const { container } = await mount();
      expect(container.textContent).toContain("Wiki.onThisPage");

      await holds(
        () => (state.editorDocument = { type: "doc", content: [heading(1, "Overview"), heading(2, "Steps")] }),
      );
      expect(container.textContent).not.toContain("Wiki.onThisPage");
    });
  });

  describe("the links segment", () => {
    it("reads the page's links once the page shows", async () => {
      await mount();

      expect(harness.getLinks).toHaveBeenCalledExactlyOnceWith({ id: REFUNDS });
    });

    it("lists the pages that link here and the pages linked from here, and opens one on a click", async () => {
      const { container } = await mount();
      await openSegment(container, "links");

      expect(container.textContent).toContain("Wiki.graph.linkedFrom · 2");
      expect(container.textContent).toContain("Wiki.graph.linksTo · 1");
      expect(container.textContent).toContain("Wiki.graph.missingLinks:1");
      act(() =>
        [...container.querySelectorAll("button")].find((button) => button.textContent === "Operating Guide")?.click(),
      );
      expect(callbacks.onSelect).toHaveBeenCalledExactlyOnceWith(GUIDE);
    });

    it("links to the lists the page mentions, with the number of single records it links to", async () => {
      const { container } = await mount();
      await openSegment(container, "links");

      const records = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/records/"]')];
      expect(records.map((link) => [link.getAttribute("href"), link.textContent])).toEqual([
        [`/records/${PEOPLE}`, "People · 2"],
        [`/records/${DEALS}`, "Deals"],
      ]);
    });

    it("says so when a page links nowhere", async () => {
      harness.getLinks.mockResolvedValue({
        ok: true,
        data: { ...links, linkedFrom: [], linksTo: [], missing: 0, missingPageIds: [], records: [] },
      });
      const { container } = await mount();
      await openSegment(container, "links");

      expect(container.textContent?.match(/Wiki\.graph\.noLinks/g)).toHaveLength(2);
      expect(container.textContent).not.toContain("Wiki.graph.records");
      expect(container.textContent).not.toContain("Wiki.graph.missingLinks");
    });

    it("says that the links could not be read and reports the failure", async () => {
      const failure = new Error("offline");
      harness.getLinks.mockRejectedValue(failure);
      const { container } = await mount();
      await openSegment(container, "links");

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

  describe("the details segment", () => {
    it("holds the kind, when to use a procedure, the owner and the dates", async () => {
      runInAction(() => (state.form.verifiedAt = new Date("2026-11-10T08:00:00.000Z")));
      const { container } = await mount();
      await openSegment(container, "details");

      expect(container.querySelector('[data-form-select="kind"]')).not.toBeNull();
      expect(container.querySelector('[data-form-textarea="whenToUse"]')).not.toBeNull();
      expect(container.querySelector<HTMLInputElement>('[data-form-input="owner"]')?.maxLength).toBe(80);
      expect(container.querySelector("dl")?.textContent).toBe("Wiki.verified.label2026-11-10Wiki.changed2026-11-16");

      await holds(() => {
        state.form.kind = "knowledge";
        state.form.verifiedAt = null;
      });
      expect(container.querySelector('[data-form-textarea="whenToUse"]')).toBeNull();
      expect(container.querySelector("dl")?.textContent).toContain("Wiki.verified.never");
    });

    it("does not let a second page become the guide", async () => {
      const { container } = await mount({ otherGuide: true });
      await openSegment(container, "details");

      const guide = container.querySelector<HTMLOptionElement>('[data-form-select="kind"] option');
      expect(guide?.disabled).toBe(true);
      expect(guide?.getAttribute("data-description")).toBe("Wiki.kind.guideExists");
    });

    it("marks the segment that holds an invalid field", async () => {
      runInAction(() => (state.errors = { owner: ["too long"] }));
      const { container } = await mount();

      expect(container.querySelector("#wiki-page-sheet-tab-details")?.getAttribute("data-invalid")).toBe("true");
      expect(container.querySelector("#wiki-page-sheet-tab-page")?.getAttribute("data-invalid")).toBeNull();
    });

    it("returns to the page when another page opens", async () => {
      const { container } = await mount();
      await openSegment(container, "details");
      expect(container.querySelector("[data-editor]")).toBeNull();

      await holds(() => (state.form.id = PRICING));
      expect(container.querySelector("[data-editor]")).not.toBeNull();
    });
  });

  describe("a new page", () => {
    beforeEach(() => {
      runInAction(() => {
        state.creating = true;
        Object.assign(state.form, { id: null, title: "", kind: "knowledge", whenToUse: "", updatedAt: null });
      });
    });

    it("has no links yet, no actions and no dates, and cancelling closes the sheet", async () => {
      const { container } = await mount({ pinned: null });

      expect(container.querySelector("[data-modal]")?.getAttribute("data-title")).toBe("Wiki.newPage");
      expect(container.querySelector("#wiki-page-sheet-tab-links")).toBeNull();
      expect(actionIds()).toEqual([]);
      expect(harness.getLinks).not.toHaveBeenCalled();
      expect(harness.bar).toMatchObject({ creating: true, onCancel: callbacks.onClose, store });

      await openSegment(container, "details");
      expect(container.querySelector("dl")).toBeNull();
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

  it("offers to open the page as a full page where the pages view exists", async () => {
    const onSwitchView = vi.fn();
    await mount({ onSwitchView });

    expect(actionIds()).toEqual(["verify", "pin", "copy-link", "delete", "switch-view"]);
    expect(action("switch-view")?.label).toBe("Wiki.view.openFullPage");
    await action("switch-view")?.onClick();
    expect(onSwitchView).toHaveBeenCalledOnce();
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
  const railLabels = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-slot="app-modal-actions"] [data-slot="app-modal-action"]')].map((control) =>
      control.getAttribute("aria-label"),
    );

  it("shows the page in the content area instead of a sheet, with its actions beside the title", async () => {
    const container = await mountDocument();

    expect(container.querySelector("[data-modal]")).toBeNull();
    expect(container.querySelector("section[data-wiki-document]")?.getAttribute("data-wiki-document")).toBe("page");
    expect(container.querySelector("section[data-wiki-document]")?.getAttribute("aria-label")).toBe("Wiki.document");
    expect(container.querySelector('[data-wiki-page-title] [data-form-input="title"]')).not.toBeNull();
    expect(railLabels(container)).toEqual([
      "Wiki.verified.mark",
      "Wiki.copyLink",
      "Wiki.delete",
      "Wiki.view.showOnMap",
    ]);
    expect(container.querySelector("[data-editor]")).not.toBeNull();
    expect(harness.getLinks).toHaveBeenCalledExactlyOnceWith({ id: REFUNDS });
  });

  it("returns to the map on request and offers no pinning away from the map", async () => {
    const container = await mountDocument();

    expect(railLabels(container)).not.toContain("Wiki.graph.pin");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Wiki.view.showOnMap"]')?.click();
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

  it("cancels a new page through the view and lets a reader only read, copy the link and return to the map", async () => {
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
    expect(railLabels(reader)).toEqual(["Wiki.copyLink", "Wiki.view.showOnMap"]);
  });
});
