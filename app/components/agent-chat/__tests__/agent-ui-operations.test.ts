import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("AgentUiControlStore.highlight", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function onPage(pathname: string) {
    vi.stubGlobal("window", { location: { pathname } });
    vi.stubGlobal("document", { getElementById: () => null });
  }

  it("names what the user must open when a target of the current page is not rendered", () => {
    onPage("/de/company/members");

    expect(controlStore().highlight("member-modal-role")).toEqual({
      ok: false,
      result:
        "Target member-modal-role belongs to this page but is not rendered right now. It may be inside a dialog, tab or menu the user must open first (a member row), or hidden by role, plan or state.",
    });
    expect(controlStore().highlight("company-members-search").result).toBe(
      "Target company-members-search belongs to this page but is not rendered right now. It may be inside a dialog, tab or menu the user must open first, or hidden by role, plan or state.",
    );
  });

  it("asks to navigate first when the target belongs to another page", () => {
    onPage("/company/members");

    expect(controlStore().highlight("webhook-modal-url")).toEqual({
      ok: false,
      result: "Target webhook-modal-url is not on the current page. Navigate first.",
    });
  });
});
