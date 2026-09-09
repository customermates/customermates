import { describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";

import { AgentUiControlStore } from "../ui-control.store";

function controlStore() {
  return new AgentUiControlStore({} as RootStore);
}

describe("AgentUiControlStore.openRecord", () => {
  it("builds page and drawer paths and propagates a blocked navigation", async () => {
    const navigate = vi.fn().mockResolvedValue("navigated");
    const store = controlStore();
    store.registerNavigate(navigate);

    await store.openRecord({
      entity: "deal",
      recordId: "00000000-0000-4000-8000-000000000001",
      presentation: "page",
    });
    expect(navigate).toHaveBeenLastCalledWith("/deals/00000000-0000-4000-8000-000000000001");

    await store.openRecord({ entity: "contact", recordId: "new" });
    expect(navigate).toHaveBeenLastCalledWith("/contacts?open=contact:new");

    navigate.mockResolvedValue("blocked");
    const blocked = await store.openRecord({
      entity: "task",
      recordId: "00000000-0000-4000-8000-000000000002",
    });
    expect(blocked).toMatchObject({
      ok: false,
      result: "Navigation requires the user to resolve unsaved changes.",
    });
  });
});
