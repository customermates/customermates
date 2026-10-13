import { beforeEach, describe, expect, it, vi } from "vitest";

import { createZodError } from "@/core/validation/validation.utils";

const mocks = vi.hoisted(() => ({ discover: vi.fn() }));

vi.mock("@/core/di", () => ({
  getDiscoverRecordTypesInteractor: () => ({ invoke: mocks.discover }),
}));

import { discoverWidgetRecordTypesAction } from "../actions";

function type(id: string, permittedActions: string[]) {
  return { id, label: id, permittedActions };
}

beforeEach(() => vi.clearAllMocks());

describe("discoverWidgetRecordTypesAction", () => {
  it("returns readable record types, including embedded ones, with the discovered total", async () => {
    mocks.discover.mockResolvedValue({
      ok: true,
      data: {
        types: [type("own", ["readOwn"]), type("all", ["readAll", "update"]), type("hidden", ["create"])],
        total: 3,
      },
    });

    await expect(discoverWidgetRecordTypesAction({ searchTerm: "deal" })).resolves.toEqual({
      items: [type("own", ["readOwn"]), type("all", ["readAll", "update"])],
      total: 3,
    });
    expect(mocks.discover).toHaveBeenCalledExactlyOnceWith({
      search: "deal",
      includeEmbedded: true,
      page: 1,
      pageSize: 100,
    });
  });

  it("keeps a genuinely empty result empty", async () => {
    mocks.discover.mockResolvedValue({ ok: true, data: { types: [], total: 0 } });

    await expect(discoverWidgetRecordTypesAction({})).resolves.toEqual({ items: [], total: 0 });
  });

  it("rejects a validation failure instead of reporting no record types", async () => {
    const error = createZodError("Too long", ["search"]);
    mocks.discover.mockResolvedValue({ ok: false, error });

    await expect(discoverWidgetRecordTypesAction({ searchTerm: "x".repeat(201) })).rejects.toBe(error);
  });
});
