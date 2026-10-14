import { describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("@/core/di", () => ({ getGetIdentityRecordChoicesInteractor: () => ({ invoke: lookup }) }));
import { getIdentityRecordChoicesAction } from "../actions";

describe("inbox identity choice adapter", () => {
  it("passes the search to the authorized capability lookup", async () => {
    const data = { records: [], createTypes: [], schemaRevision: 2, canManage: false };
    lookup.mockResolvedValue({ ok: true, data });
    await expect(getIdentityRecordChoicesAction("Ada")).resolves.toEqual(data);
    expect(lookup).toHaveBeenCalledExactlyOnceWith({ search: "Ada" });
  });
});
