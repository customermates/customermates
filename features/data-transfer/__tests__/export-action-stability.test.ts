import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { act } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/entity-terminology/use-column-label", () => ({
  useColumnLabel: () => (columnId: string) => `label:${columnId}`,
}));
const stableTranslate = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => stableTranslate }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

const { useExportAction, useExportDownload } = await import("../export/use-export-download");

let container: HTMLDivElement;
let root: Root;

const observed = { action: [] as unknown[], download: [] as unknown[] };

const store = { entityType: "contact", customColumns: [], visibleColumns: [] } as unknown as BaseDataViewStore<HasId>;

function Probe() {
  observed.action.push(useExportAction(store));
  observed.download.push(useExportDownload(store));
  return null;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  observed.action = [];
  observed.download = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("export handler identity", () => {
  it("stays stable across re-renders, so the top bar memo cannot loop", () => {
    act(() => root.render(jsx(Probe, {})));
    act(() => root.render(jsx(Probe, {})));
    act(() => root.render(jsx(Probe, {})));

    expect(observed.action.length).toBeGreaterThanOrEqual(3);
    expect(new Set(observed.action).size).toBe(1);
    expect(new Set(observed.download).size).toBe(1);
  });
});
