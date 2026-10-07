import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import type { AppMode } from "@/core/config/environment";

import { Resource } from "@/generated/prisma";
import { getRecordAction, getRecordNavigationAction } from "@/app/[locale]/(protected)/records/actions";
vi.mock("@/app/[locale]/(protected)/records/actions", () => ({
  getRecordAction: vi.fn(),
  getRecordNavigationAction: vi.fn(),
}));
const RECORD_TYPES = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
  "10000000-0000-4000-8000-000000000006",
];
beforeEach(() => vi.mocked(getRecordAction).mockResolvedValue({ ok: true, data: {} } as never));

import { AgentUiControlStore, findAgentTargetElement } from "../ui-control.store";

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
  it("opens an existing record on its page from type and record id and propagates a blocked navigation", async () => {
    const navigate = vi.fn().mockResolvedValue("navigated");
    const store = controlStore();
    store.registerNavigate(navigate);

    await expect(
      store.navigate({ typeId: RECORD_TYPES[0], recordId: "00000000-0000-4000-8000-000000000001" }),
    ).resolves.toEqual({
      ok: true,
      result: "Opened the record on its page.",
    });
    expect(navigate).toHaveBeenLastCalledWith(`/records/${RECORD_TYPES[0]}/00000000-0000-4000-8000-000000000001`);

    await expect(store.navigate({ typeId: RECORD_TYPES[2], recordId: "new" })).resolves.toMatchObject({ ok: false });
    await expect(
      store.navigate({ entity: "company", recordId: "00000000-0000-4000-8000-000000000001" }),
    ).resolves.toMatchObject({
      ok: false,
    });
    expect(navigate).toHaveBeenCalledTimes(1);

    navigate.mockResolvedValue("blocked");
    await expect(
      store.navigate({ typeId: RECORD_TYPES[1], recordId: "00000000-0000-4000-8000-000000000002" }),
    ).resolves.toMatchObject({
      ok: false,
      result: "Navigation requires the user to resolve unsaved changes.",
    });
  });

  it("rechecks record visibility before opening a page and type access before using a list target", async () => {
    const navigate = vi.fn().mockResolvedValue("navigated");
    const store = controlStore();
    store.registerNavigate(navigate);
    vi.mocked(getRecordAction).mockResolvedValueOnce({ ok: false, error: {} } as never);
    await expect(
      store.navigate({ typeId: RECORD_TYPES[0], recordId: "00000000-0000-4000-8000-000000000001" }),
    ).resolves.toMatchObject({ ok: false });
    expect(navigate).not.toHaveBeenCalled();
    vi.mocked(getRecordNavigationAction).mockResolvedValue({
      companyId: "company",
      schemaRevision: 1,
      canManageSchema: false,
      types: [],
    });
    await expect(store.navigate({ targetId: `nav-records:${RECORD_TYPES[0]}` })).resolves.toMatchObject({ ok: false });
    expect(navigate).not.toHaveBeenCalled();
    vi.mocked(getRecordNavigationAction).mockResolvedValue({
      companyId: "company",
      schemaRevision: 1,
      canManageSchema: false,
      types: [
        {
          id: RECORD_TYPES[0],
          label: "Project",
          pluralLabel: "Projects",
          icon: "folder",
          canCreate: false,
          hasAuthorizationTasks: false,
        },
      ],
    });
    await expect(store.navigate({ targetId: `nav-records:${RECORD_TYPES[0]}` })).resolves.toMatchObject({ ok: true });
    expect(navigate).toHaveBeenLastCalledWith(`/records/${RECORD_TYPES[0]}`);
  });

  it("never builds a drawer path for any record type", async () => {
    const navigate = vi.fn().mockResolvedValue("navigated");
    const store = controlStore();
    store.registerNavigate(navigate);

    for (const typeId of RECORD_TYPES)
      await store.navigate({ typeId, recordId: "00000000-0000-4000-8000-000000000003" });

    expect(navigate).toHaveBeenCalledTimes(RECORD_TYPES.length);
    for (const [path] of navigate.mock.calls) expect(String(path)).not.toContain("?open=");
  });

  it("refuses a page the user's role cannot open instead of reporting a navigation the server undoes", async () => {
    const navigate = vi.fn().mockResolvedValue("navigated");
    const store = controlStore({ readable: CUSTOMER_SUCCESS_READS });
    store.registerNavigate(navigate);

    for (const [targetId, route] of [
      ["nav-company-webhooks", "/company/webhooks"],
      ["nav-profile-api-keys", "/profile/api-keys"],
      ["nav-company-activity", "/company/activity"],
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
    const withoutRecord = controlStore();
    withoutRecord.registerNavigate(navigate);
    vi.mocked(getRecordAction).mockResolvedValueOnce({ ok: false, error: {} } as never);
    await expect(
      withoutRecord.navigate({ typeId: RECORD_TYPES[0], recordId: "00000000-0000-4000-8000-000000000001" }),
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

  function element(clientRects: number, { rail = false } = {}) {
    return {
      isConnected: true,
      getClientRects: () => Array.from({ length: clientRects }),
      scrollIntoView: vi.fn(),
      closest: (selector: string) => (rail && selector === '[data-collapsible="icon"]' ? {} : null),
    };
  }

  function onPage(
    pathname: string,
    getElementById: (id: string) => unknown = () => null,
    loading: () => boolean = () => false,
  ) {
    vi.useFakeTimers();
    const lookup = vi.fn(getElementById);
    vi.stubGlobal("window", { location: { pathname } });
    vi.stubGlobal("document", {
      getElementById: lookup,
      querySelector: (selector: string) => (selector === 'main [data-page-state="loading"]' && loading() ? {} : null),
    });
    return lookup;
  }

  it("resolves shared controls only on their declared record type's page", () => {
    const search = element(1);
    onPage(`/en/records/${RECORD_TYPES[0]}`, (id) => (id === "records-search" ? search : null));
    expect(findAgentTargetElement(`records:${RECORD_TYPES[0]}:search`)).toBe(search);
    expect(findAgentTargetElement(`records:${RECORD_TYPES[1]}:search`)).toBeNull();
  });

  function onSidebarPage(pathname: string, elements: Record<string, ReturnType<typeof element>>) {
    onPage(pathname, (id) => (id === "sidebar-trigger" ? element(1) : (elements[id] ?? null)));
  }

  async function immediately<T>(promise: Promise<T>) {
    let outcome: T | undefined;
    void promise.then((value) => {
      outcome = value;
    });
    await vi.advanceTimersByTimeAsync(0);
    return outcome;
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
    onSidebarPage("/de/dashboard", { "nav-company": element(1) });

    await expect(settled(controlStore().highlight("nav-company-members"))).resolves.toEqual({
      ok: false,
      result:
        "Target nav-company-members is a sidebar entry that is not visible right now. Ask the user to open nav-company in the sidebar, then highlight it again.",
    });
  });

  it("highlights a sub-entry of a group that is already open without asking for the group toggle", async () => {
    const members = element(1);
    onSidebarPage("/company/settings", { "nav-company": element(1), "nav-company-members": members });
    const store = controlStore();

    await expect(store.highlight("nav-company-members")).resolves.toEqual({
      ok: true,
      result: "Highlighted nav-company-members.",
    });
    expect(members.scrollIntoView).toHaveBeenCalled();
  });

  it("asks to expand the icon rail instead of toggling the group that hides the entry", async () => {
    onSidebarPage("/company/settings", {
      "nav-company": element(1, { rail: true }),
      "nav-company-members": element(0),
    });

    expect((await settled(controlStore().highlight("nav-company-members"))).result).toBe(
      "Target nav-company-members is a sidebar entry that is not visible right now. Ask the user to expand the collapsed sidebar with the sidebar button at the top left of the header, then highlight it again.",
    );

    onSidebarPage("/dashboard", { "nav-company": element(1, { rail: true }) });
    expect((await settled(controlStore().highlight("nav-company-members"))).result).toBe(
      "Target nav-company-members is a sidebar entry that is not visible right now. Ask the user to expand the collapsed sidebar with the sidebar button at the top left of the header, then open nav-company in it, then highlight it again.",
    );
  });

  it("asks to open the phone sidebar instead of naming a group toggle that is not on screen", async () => {
    onSidebarPage("/dashboard", {});
    expect((await settled(controlStore().highlight("nav-company-members"))).result).toBe(
      "Target nav-company-members is a sidebar entry that is not visible right now. Ask the user to open the sidebar with the sidebar button at the top left of the header, then open nav-company in it, then highlight it again.",
    );
    expect((await settled(controlStore().highlight("nav-dashboard"))).result).toBe(
      "Target nav-dashboard is a sidebar entry that is not visible right now. Ask the user to open the sidebar with the sidebar button at the top left of the header, then highlight it again.",
    );

    onSidebarPage("/en/company/settings", {});
    expect((await settled(controlStore().highlight("nav-company-roles"))).result).toBe(
      "Target nav-company-roles is a sidebar entry that is not visible right now. Ask the user to open the sidebar with the sidebar button at the top left of the header, then highlight it again.",
    );
  });

  it("says the role cannot open the page of a target at once instead of waiting for it or asking to navigate", async () => {
    const lookup = onPage("/dashboard");
    const store = controlStore({ readable: CUSTOMER_SUCCESS_READS });
    const unavailable =
      "The page /company/webhooks is not available to this user's role or installation; the app would redirect to the Dashboard. Tell the user instead of navigating or highlighting.";

    for (const targetId of ["nav-company-webhooks", "company-webhooks-add"]) {
      expect(await immediately(store.highlight(targetId)), targetId).toEqual({
        ok: false,
        result: `Target ${targetId} cannot be shown. ${unavailable}`,
      });
    }
    expect(lookup.mock.calls.filter(([id]) => id === "nav-company-webhooks")).toHaveLength(1);
  });

  it("still highlights a rendered group toggle whose first page the role cannot open", async () => {
    const group = element(1);
    onSidebarPage("/dashboard", { "nav-company": group });

    await expect(controlStore({ readable: [Resource.users] }).highlight("nav-company")).resolves.toEqual({
      ok: true,
      result: "Highlighted nav-company.",
    });
  });

  it("names the toolbar Search button when a narrower screen collapses the search box", async () => {
    const collapsed = element(0);
    onPage("/company/webhooks", (id) => (id === "company-webhooks-search" ? collapsed : null));

    expect((await settled(controlStore().highlight("company-webhooks-search"))).result).toBe(
      "Target company-webhooks-search is the list's search box, which narrower screens collapse behind the Search button (magnifier icon) in the toolbar. Ask the user to click that button, then highlight it again.",
    );
  });

  it("keeps waiting for a target of the current page while the page still shows its loading state", async () => {
    const currency = element(1);
    let rendered = false;
    onPage(
      "/company/settings",
      (id) => (id === "company-settings-currency" && rendered ? currency : null),
      () => !rendered,
    );
    setTimeout(() => {
      rendered = true;
    }, 3200);

    const highlighted = controlStore().highlight("company-settings-currency");
    await vi.advanceTimersByTimeAsync(3500);

    await expect(highlighted).resolves.toEqual({ ok: true, result: "Highlighted company-settings-currency." });
  });

  it("stops waiting for a target of a page that never finishes loading", async () => {
    onPage(
      "/company/settings",
      () => null,
      () => true,
    );

    const highlighted = controlStore().highlight("company-settings-currency");
    await vi.advanceTimersByTimeAsync(8100);

    await expect(highlighted).resolves.toMatchObject({ ok: false });
  });
});

describe("AgentUiControlStore guided tour", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function laidOut() {
    return { isConnected: true, getClientRects: () => [{}], scrollIntoView: vi.fn() };
  }

  function onApp(
    pathname: string,
    rendered: Map<string, ReturnType<typeof laidOut>>,
    loading: () => boolean = () => false,
  ) {
    vi.useFakeTimers();
    const location = { pathname };
    vi.stubGlobal("window", { location });
    vi.stubGlobal("document", {
      activeElement: null,
      getElementById: (id: string) => rendered.get(id) ?? null,
      querySelector: (selector: string) => (selector === 'main [data-page-state="loading"]' && loading() ? {} : null),
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const navigate = vi.fn((path: string) => {
      location.pathname = path;
      return Promise.resolve("navigated" as const);
    });
    return navigate;
  }

  function currentStop(store: AgentUiControlStore) {
    const stop = store.active;
    if (!stop) throw new Error("Expected an active tour stop");
    return stop;
  }

  const WEBHOOK_DIALOG_STOPS = [
    "webhook-modal-url",
    "webhook-modal-description",
    "webhook-modal-events",
    "webhook-modal-secret",
    "webhook-modal-headers",
    "webhook-modal-body-template",
    "webhook-modal-enabled",
    "webhook-modal-save",
  ].map((targetId) => ({ targetId, note: `Fill ${targetId}.` }));

  it("gives unrendered stops on one page one shared wait instead of one wait each", async () => {
    const navigate = onApp("/company/webhooks", new Map());
    const store = controlStore();
    store.registerNavigate(navigate);

    let result: unknown;
    void store.startGuidedTour(WEBHOOK_DIALOG_STOPS).then((value) => {
      result = value;
    });
    await vi.advanceTimersByTimeAsync(2100);

    expect(result).toEqual({ ok: false, result: "None of the tour targets are reachable right now." });
    expect(store.active).toBeNull();
  });

  it("stops looking for stops across many pages before the interface command window runs out", async () => {
    const navigate = onApp("/dashboard", new Map());
    const store = controlStore();
    store.registerNavigate(navigate);
    const stops = Array.from({ length: 20 }, (_, index) => ({
      targetId: index % 2 === 0 ? "company-members-add" : "company-roles-add",
      note: "Look here.",
    }));

    let result: unknown;
    void store.startGuidedTour(stops).then((value) => {
      result = value;
    });
    await vi.advanceTimersByTimeAsync(12_500);

    expect(result).toEqual({ ok: false, result: "None of the tour targets are reachable right now." });
    expect(navigate.mock.calls.length).toBeLessThan(stops.length);
  });

  it("waits for a cross-page stop while its page still shows the loading state", async () => {
    const rendered = new Map([["nav-dashboard", laidOut()]]);
    let pageLoaded = false;
    const navigate = onApp("/dashboard", rendered, () => !pageLoaded);
    const store = controlStore({ readable: CUSTOMER_SUCCESS_READS });
    store.registerNavigate(navigate);

    await expect(
      store.startGuidedTour([
        { targetId: "nav-dashboard", note: "Start here." },
        { targetId: "company-webhooks-add", note: "Not for this role." },
        { targetId: "routines-add", note: "Add a routine." },
      ]),
    ).resolves.toMatchObject({ ok: true });
    setTimeout(() => {
      pageLoaded = true;
      rendered.set("routines-add", laidOut());
    }, 3200);

    store.nextStep();
    await vi.advanceTimersByTimeAsync(3500);

    expect(store.active?.targetId).toBe("routines-add");
    expect(navigate).toHaveBeenLastCalledWith("/routines");
  });

  it("moves on from a stop whose control disappears after the user acts on it", async () => {
    const rendered = new Map([
      ["dashboard-add-widget", laidOut()],
      ["widget-modal-kind", laidOut()],
    ]);
    const navigate = onApp("/dashboard", rendered);
    const store = controlStore();
    store.registerNavigate(navigate);

    await store.startGuidedTour([
      { targetId: "dashboard-add-widget", note: "Click Add widget." },
      { targetId: "widget-modal-kind", note: "Pick Chart." },
      { targetId: "widget-modal-save", note: "Create the widget." },
    ]);
    store.nextStep();
    await vi.advanceTimersByTimeAsync(0);
    const kindStop = currentStop(store);
    expect(kindStop.targetId).toBe("widget-modal-kind");

    rendered.delete("widget-modal-kind");
    rendered.set("widget-modal-save", laidOut());
    store.reportTourTarget(kindStop, false);
    await vi.advanceTimersByTimeAsync(1000);
    store.reportTourTarget(kindStop, false);
    expect(store.active).toBe(kindStop);

    await vi.advanceTimersByTimeAsync(1100);
    store.reportTourTarget(kindStop, false);
    store.reportTourTarget(kindStop, false);
    await vi.advanceTimersByTimeAsync(0);

    expect(store.active?.targetId).toBe("widget-modal-save");
    expect(store.active?.stepIndex).toBe(2);
  });

  it("ends the tour when the control of its stop disappears and no later stop is on screen", async () => {
    const rendered = new Map([["connected-account-signature", laidOut()]]);
    const navigate = onApp("/profile/connected-accounts", rendered);
    const store = controlStore();
    store.registerNavigate(navigate);

    await store.startGuidedTour([
      { targetId: "connected-account-signature", note: "Turn on the signature." },
      { targetId: "connected-account-email-save", note: "Save it." },
    ]);
    const signatureStop = currentStop(store);
    rendered.delete("connected-account-signature");

    store.reportTourTarget(signatureStop, false);
    await vi.advanceTimersByTimeAsync(2000);
    store.reportTourTarget(signatureStop, false);
    await vi.advanceTimersByTimeAsync(2100);

    expect(store.active).toBeNull();
  });

  it("keeps a stop whose control only briefly disappears", async () => {
    const rendered = new Map([["dashboard-add-widget", laidOut()]]);
    const navigate = onApp("/dashboard", rendered);
    const store = controlStore();
    store.registerNavigate(navigate);

    await store.startGuidedTour([
      { targetId: "dashboard-add-widget", note: "Click Add widget." },
      { targetId: "widget-modal-kind", note: "Pick Chart." },
    ]);
    const stop = currentStop(store);

    store.reportTourTarget(stop, false);
    await vi.advanceTimersByTimeAsync(1500);
    store.reportTourTarget(stop, true);
    await vi.advanceTimersByTimeAsync(1500);
    store.reportTourTarget(stop, false);

    expect(store.active).toBe(stop);
  });

  it("ends the tour instead of pulling the user back when they leave the page of a stop", async () => {
    const rendered = new Map([
      ["company-webhooks-add", laidOut()],
      ["company-webhooks-filter", laidOut()],
    ]);
    const navigate = onApp("/company/webhooks", rendered);
    const store = controlStore();
    store.registerNavigate(navigate);

    await store.startGuidedTour([
      { targetId: "company-webhooks-add", note: "Click Add." },
      { targetId: "company-webhooks-filter", note: "Filter the list." },
    ]);
    const stop = currentStop(store);
    navigate.mockClear();

    window.location.pathname = "/company/roles";
    rendered.clear();
    store.reportTourTarget(stop, false);
    await vi.advanceTimersByTimeAsync(2100);
    store.reportTourTarget(stop, false);
    await vi.advanceTimersByTimeAsync(3000);

    expect(navigate).not.toHaveBeenCalled();
    expect(store.active).toBeNull();
  });

  function onSlowPages(pages: Record<string, string>) {
    const rendered = new Map<string, ReturnType<typeof laidOut>>();
    let loading = false;
    const load = { ms: 0 };
    const navigate = onApp("/company/webhooks", rendered, () => loading);
    rendered.set(pages["/company/webhooks"], laidOut());
    navigate.mockImplementation((path: string) => {
      if (window.location.pathname !== path) {
        window.location.pathname = path;
        rendered.clear();
        loading = true;
        setTimeout(() => {
          loading = false;
          rendered.set(pages[path], laidOut());
        }, load.ms);
      }
      return Promise.resolve("navigated" as const);
    });
    return { navigate, rendered, load };
  }

  async function reportTargetsFor(store: AgentUiControlStore, rendered: Map<string, unknown>, ms: number) {
    for (let elapsed = 0; elapsed < ms; elapsed += 300) {
      const active = store.active;
      if (active) store.reportTourTarget(active, rendered.has(active.targetId));
      await vi.advanceTimersByTimeAsync(300);
    }
  }

  it("keeps a Back across pages while the earlier page is still loading its stop", async () => {
    const { navigate, rendered, load } = onSlowPages({
      "/company/webhooks": "company-webhooks-add",
      "/company/roles": "company-roles-add",
      "/routines": "routines-add",
    });
    const store = controlStore();
    store.registerNavigate(navigate);

    await store.startGuidedTour([
      { targetId: "company-webhooks-add", note: "Add a webhook." },
      { targetId: "company-roles-add", note: "Add a role." },
      { targetId: "routines-add", note: "Add a routine." },
    ]);
    store.nextStep();
    await reportTargetsFor(store, rendered, 600);
    expect(currentStop(store).targetId).toBe("company-roles-add");

    load.ms = 3000;
    store.previousStep();
    await reportTargetsFor(store, rendered, 6000);

    expect(currentStop(store)).toMatchObject({ targetId: "company-webhooks-add", stepIndex: 0 });
    expect(window.location.pathname).toBe("/company/webhooks");
    expect(navigate).not.toHaveBeenCalledWith("/routines");
  });

  it("ends the tour after a Back that found no earlier stop leaves the user off the shown stop's page", async () => {
    const { navigate, rendered, load } = onSlowPages({
      "/company/webhooks": "company-webhooks-add",
      "/company/roles": "company-roles-add",
    });
    const store = controlStore();
    store.registerNavigate(navigate);

    await store.startGuidedTour([
      { targetId: "company-webhooks-add", note: "Add a webhook." },
      { targetId: "company-roles-add", note: "Add a role." },
    ]);
    store.nextStep();
    await reportTargetsFor(store, rendered, 600);
    expect(currentStop(store).targetId).toBe("company-roles-add");

    load.ms = 60_000;
    store.previousStep();
    await reportTargetsFor(store, rendered, 13_000);

    expect(store.active).toBeNull();
    expect(navigate).toHaveBeenLastCalledWith("/company/webhooks");
  });
});
