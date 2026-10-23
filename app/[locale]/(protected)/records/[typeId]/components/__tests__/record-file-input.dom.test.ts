import type { ReactNode } from "react";
import type { RecordFieldView, RecordFileSummary } from "@/features/records/record-model.schema";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Transfer = {
  file: File;
  progress: (loaded: number, total: number) => void;
  finish: (outcome: { ok: true } | { ok: false; message: string | null; aborted: boolean }) => void;
  abort: ReturnType<typeof vi.fn>;
};

const form = vi.hoisted(() => ({
  value: undefined as unknown,
  disabled: false,
  changes: [] as unknown[],
}));
const uploads = vi.hoisted(() => ({
  started: [] as Array<{ typeId: string; fieldId: string; file: File }>,
  refusal: null as string | null,
  hold: false,
  transfers: [] as Transfer[],
  held: [] as Array<() => void>,
}));
const opened = vi.hoisted(() => [] as unknown[]);
const downloaded = vi.hoisted(() => [] as unknown[]);
const renames = vi.hoisted(() => ({
  calls: [] as Array<[string, string]>,
  pending: [] as Array<(outcome: unknown) => void>,
  toasts: [] as string[],
}));

vi.mock("sonner", () => ({ toast: { error: (message: string) => renames.toasts.push(message) } }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock("@/components/forms/form-context", () => ({
  useAppForm: () => ({
    getValue: () => form.value,
    getError: () => undefined,
    get isDisabled() {
      return form.disabled;
    },
    onChange: (_id: string, value: unknown) => {
      form.value = value;
      form.changes.push(value);
    },
  }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumber: (value: number) => String(value), formatRelativeTime: () => "2h ago" }),
}));
vi.mock("@/components/records/record-file-links", () => ({
  downloadRecordFile: (file: unknown) => downloaded.push(file),
  recordFileContentUrl: (id: string) => `/api/v1/files/${id}/content`,
}));
vi.mock("@/components/ui/icon-button", async () => {
  const React = await import("react");
  return {
    IconButton: ({ label, onClick }: { label: string; onClick?: () => void }) =>
      React.createElement("button", { "aria-label": label, type: "button", onClick }),
  };
});
vi.mock("@/components/ui/item-actions", async () => {
  const React = await import("react");
  return {
    ItemActions: ({
      children,
      menu,
      onCloseAutoFocus,
    }: {
      children: ReactNode;
      menu: ReactNode;
      onCloseAutoFocus?: (event: Event) => void;
    }) =>
      React.createElement(
        React.Fragment,
        null,
        children,
        React.createElement(
          "div",
          { onClick: () => onCloseAutoFocus?.(new Event("focus", { cancelable: true })) },
          menu,
        ),
      ),
    ItemActionsTrigger: () => null,
    ITEM_ACTIONS_TRIGGER_CLASS: "",
  };
});
vi.mock("@/components/ui/dropdown-menu", async () => {
  const React = await import("react");
  return {
    DropdownMenuItem: ({
      children,
      onSelect,
      asChild,
    }: {
      children: ReactNode;
      onSelect?: () => void;
      asChild?: boolean;
    }) =>
      asChild
        ? children
        : React.createElement(
            "button",
            { "data-menu-item": "", type: "button", onClick: () => onSelect?.() },
            children,
          ),
    DropdownMenuSeparator: () => null,
  };
});
vi.mock("@/components/records/record-file-preview", () => ({
  useRecordFilePreview: () => ({ openFiles: (set: unknown) => opened.push(set), preview: null }),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => {
    void action();
  },
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ userStore: { user: { id: VIEWER_ID, firstName: "Max", lastName: "Bergmann" } } }),
}));
vi.mock("@/app/[locale]/(protected)/settings/(workspace)/actions", () => ({ getActiveUsersAction: vi.fn() }));
vi.mock("@/app/[locale]/(protected)/records/actions", () => ({
  lookupAddressAction: vi.fn(),
  verifyAddressAction: vi.fn(),
}));
vi.mock("@/components/records/record-file-upload", () => ({
  startRecordFileUpload: (input: { typeId: string; fieldId: string; file: File }) => {
    uploads.started.push(input);
    if (uploads.refusal) return Promise.resolve({ ok: false, message: uploads.refusal });
    const started = {
      ok: true,
      data: {
        fileId: `uploaded-${uploads.started.length}`,
        upload: { url: "https://store.test/put", method: "PUT", headers: {}, expiresAt: "2026-10-15T10:00:00.000Z" },
      },
    };
    if (!uploads.hold) return Promise.resolve(started);
    return new Promise((resolve) => uploads.held.push(() => resolve(started)));
  },
  renameRecordFile: (fileId: string, name: string) => {
    renames.calls.push([fileId, name]);
    return new Promise((resolve) => renames.pending.push(resolve));
  },
  sendRecordFileBytes: (_upload: unknown, file: File, progress: (loaded: number, total: number) => void) => {
    let finish: Transfer["finish"] = () => undefined;
    const done = new Promise<Parameters<Transfer["finish"]>[0]>((resolve) => {
      finish = resolve;
    });
    const abort = vi.fn(() => finish({ ok: false, message: null, aborted: true }));
    uploads.transfers.push({ file, progress, finish: (outcome) => finish(outcome), abort });
    return { done, abort };
  },
}));

