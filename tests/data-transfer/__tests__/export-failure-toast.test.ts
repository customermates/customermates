// @vitest-environment jsdom

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { act } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("@/core/observability/browser", () => ({ captureException: mocks.captureException }));
vi.mock("@/components/entity-terminology/use-column-label", () => ({
  useColumnLabel: () => (columnId: string) => `label:${columnId}`,
}));
const stableTranslate = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => stableTranslate }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

const { useExportAction } = await import("@/features/data-transfer/export/use-export-download");
const { registerApplicationErrorHandler, runUserAction } = await import("@/core/errors/report-application-error");

const store = {
  entityType: "contact",
  customColumns: [],
  visibleColumns: [{ uid: "name" }],
  filters: [],
  searchTerm: "",
  sortDescriptor: undefined,
  hasSelection: false,
  selectedIds: new Set<string>(),
} as unknown as BaseDataViewStore<HasId>;

let container: HTMLDivElement;
let root: Root;
let unregister: () => void;
const applicationErrors: unknown[] = [];

function renderedAction(): () => Promise<void> {
  const captured: Array<() => Promise<void>> = [];

  function Probe() {
    captured.push(useExportAction(store));
    return null;
  }

  act(() => root.render(jsx(Probe, {})));

  const action = captured.at(-1);
  if (!action) throw new Error("the export hook never rendered");
  return action;
}

async function runFromMenu(action: () => Promise<void>) {
  await act(async () => {
    runUserAction(() => action());
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  applicationErrors.length = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  unregister = registerApplicationErrorHandler((error) => applicationErrors.push(error));
});

afterEach(() => {
  unregister();
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("export failure feedback", () => {
  it.each([403, 400, 500])(
    "shows only the localized export toast for a %s response and reports no unexpected error",
    async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status, headers: { get: () => null } }));

      await runFromMenu(renderedAction());

      expect(mocks.toast.error).toHaveBeenCalledExactlyOnceWith("DataTransfer.export.failed");
      expect(applicationErrors).toEqual([]);
      expect(mocks.captureException).not.toHaveBeenCalled();
    },
  );

  it("leaves a thrown failure to the application error handler alone, without a second localized toast", async () => {
    const interrupted = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(interrupted));

    await runFromMenu(renderedAction());

    expect(applicationErrors).toEqual([interrupted]);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("still confirms a successful export", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(new Blob()),
        headers: { get: (name: string) => (name === "x-export-row-count" ? "3" : null) },
      }),
    );
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:stub", revokeObjectURL: () => {} });

    await runFromMenu(renderedAction());

    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(applicationErrors).toEqual([]);
  });
});
