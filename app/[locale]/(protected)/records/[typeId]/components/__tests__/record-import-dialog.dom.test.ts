import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordExportSchema } from "@/features/data-transfer/record-transfer.schema";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/core/errors/report-application-error", () => ({ runUserAction: (run: () => Promise<void>) => void run() }));
vi.mock("@/components/modal", async () => {
  const React = await import("react");
  return {
    AppModal: ({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) =>
      open
        ? React.createElement(
            "div",
            { role: "dialog" },
            React.createElement("button", { onClick: onClose }, "Close"),
            children,
          )
        : null,
  };
});
import { RecordImportDialog } from "../record-import-dialog";

const typeId = "10000000-0000-4000-8000-000000000001";
let root: Root;
let container: HTMLElement;
const fetchMock = vi.fn();
const onImported = vi.fn();
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function document(recordId: string) {
  const time = "2026-10-02T12:00:00.000Z";
  return RecordExportSchema.parse({
    format: "customermates-records",
    version: 1,
    typeId,
    schemaRevision: 1,
    exportedAt: time,
    records: [
      {
        ref: { typeId, recordId },
        version: 1,
        schemaRevision: 1,
        createdAt: time,
        updatedAt: time,
        fields: [],
        assignedUserIds: [],
        assignedUsers: [],
        relationships: [],
      },
    ],
    links: [],
  });
}
function Harness() {
  const [open, setOpen] = useState(true);
  return createElement(
    "div",
    null,
    createElement("button", { onClick: () => setOpen(true) }, "Reopen"),
    createElement(RecordImportDialog, { open, onOpenChange: setOpen, typeId, schemaRevision: 1, onImported }),
  );
}
function button(label: string) {
  const element = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === label);
  if (!element) throw new Error(`Missing button ${label}`);
  return element;
}
async function select(name: string, contents: Promise<string>) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["fixture"], name, { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => contents });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ created: 1, updated: 0 }) });
  onImported.mockReset();
  onImported.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetchMock);
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(Harness)));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("record import selection ownership", () => {
  it("imports the latest selected file when an earlier file finishes parsing later", async () => {
    const earlier = deferred<string>();
    const a = document("10000000-0000-4000-8000-000000000002");
    const b = document("10000000-0000-4000-8000-000000000003");
    await select("Earlier.json", earlier.promise);
    await select("Latest.json", Promise.resolve(JSON.stringify(b)));
    await act(async () => {
      earlier.resolve(JSON.stringify(a));
      await earlier.promise;
    });
    expect(container.textContent).toContain("Latest.json");
    expect(container.textContent).not.toContain("Earlier.json");
    await act(async () => {
      button("DataTransfer.recordImport.submit").click();
      await Promise.resolve();
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).document).toEqual(b);
  });

  it("does not restore a file or enable import after its modal closes and reopens", async () => {
    const earlier = deferred<string>();
    await select("Earlier.json", earlier.promise);
    act(() => button("Close").click());
    act(() => button("Reopen").click());
    await act(async () => {
      earlier.resolve(JSON.stringify(document("10000000-0000-4000-8000-000000000002")));
      await earlier.promise;
    });
    expect(container.textContent).not.toContain("Earlier.json");
    expect(button("DataTransfer.recordImport.submit").disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