import { RecordFileInput } from "../record-file-input";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
import { RecordInputField } from "../record-input-field";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const SAVED: RecordFileSummary = {
  id: "saved-file",
  name: "Offer.pdf",
  mimeType: "application/pdf",
  size: 2048,
  uploadedAt: "2026-10-14T08:00:00.000Z",
  uploadedById: null,
};
const roots = new Set<Root>();

function field(multiple: boolean): RecordFieldView {
  return {
    id: "field-id",
    typeId: "type-id",
    label: "Documents",
    valueType: "file",
    multiple,
    required: false,
  } as RecordFieldView;
}

async function flush() {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve();
  });
}

function render(
  options: {
    multiple?: boolean;
    files?: RecordFileSummary[];
    label?: string | null;
    members?: Array<{ id: string; firstName: string; lastName: string; avatarUrl: null }>;
  } = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.add(root);
  const draw = () =>
    act(() =>
      root.render(
        createElement(RecordFileInput, {
          field: field(options.multiple ?? true),
          id: "values.field-id",
          label: options.label ?? null,
          files: options.files ?? [SAVED],
          members: options.members ?? [],
        }),
      ),
    );
  draw();
  return {
    host,
    redraw: draw,
    rows: () =>
      [...host.querySelectorAll("[data-record-file], [data-record-file-upload]")].map(
        (row) => row.querySelector("[data-record-file-name]")?.textContent,
      ),
    row: (name: string) =>
      [...host.querySelectorAll<HTMLElement>("[data-record-file], [data-record-file-upload]")].find(
        (row) => row.querySelector("[data-record-file-name]")?.textContent === name,
      ) ?? null,
    subtitle: (name: string) =>
      [...host.querySelectorAll("[data-record-file], [data-record-file-upload]")]
        .find((row) => row.querySelector("[data-record-file-name]")?.textContent === name)
        ?.querySelector("[data-record-file-meta]")?.textContent,
    addRow: () => host.querySelector<HTMLButtonElement>("[data-record-file-add]"),
    button: (label: string) =>
      [...host.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === label) ?? null,
    menuItem: (label: string) =>
      [...host.querySelectorAll<HTMLButtonElement>("[data-menu-item]")].find((item) => item.textContent === label) ??
      null,
    pick: async (...files: File[]) => {
      const input = host.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input) throw new Error("The file picker is missing");
      Object.defineProperty(input, "files", { configurable: true, value: files });
      act(() => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await flush();
    },
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  form.value = ["saved-file"];
  form.disabled = false;
  form.changes.length = 0;
  uploads.started.length = 0;
  uploads.refusal = null;
  uploads.hold = false;
  uploads.held.length = 0;
  uploads.transfers.length = 0;
  opened.length = 0;
  downloaded.length = 0;
  renames.calls.length = 0;
  renames.pending.length = 0;
  renames.toasts.length = 0;
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.innerHTML = "";
});

