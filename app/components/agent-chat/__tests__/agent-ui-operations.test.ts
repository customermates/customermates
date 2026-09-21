import { describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";

import { AGENT_RECORD_ENTITIES } from "@/ee/agent-chat/ui-operations";

import { AgentUiControlStore } from "../ui-control.store";

function controlStore() {
  return new AgentUiControlStore({} as RootStore);
}

describe("AgentUiControlStore.navigate", () => {
  it("opens an existing record on its page from entity and record id and propagates a blocked navigation", async () => {
    const navigate = vi.fn().mockResolvedValue("navigated");
    const store = controlStore();
    store.registerNavigate(navigate);

    await expect(store.navigate({ entity: "deal", recordId: "00000000-0000-4000-8000-000000000001" })).resolves.toEqual(
      {
        ok: true,
        result: "Opened the deal on its page.",
      },
    );
    expect(navigate).toHaveBeenLastCalledWith("/deals/00000000-0000-4000-8000-000000000001");

    await expect(store.navigate({ entity: "contact", recordId: "new" })).resolves.toMatchObject({ ok: false });
    await expect(
      store.navigate({ entity: "company", recordId: "00000000-0000-4000-8000-000000000001" }),
    ).resolves.toMatchObject({
      ok: false,
    });
    expect(navigate).toHaveBeenCalledTimes(1);

    navigate.mockResolvedValue("blocked");
    await expect(
      store.navigate({ entity: "task", recordId: "00000000-0000-4000-8000-000000000002" }),
    ).resolves.toMatchObject({
      ok: false,
      result: "Navigation requires the user to resolve unsaved changes.",
    });
  });

  it("never builds a drawer path for any record type", async () => {
    const navigate = vi.fn().mockResolvedValue("navigated");
    const store = controlStore();
    store.registerNavigate(navigate);

    for (const entity of AGENT_RECORD_ENTITIES)
      await store.navigate({ entity, recordId: "00000000-0000-4000-8000-000000000003" });

    expect(navigate).toHaveBeenCalledTimes(AGENT_RECORD_ENTITIES.length);
    for (const [path] of navigate.mock.calls) expect(String(path)).not.toContain("?open=");
  });
});
