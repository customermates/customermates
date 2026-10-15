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
  transfers: [] as Transfer[],
}));
const opened = vi.hoisted(() => [] as unknown[]);

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
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
vi.mock("@/components/records/record-file-chips", () => ({
  useRecordFileSize: () => (bytes: number) => `${bytes} bytes`,
}));
vi.mock("@/components/records/record-file-links", () => ({
  openRecordFile: (file: unknown) => opened.push(file),
  recordFileIcon: () => () => null,
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => {
    void action();
  },
}));
vi.mock("@/app/[locale]/(protected)/inbox/components/attachment-row", async () => {
  const React = await import("react");
  return {
    AttachmentRow: (props: {
      name: string;
      subtitle: string | null;
      removeLabel?: string;
      onOpen?: () => void;
      onRemove?: () => void;
    }) =>
      React.createElement(
        "div",
        { "data-row": props.name },
        React.createElement("button", { "data-open": "", type: "button", onClick: props.onOpen }, props.name),
        React.createElement("span", { "data-subtitle": "" }, props.subtitle),
        props.onRemove
          ? React.createElement("button", { "aria-label": props.removeLabel, type: "button", onClick: props.onRemove })
          : null,
      ),
  };
});
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({ userStore: { user: null } }) }));
vi.mock("@/app/[locale]/(protected)/settings/(workspace)/actions", () => ({ getActiveUsersAction: vi.fn() }));
vi.mock("@/app/[locale]/(protected)/records/actions", () => ({
  lookupAddressAction: vi.fn(),
  verifyAddressAction: vi.fn(),
}));
vi.mock("../record-file-upload", () => ({
  startRecordFileUpload: (input: { typeId: string; fieldId: string; file: File }) => {
    uploads.started.push(input);
    if (uploads.refusal) return Promise.resolve({ ok: false, message: uploads.refusal });
    return Promise.resolve({
      ok: true,
      data: {
        fileId: `uploaded-${uploads.started.length}`,
        upload: { url: "https://store.test/put", method: "PUT", headers: {}, expiresAt: "2026-10-15T10:00:00.000Z" },
      },
    });
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
import { RecordInputField } from "../record-input-field";

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

function render(options: { multiple?: boolean; files?: RecordFileSummary[] } = {}) {
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
          label: null,
          files: options.files ?? [SAVED],
        }),
      ),
    );
  draw();
  return {
    host,
    redraw: draw,
    rows: () => [...host.querySelectorAll("[data-row]")].map((row) => row.getAttribute("data-row")),
    subtitle: (name: string) => host.querySelector(`[data-row="${name}"] [data-subtitle]`)?.textContent,
    button: (label: string) =>
      [...host.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === label) ?? null,
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
  uploads.transfers.length = 0;
  opened.length = 0;
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
    expect(view.subtitle("notes.txt")).toBe('RecordModel.fileUploading {"progress":0.5}');
    expect(view.host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("50");

    uploads.transfers[1].finish({ ok: true });
    await flush();
    expect(form.value).toEqual(["saved-file", "uploaded-2"]);
    uploads.transfers[0].finish({ ok: true });
    await flush();
    expect(form.value).toEqual(["saved-file", "uploaded-2", "uploaded-1"]);
    view.redraw();
    expect(view.rows()).toEqual(["Offer.pdf", "sheet.csv", "notes.txt"]);
    expect(view.subtitle("notes.txt")).toBe("5 bytes");
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

  it("replaces the file of a single-file field after the new upload finished", async () => {
    const view = render({ multiple: false });
    expect(view.host.querySelector('input[type="file"]')?.hasAttribute("multiple")).toBe(false);
    expect(view.host.textContent).toContain('RecordModel.fileAdd {"mode":"one"}');
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
    const add = [...view.host.querySelectorAll("button")].find(
      (button) => button.textContent === 'RecordModel.fileAdd {"mode":"many"}',
    );
    expect(add?.disabled).toBe(true);
    expect(view.host.querySelector('[role="group"]')?.id).toBe("values.field-id");
  });

  it("opens and removes saved files and offers no changes while the form is read-only", () => {
    const view = render();
    act(() => view.host.querySelector<HTMLButtonElement>('[data-row="Offer.pdf"] [data-open]')?.click());
    expect(opened).toEqual([SAVED]);
    act(() => view.button('RecordModel.fileRemove {"name":"Offer.pdf"}')?.click());
    expect(form.value).toEqual([]);

    form.value = ["saved-file"];
    form.disabled = true;
    view.redraw();
    expect(view.host.querySelector('input[type="file"]')).toBeNull();
    expect(view.button('RecordModel.fileRemove {"name":"Offer.pdf"}')).toBeNull();
    expect(view.rows()).toEqual(["Offer.pdf"]);
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
    expect(host.querySelector('[data-row="Offer.pdf"]')).not.toBeNull();
  });
});
