import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { RequestedColumnInput } from "../data-transfer.schema";

import { act } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/entity-terminology/use-column-label", () => ({
  useColumnLabel: () => (columnId: string) => `label:${columnId}`,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

const { useExportDownload } = await import("../export/use-export-download");

let container: HTMLDivElement;
let root: Root;

function storeFor(entityType: string, uids: string[]) {
  return {
    entityType,
    customColumns: [],
    visibleColumns: uids.map((uid) => ({ uid })),
    filters: [],
    searchTerm: "",
    sortDescriptor: undefined,
    hasSelection: false,
    selectedIds: new Set<string>(),
  } as unknown as BaseDataViewStore<HasId>;
}

async function requestedColumns(entityType: string, uids: string[]): Promise<RequestedColumnInput[]> {
  const captured: Array<() => Promise<unknown>> = [];

  function Probe() {
    captured.push(useExportDownload(storeFor(entityType, uids)));
    return null;
  }

  act(() => root.render(jsx(Probe, {})));

  let body = "";
  const fetchMock = vi.fn((_url: string, init: { body: string }) => {
    body = init.body;
    return Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob()),
      headers: { get: () => null },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:stub", revokeObjectURL: () => {} });

  const download = captured.at(-1);
  if (!download) throw new Error("the export hook never rendered");

  await act(async () => {
    await download();
  });

  return JSON.parse(body).columns;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("requested export columns", () => {
  it("always asks for notes, which no data view lists as a column", async () => {
    for (const entityType of ["contact", "organization", "deal", "service", "task"]) {
      const columns = await requestedColumns(entityType, ["name"]);

      expect(columns.at(-1), `${entityType} export is missing its notes column`).toEqual({
        key: "notes",
        header: "label:notes",
      });
    }
  });

  it("does not ask for notes twice if a view ever exposes it as a column", async () => {
    const columns = await requestedColumns("deal", ["name", "notes"]);

    expect(columns.filter((column) => column.key === "notes")).toHaveLength(1);
  });

  it("splits a contact name into the two fields an import can create from", async () => {
    const columns = await requestedColumns("contact", ["name"]);

    expect(columns.slice(0, 2)).toEqual([
      { key: "firstName", header: "label:firstName" },
      { key: "lastName", header: "label:lastName" },
    ]);
  });

  it("expands contact channels into one importable column per provider", async () => {
    const columns = await requestedColumns("contact", ["channels"]);

    expect(columns.map((column) => column.key)).toEqual([
      "identifier:mail",
      "identifier:linkedin",
      "identifier:whatsapp",
      "identifier:instagram",
      "identifier:telegram",
      "notes",
    ]);
  });
});
