import { afterEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import type { AppMode } from "@/core/config/environment";

import { Resource } from "@/generated/prisma";
import { AGENT_RECORD_ENTITIES } from "@/ee/agent-chat/ui-operations";

import { AgentUiControlStore } from "../ui-control.store";

function controlStore({
  appMode = "cloud",
  readable = Object.values(Resource),
}: { appMode?: AppMode; readable?: Resource[] } = {}) {
  return new AgentUiControlStore({
    appMode,
    userStore: { canAccess: (resource: Resource) => readable.includes(resource) },
  } as unknown as RootStore);
}

const CUSTOMER_SUCCESS_READS = Object.values(Resource).filter(
  (resource) => resource !== Resource.api && resource !== Resource.auditLog,
);

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

  it("refuses a page the user's role cannot open instead of reporting a navigation the server undoes", async () => {
    const navigate = vi.fn().mockResolvedValue("navigated");
    const store = controlStore({ readable: CUSTOMER_SUCCESS_READS });
    store.registerNavigate(navigate);

    for (const [targetId, route] of [
      ["nav-company-webhooks", "/company/webhooks"],
      ["nav-profile-api-keys", "/profile/api-keys"],
      ["nav-company-audit-logs", "/company/audit-logs"],
    ]) {
      await expect(store.navigate({ targetId })).resolves.toEqual({
        ok: false,
        result: `The page ${route} is not available to this user's role or installation; the app would redirect to the Dashboard. Tell the user instead of navigating or highlighting.`,
      });
    }
    expect(navigate).not.toHaveBeenCalled();

    await expect(store.navigate({ targetId: "nav-company-members" })).resolves.toMatchObject({ ok: true });
    expect(navigate).toHaveBeenCalledWith("/company/members");
  });

  it("refuses records and Cloud pages the sidebar hides for the role or installation", async () => {
    const navigate = vi.fn().mockResolvedValue("navigated");
    const withoutDeals = controlStore({ readable: Object.values(Resource).filter((r) => r !== Resource.deals) });
    withoutDeals.registerNavigate(navigate);
    await expect(
      withoutDeals.navigate({ entity: "deal", recordId: "00000000-0000-4000-8000-000000000001" }),
    ).resolves.toMatchObject({ ok: false });

    const selfHosted = controlStore({ appMode: "self-hosted" });
    selfHosted.registerNavigate(navigate);
    for (const targetId of ["nav-inbox", "nav-routines", "nav-profile-connected-accounts", "nav-company-subscription"])
      await expect(selfHosted.navigate({ targetId }), targetId).resolves.toMatchObject({ ok: false });
    expect(navigate).not.toHaveBeenCalled();

    await expect(selfHosted.navigate({ targetId: "nav-dashboard" })).resolves.toMatchObject({ ok: true });
  });
});

describe("AgentUiControlStore.highlight", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function element(clientRects: number) {
    return { isConnected: true, getClientRects: () => Array.from({ length: clientRects }), scrollIntoView: vi.fn() };
  }

  function onPage(pathname: string, getElementById: (id: string) => unknown = () => null) {
    vi.useFakeTimers();
    vi.stubGlobal("window", { location: { pathname } });
    vi.stubGlobal("document", { getElementById });
  }

  async function settled<T>(promise: Promise<T>) {
    await vi.advanceTimersByTimeAsync(2500);
    return promise;
  }

  it("names what the user must open when a target of the current page is not rendered", async () => {
    onPage("/de/company/members");

    await expect(settled(controlStore().highlight("member-modal-role"))).resolves.toEqual({
      ok: false,
      result:
        "Target member-modal-role belongs to this page but is not rendered right now. It may be inside a dialog, tab or menu the user must open first (a member row), or hidden by role, plan or state.",
    });
    expect((await settled(controlStore().highlight("company-members-search"))).result).toBe(
      "Target company-members-search belongs to this page but is not rendered right now. It may be inside a dialog, tab or menu the user must open first, or hidden by role, plan or state.",
    );
  });

  it("asks to navigate first when the target belongs to another page", async () => {
    onPage("/company/members");

    await expect(controlStore().highlight("webhook-modal-url")).resolves.toEqual({
      ok: false,
      result: "Target webhook-modal-url is not on the current page. Navigate first.",
    });
  });

  it("treats a mounted target without layout as not rendered instead of spotlighting nothing", async () => {
    const hidden = element(0);
    onPage("/profile/connected-accounts", (id) => (id === "connected-account-signature" ? hidden : null));
    const store = controlStore();

    await expect(settled(store.highlight("connected-account-signature"))).resolves.toEqual({
      ok: false,
      result:
        "Target connected-account-signature belongs to this page but is not rendered right now. It may be inside a dialog, tab or menu the user must open first (connected-account-tab-email), or hidden by role, plan or state.",
    });
    expect(store.active).toBeNull();
    expect(hidden.scrollIntoView).not.toHaveBeenCalled();
  });

  it("waits for a target of the current page that renders after the address changed", async () => {
    const currency = element(1);
    let lookups = 0;
    onPage("/company/settings", (id) => (id === "company-settings-currency" && ++lookups > 5 ? currency : null));
    const store = controlStore();

    await expect(settled(store.highlight("company-settings-currency"))).resolves.toEqual({
      ok: true,
      result: "Highlighted company-settings-currency.",
    });
    expect(store.active?.targetId).toBe("company-settings-currency");
    expect(currency.scrollIntoView).toHaveBeenCalled();
  });

  it("names the collapsed sidebar group of a sub-entry instead of asking to navigate", async () => {
    onPage("/de/dashboard");

    await expect(settled(controlStore().highlight("nav-company-members"))).resolves.toEqual({
      ok: false,
      result:
        "Target nav-company-members belongs to this page but is not rendered right now. It may be inside a dialog, tab or menu the user must open first (nav-company), or hidden by role, plan or state.",
    });
  });

  it("says the role cannot open the page of a target instead of asking to navigate first", async () => {
    onPage("/dashboard");
    const store = controlStore({ readable: CUSTOMER_SUCCESS_READS });
    const unavailable =
      "The page /company/webhooks is not available to this user's role or installation; the app would redirect to the Dashboard. Tell the user instead of navigating or highlighting.";

    await expect(settled(store.highlight("nav-company-webhooks"))).resolves.toEqual({
      ok: false,
      result: `Target nav-company-webhooks cannot be shown. ${unavailable}`,
    });
    await expect(store.highlight("company-webhooks-add")).resolves.toEqual({
      ok: false,
      result: `Target company-webhooks-add cannot be shown. ${unavailable}`,
    });
  });
});
