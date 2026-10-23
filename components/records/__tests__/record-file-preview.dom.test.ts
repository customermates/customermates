import type { ReactNode } from "react";
import type { PreviewFile, RecordFileSet } from "../record-file-preview";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const downloaded = vi.hoisted(() => [] as unknown[]);

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumber: (value: number) => String(value), formatRelativeTime: () => "2h ago" }),
}));
vi.mock("../record-file-links", () => ({
  downloadRecordFile: (file: unknown) => downloaded.push(file),
  recordFileContentUrl: (id: string) => `/api/v1/files/${id}/content`,
}));
vi.mock("../record-file-document-preview", async () => {
  const React = await import("react");
  return {
    RecordFileDocumentPreview: ({ file }: { file: { name: string } }) =>
      React.createElement("div", { "data-document-preview": file.name }),
  };
});
vi.mock("@/components/ui/icon-button", async () => {
  const React = await import("react");
  return {
    IconButton: ({ label, onClick }: { label: string; onClick?: () => void }) =>
      React.createElement("button", { "aria-label": label, type: "button", onClick }),
  };
});
vi.mock("@/components/modal/app-modal", async () => {
  const React = await import("react");
  return {
    AppModalTitle: ({ children }: { children: ReactNode }) => React.createElement("h2", null, children),
    AppModal: ({
      open,
      title,
      actions,
      children,
      onClose,
    }: {
      open: boolean;
      title: string;
      actions: Array<{ id: string; label: string; href?: string; onClick?: () => void }>;
      children: ReactNode;
      onClose: () => void;
    }) =>
      open
        ? React.createElement(
            "div",
            { role: "dialog", "aria-label": title },
            actions.map((action) =>
              action.href
                ? React.createElement("a", {
                    key: action.id,
                    "aria-label": action.label,
                    "data-action": action.id,
                    href: action.href,
                  })
                : React.createElement("button", {
                    key: action.id,
                    "aria-label": action.label,
                    "data-action": action.id,
                    type: "button",
                    onClick: action.onClick,
                  }),
            ),
            React.createElement("button", { "data-close": "", type: "button", onClick: onClose }),
            children,
          )
        : null,
  };
});

import { useRecordFilePreview } from "../record-file-preview";

const FILES: PreviewFile[] = [
  {
    id: "pdf",
    name: "Offer.pdf",
    mimeType: "application/pdf",
    size: 1024,
    pageCount: 2,
    uploadedAt: "2026-10-23T08:00:00.000Z",
    uploadedById: "user",
  },
  {
    id: "sheet",
    name: "Prices.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 7168,
  },
  { id: "image", name: "Screen.png", mimeType: "image/png", size: 336896 },
  { id: "archive", name: "Bundle.zip", mimeType: "application/zip", size: 10 },
];

const roots = new Set<Root>();
let open: (set: RecordFileSet) => void = () => undefined;

function Harness() {
  const preview = useRecordFilePreview();
  open = (set) => preview.openFiles(set, null);
  return createElement("div", null, preview.preview);
}