describe("RecordFileInput", () => {
  it("uploads picked files with progress and adds each to the field once its bytes arrived", async () => {
    const view = render();
    const notes = new File(["notes"], "notes.txt", { type: "text/plain" });
    const sheet = new File(["a,b"], "sheet.csv", { type: "text/csv" });
    await view.pick(notes, sheet);

    expect(uploads.started.map((upload) => [upload.typeId, upload.fieldId, upload.file.name])).toEqual([
      ["type-id", "field-id", "notes.txt"],
      ["type-id", "field-id", "sheet.csv"],
    ]);
    expect(view.rows()).toEqual(["Offer.pdf", "notes.txt", "sheet.csv"]);
    act(() => uploads.transfers[0].progress(5, 10));
    const progress = view.row("notes.txt")?.querySelector('[role="progressbar"]');
    expect(progress?.getAttribute("aria-valuenow")).toBe("50");
    expect(progress?.getAttribute("aria-valuetext")).toBe('RecordModel.fileUploading {"progress":0.5}');

    uploads.transfers[1].finish({ ok: true });
    await flush();
    expect(form.value).toEqual(["saved-file", "uploaded-2"]);
    uploads.transfers[0].finish({ ok: true });
    await flush();
    expect(form.value).toEqual(["saved-file", "uploaded-2", "uploaded-1"]);
    view.redraw();
    expect(view.rows()).toEqual(["Offer.pdf", "sheet.csv", "notes.txt"]);
    expect(view.subtitle("notes.txt")).toBe("5 B · Max Bergmann · 2h ago");
    expect(view.row("notes.txt")?.querySelector("[data-file-badge]")?.getAttribute("data-file-badge")).toBe("text");
    expect(view.row("sheet.csv")?.querySelector("[data-file-badge]")?.textContent).toBe("CSV");
  });

  it("shows the server's refusal next to the file and keeps the field's value", async () => {
    uploads.refusal = "Your workspace uses 5 GB of its 5 GB file storage.";
    const view = render();
    await view.pick(new File(["x"], "contract.pdf", { type: "application/pdf" }));

    expect(view.subtitle("contract.pdf")).toBe("Your workspace uses 5 GB of its 5 GB file storage.");
    expect(uploads.transfers).toHaveLength(0);
    expect(form.changes).toEqual([]);
    act(() => view.button('RecordModel.fileRemove {"name":"contract.pdf"}')?.click());
    expect(view.rows()).toEqual(["Offer.pdf"]);
  });

  it("reports a failed transfer and cancels a running one without touching the value", async () => {
    const view = render();
    await view.pick(new File(["1"], "one.txt"), new File(["2"], "two.txt"));
    uploads.transfers[0].finish({ ok: false, message: null, aborted: false });
    await flush();
    expect(view.subtitle("one.txt")).toBe("RecordModel.fileUploadFailed");

    act(() => view.button('RecordModel.fileCancelUpload {"name":"two.txt"}')?.click());
    await flush();
    expect(uploads.transfers[1].abort).toHaveBeenCalledOnce();
    expect(view.rows()).toEqual(["Offer.pdf", "one.txt"]);
    expect(form.changes).toEqual([]);
  });

  it("never sends or attaches a file whose upload was cancelled while it was still starting", async () => {
    uploads.hold = true;
    const view = render();
    await view.pick(new File(["late"], "late.txt", { type: "text/plain" }));
    act(() => view.button('RecordModel.fileCancelUpload {"name":"late.txt"}')?.click());
    expect(view.rows()).toEqual(["Offer.pdf"]);
    uploads.held[0]();
    await flush();
    expect(uploads.transfers).toHaveLength(0);
    expect(form.changes).toEqual([]);
  });

  it("replaces the file of a single-file field after the new upload finished", async () => {
    const view = render({ multiple: false });
    expect(view.host.querySelector('input[type="file"]')?.hasAttribute("multiple")).toBe(false);
    expect(view.addRow()?.textContent).toBe('RecordModel.fileAddRow {"mode":"one"}');
    await view.pick(new File(["new"], "new.pdf", { type: "application/pdf" }));
    uploads.transfers[0].finish({ ok: true });
    await flush();
    expect(form.value).toEqual(["uploaded-1"]);
  });

  it("uploads only as many files as the field still holds and refuses the rest", async () => {
    form.value = Array.from({ length: 19 }, (_, index) => `file-${index}`);
    const view = render({ files: [] });
    await view.pick(new File(["a"], "a.txt"), new File(["b"], "b.txt"));

    expect(uploads.started.map((upload) => upload.file.name)).toEqual(["a.txt"]);
    expect(view.subtitle("b.txt")).toBe('RecordModel.fileLimit {"count":20}');
    expect(view.addRow()).toBeNull();
    expect(view.host.textContent).toContain('RecordModel.fileLimit {"count":20}');
    expect(view.host.querySelector('[role="group"]')?.id).toBe("values.field-id");
  });

  it("opens the field's files in the preview, downloads and removes them, and offers no changes while read-only", () => {
    const second = { ...SAVED, id: "second-file", name: "Prices.xlsx", mimeType: XLSX };
    form.value = ["saved-file", "second-file"];
    const view = render({ files: [SAVED, second], label: "Documents" });
    expect(view.host.querySelector("[data-record-file-count]")?.textContent).toBe("2");
    act(() => view.row("Prices.xlsx")?.querySelector<HTMLButtonElement>("[data-record-file-name]")?.click());
    expect(opened).toEqual([expect.objectContaining({ files: [SAVED, second], index: 1, group: "Documents" })]);
    act(() => view.button('RecordModel.fileDownloadNamed {"name":"Offer.pdf"}')?.click());
    expect(downloaded).toEqual([SAVED]);
    expect(view.row("Offer.pdf")?.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe(
      "/api/v1/files/saved-file/content",
    );
    expect(view.row("Prices.xlsx")?.querySelector('a[target="_blank"]')).toBeNull();
    act(() => view.menuItem('RecordModel.fileRemove {"name":"Offer.pdf"}')?.click());
    expect(form.value).toEqual(["second-file"]);

    form.value = ["saved-file"];
    form.disabled = true;
    view.redraw();
    expect(view.host.querySelector('input[type="file"]')).toBeNull();
    expect(view.addRow()).toBeNull();
    expect(view.menuItem('RecordModel.fileRemove {"name":"Offer.pdf"}')).toBeNull();
    expect(view.menuItem("RecordModel.fileDownload")).not.toBeNull();
    expect(view.rows()).toEqual(["Offer.pdf"]);
  });

  it("renames a file inline from its menu, optimistically and with a rollback when the server refuses", async () => {
    const view = render();
    act(() => view.menuItem('RecordModel.fileRename {"name":"Offer.pdf"}')?.click());
    const input = view.host.querySelector<HTMLInputElement>("[data-record-file-name-input]");
    if (!input) throw new Error("The name input is missing");
    expect(input.value).toBe("Offer.pdf");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5]);
    expect(input.hasAttribute("data-local-escape")).toBe(true);
    const type = (value: string, key: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    type("Signed", "Enter");
    expect(renames.calls).toEqual([["saved-file", "Signed"]]);
    expect(view.rows()).toEqual(["Signed.pdf"]);
    await act(async () => {
      renames.pending[0]({ ok: true, data: { ...SAVED, name: "Signed.pdf" } });
      await Promise.resolve();
    });
    expect(view.rows()).toEqual(["Signed.pdf"]);

    act(() => view.menuItem('RecordModel.fileRename {"name":"Signed.pdf"}')?.click());
    const again = view.host.querySelector<HTMLInputElement>("[data-record-file-name-input]");
    if (!again) throw new Error("The name input is missing");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(again, "Taken");
      again.dispatchEvent(new Event("input", { bubbles: true }));
      again.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(view.rows()).toEqual(["Taken.pdf"]);
    await act(async () => {
      renames.pending[1]({ ok: false, message: "No access" });
      await Promise.resolve();
    });
    expect(view.rows()).toEqual(["Signed.pdf"]);
    expect(renames.toasts).toEqual(["No access"]);

    act(() => view.menuItem('RecordModel.fileRename {"name":"Signed.pdf"}')?.click());
    const cancelled = view.host.querySelector<HTMLInputElement>("[data-record-file-name-input]");
    act(() => {
      cancelled?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(view.host.querySelector("[data-record-file-name-input]")).toBeNull();
    expect(renames.calls).toHaveLength(2);

    form.disabled = true;
    view.redraw();
    expect(view.menuItem('RecordModel.fileRename {"name":"Signed.pdf"}')).toBeNull();
  });

  it("describes each file with its page count, size, uploader and age", () => {
    const uploader = "22222222-2222-4222-8222-222222222222";
    const view = render({
      files: [{ ...SAVED, pageCount: 2, uploadedById: uploader }],
      members: [{ id: uploader, firstName: "Lena", lastName: "Hoffmann", avatarUrl: null }],
    });
    expect(view.subtitle("Offer.pdf")).toBe('RecordModel.filePages {"count":2} · 2 KB · Lena Hoffmann · 2h ago');
    expect(view.row("Offer.pdf")?.querySelector("[data-file-badge]")?.textContent).toBe("PDF");
  });

  it("shows only the quiet add row while empty and outlines the list while files are dragged over it", async () => {
    form.value = [];
    const view = render({ files: [], label: "Documents" });
    expect(view.rows()).toEqual([]);
    expect(view.addRow()?.textContent).toBe('RecordModel.fileAddRow {"mode":"many"}');
    expect(view.host.querySelector("[data-record-file-count]")).toBeNull();
    const zone = view.host.querySelector<HTMLElement>("[data-record-file-add]")?.closest("ul")?.parentElement;
    if (!zone) throw new Error("The drop zone is missing");
    const dropped = new File(["dropped"], "dropped.md", { type: "text/markdown" });
    const drag = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", {
        value: { types: ["Files"], files: [dropped], dropEffect: "none" },
      });
      act(() => {
        zone.dispatchEvent(event);
      });
    };
    drag("dragover");
    expect(zone.hasAttribute("data-dragging")).toBe(true);
    expect(view.host.querySelector("[data-record-file-drop-overlay]")?.textContent).toBe(
      'RecordModel.fileDropOverlay {"field":"Documents"}',
    );
    drag("drop");
    await flush();
    expect(view.host.querySelector("[data-record-file-drop-overlay]")).toBeNull();
    expect(uploads.started.map((upload) => upload.file.name)).toEqual(["dropped.md"]);
    expect(view.row("dropped.md")?.querySelector("[data-file-badge]")?.textContent).toBe("MD");
  });

  it("edits a file field that holds several files with the file editor, not as lines of text", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.add(root);
    act(() =>
      root.render(createElement(RecordInputField, { field: field(true), id: "values.field-id", files: [SAVED] })),
    );
    expect(host.querySelector('[data-record-file-input="field-id"]')).not.toBeNull();
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.querySelector('[data-record-file="saved-file"]')).not.toBeNull();
  });
});