function render() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.add(root);
  act(() => root.render(createElement(Harness)));
  return {
    host,
    open: (set: RecordFileSet) => act(() => open(set)),
    shown: () => host.querySelector("[data-record-file-preview-file]")?.getAttribute("data-record-file-preview-file"),
    position: () => host.querySelector("[data-record-file-position]")?.textContent,
    meta: () => host.querySelector("[data-record-file-preview-meta]")?.textContent,
    button: (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`),
    key: (key: string, target?: Element | null) =>
      act(() => {
        (target ?? host.querySelector("[role=dialog]"))?.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        );
      }),
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  downloaded.length = 0;
  Object.defineProperty(navigator, "pdfViewerEnabled", { configurable: true, value: true });
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.innerHTML = "";
});

describe("record file preview", () => {
  it("steps through the field's files with the buttons and the arrow keys, wrapping at both ends", () => {
    const view = render();
    view.open({ files: FILES, index: 1, group: "Documents", uploaderName: () => "Max Bergmann" });
    expect(view.shown()).toBe("sheet");
    expect(view.position()).toBe('RecordModel.filePositionIn {"position":2,"count":4,"group":"Documents"}');
    expect(view.host.querySelector("[data-document-preview]")?.getAttribute("data-document-preview")).toBe(
      "Prices.xlsx",
    );

    act(() => view.button("RecordModel.fileNext")?.click());
    expect(view.shown()).toBe("image");
    view.key("ArrowRight");
    expect(view.shown()).toBe("archive");
    view.key("ArrowRight");
    expect(view.shown()).toBe("pdf");
    view.key("ArrowLeft");
    expect(view.shown()).toBe("archive");
    act(() => view.button("RecordModel.filePrevious")?.click());
    expect(view.shown()).toBe("image");
  });

  it("leaves arrow keys to text fields and sheet tabs inside the preview", () => {
    const view = render();
    view.open({ files: FILES, index: 0 });
    const tabs = document.createElement("div");
    tabs.setAttribute("role", "tablist");
    view.host.querySelector("[data-record-file-preview-file]")?.append(tabs);
    view.key("ArrowRight", tabs);
    expect(view.shown()).toBe("pdf");
    expect(view.position()).toBe('RecordModel.filePosition {"position":1,"count":4}');
  });

  it("shows a PDF in the browser's viewer with its metadata, opens it in a new tab and downloads it", () => {
    const view = render();
    view.open({ files: FILES, index: 0, group: "Documents", uploaderName: () => "Max Bergmann" });
    expect(view.host.querySelector("iframe[data-record-file-pdf]")?.getAttribute("src")).toBe(
      "/api/v1/files/pdf/content",
    );
    expect(view.meta()).toBe(
      'FileTypes.pdf · RecordModel.filePages {"count":2} · 1 KB · RecordModel.fileAddedBy {"name":"Max Bergmann"} · 2h ago',
    );
    expect(view.host.querySelector('a[data-action="open-file"]')?.getAttribute("href")).toBe(
      "/api/v1/files/pdf/content",
    );
    act(() => view.host.querySelector<HTMLButtonElement>('[data-action="download-file"]')?.click());
    expect(downloaded).toEqual([FILES[0]]);
  });

  it("falls back to a download when the browser has no PDF viewer and for types without a preview", () => {
    Object.defineProperty(navigator, "pdfViewerEnabled", { configurable: true, value: false });
    const view = render();
    view.open({ files: FILES, index: 0 });
    expect(view.host.querySelector("iframe")).toBeNull();
    expect(view.host.textContent).toContain("RecordModel.filePreviewUnavailable");

    view.open({ files: FILES, index: 3 });
    expect(view.host.textContent).toContain("RecordModel.fileDocumentPreviewUnavailable");
    expect(view.host.querySelector('a[data-action="open-file"]')).toBeNull();
    expect(view.meta()).toBe("FileTypes.archive · 10 B");
  });

  it("shows an image with its pixel size once it loaded and hides the stepper for a single file", () => {
    const view = render();
    view.open({ files: [FILES[2]], index: 0 });
    const image = view.host.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("Screen.png");
    if (!image) throw new Error("The image is missing");
    Object.defineProperty(image, "naturalWidth", { value: 1440 });
    Object.defineProperty(image, "naturalHeight", { value: 900 });
    act(() => {
      image.dispatchEvent(new Event("load"));
    });
    expect(view.meta()).toBe('FileTypes.image · RecordModel.fileDimensions {"width":"1440","height":"900"} · 329 KB');
    expect(view.position()).toBeUndefined();
    expect(view.button("RecordModel.fileNext")).toBeNull();
    act(() => view.host.querySelector<HTMLButtonElement>("[data-close]")?.click());
    expect(view.shown()).toBeUndefined();
  });
});
