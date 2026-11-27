import type { Root } from "react-dom/client";
import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { ApiKey } from "@/features/api-key/get-api-keys.interactor";
import type { ConnectedApp } from "@/features/connected-apps/connected-app.schema";

import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";
import { defaultEmailSettings } from "@/ee/messaging/email-settings";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  searchParams: new URLSearchParams(),
  openAccount: vi.fn(),
  addKey: vi.fn(),
  selectProvider: vi.fn(),
  showConfirmation: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) =>
        values
          ? `${key}(${Object.entries(values)
              .map(([name, value]) => `${name}=${value}`)
              .join(",")})`
          : key,
      { rich: (key: string) => key },
    ),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => harness.searchParams }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatRelativeTime: () => "2 minutes ago",
    formatDescriptiveShortDate: (date: Date) => date.toISOString().slice(0, 10),
    formatNumericalShortDateTime: (date: Date) => date.toISOString().slice(0, 16),
  }),
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showConfirmation: harness.showConfirmation, showDeleteConfirmation: vi.fn() }),
}));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ children }: { children: ReactNode }) => createElement("a", null, children),
}));
vi.mock("@/components/channels/connect-channel-menu", () => ({
  ConnectMenuItems: () => null,
  ConnectProviderStack: () => null,
}));
vi.mock("@/components/ai-connection/ai-connection.store", () => ({
  AI_CONNECTION_PROVIDERS: ["claude", "openai", "cursor", "gemini"],
}));
vi.mock("@/app/components/upsell/plan-upsell-notice", () => ({ PlanUpsellNotice: () => null }));
vi.mock("@/app/components/upsell/plan-upsell-highlights", () => ({ MESSAGING_UPSELL_PLAN: "pro" }));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: (props: Record<string, unknown>) => createElement("a", props),
  usePathname: () => "/settings/connections",
}));

import { ConnectionsPageView } from "../connections-page-view";

const ACCOUNT: ConnectedAccountDto = {
  id: "03f07663-3ddb-4b33-bf31-6b00f25a5194",
  displayName: "Ava Miller",
  provider: MessagingProvider.google,
  status: ConnectedAccountStatus.ok,
  syncing: false,
  shared: true,
  hasMessaging: true,
  hasCalendar: true,
  signature: null,
  emailSettings: defaultEmailSettings(),
  signatureHtml: null,
  emailAddress: "ava@example.com",
  isOwner: true,
  folders: [],
  selectedFolderIds: [],
  foldersSyncedAt: null,
  linkedinProducts: [],
  owner: { userId: "3d788d03-eb75-4d99-89cc-bc13c7850e4b", firstName: "Ava", lastName: "Miller", avatarUrl: null },
  createdAt: new Date("2026-10-01T08:00:00.000Z"),
  lastSyncedAt: new Date("2026-11-20T08:00:00.000Z"),
};

const APP: ConnectedApp = {
  id: "client-claude",
  name: "Claude",
  device: "Claude Desktop · MacBook Pro",
  accountWide: true,
  connectedAt: new Date("2026-09-03T08:00:00.000Z"),
  lastActiveAt: new Date("2026-11-20T06:00:00.000Z"),
};

const KEY: ApiKey = {
  id: "api-1",
  name: "Website form import",
  start: "cm_8f3",
  createdAt: new Date("2026-09-03T08:00:00.000Z"),
  expiresAt: null,
  lastRequest: new Date("2026-11-20T09:12:00.000Z"),
};

let container: HTMLDivElement;
let root: Root;

function rootStore() {
  return {
    connectedAccountsStore: {
      items: [ACCOUNT],
      dataRequest: { status: "ready" },
      setItems: vi.fn(),
      startSyncPolling: vi.fn(),
      stopSyncPolling: vi.fn(),
      connectAccount: vi.fn(),
    },
    connectedAccountModalStore: { openWith: harness.openAccount },
    userStore: { can: () => true },
    apiKeysStore: { canManage: true, items: [KEY], dataRequest: { status: "ready" }, setItems: vi.fn() },
    apiKeyModalStore: {
      add: harness.addKey,
      view: vi.fn(),
      aiConnectionStore: { selectProvider: harness.selectProvider },
    },
    connectedAppsStore: { items: [APP], setItems: vi.fn(), disconnect: vi.fn() },
    workspacesStore: { current: { name: "Acme" } },
  };
}

type ViewProps = Parameters<typeof ConnectionsPageView>[0];

const FULL: ViewProps = {
  inbox: { accounts: [ACCOUNT], locked: false },
  api: { apiKeys: [KEY], connectedApps: [APP] },
};

async function render(props: ViewProps = FULL) {
  await act(async () => {
    root.render(createElement(ConnectionsPageView, props));
    await Promise.resolve();
  });
}

const section = (id: string) => container.querySelector<HTMLElement>(`#connections-${id}`);
const tab = (value: string) => container.querySelector<HTMLButtonElement>(`#connections-tab-${value}`);

async function choose(value: string) {
  await act(async () => {
    tab(value)?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await Promise.resolve();
  });
}

async function click(element: HTMLElement | null | undefined) {
  await act(async () => {
    element?.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.searchParams = new URLSearchParams();
  harness.rootStore = rootStore();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ConnectionsPageView", () => {
  it("shows inbox accounts, AI apps and API keys on one page with their counts in the filter", async () => {
    await render();

    expect(tab("all")?.textContent).toBe("Connections.filters.all");
    expect(tab("inbox")?.textContent).toBe("Connections.filters.inbox · 1");
    expect(tab("apps")?.textContent).toBe("Connections.filters.apps · 1");
    expect(tab("keys")?.textContent).toBe("Connections.filters.keys · 1");
    expect(section("inbox")).not.toBeNull();
    expect(section("apps")).not.toBeNull();
    expect(section("keys")).not.toBeNull();
    expect(container.querySelector("[data-connections-privacy-note]")?.textContent).toBe(
      "Connections.inbox.privacyNote",
    );
  });

  it("narrows the page to the section picked in the filter and back", async () => {
    await render();

    await choose("keys");
    expect(section("keys")).not.toBeNull();
    expect(section("inbox")).toBeNull();
    expect(section("apps")).toBeNull();

    await choose("inbox");
    expect(section("inbox")).not.toBeNull();
    expect(section("keys")).toBeNull();

    await choose("all");
    expect(section("apps")).not.toBeNull();
    expect(section("keys")).not.toBeNull();
  });

  it("opens on the section the old settings address asked for", async () => {
    harness.searchParams = new URLSearchParams("section=apps");
    await render();

    expect(tab("apps")?.dataset.state).toBe("active");
    expect(section("apps")).not.toBeNull();
    expect(section("inbox")).toBeNull();
  });

  it("lists an account with what it does, its address, the last sync and whether it is shared", async () => {
    await render();
    const row = container.querySelector<HTMLElement>(`[data-connected-account="${ACCOUNT.id}"]`);

    expect(row?.textContent).toContain("Common.providers.google");
    expect(row?.textContent).toContain("Connections.inbox.capabilities.email");
    expect(row?.textContent).toContain("Connections.inbox.capabilities.calendar");
    expect(row?.textContent).toContain("ava@example.com · Connections.inbox.synced(time=2 minutes ago)");
    expect(row?.textContent).toContain("ConnectedAccountsCard.visibilityShared");
    expect(row?.querySelector("[data-item-actions-trigger]")).not.toBeNull();

    await click(row?.querySelector("button"));
    expect(harness.openAccount).toHaveBeenCalledWith(ACCOUNT);
  });

  it("shows a connected AI app and offers only the apps that are not connected yet", async () => {
    await render();
    const app = container.querySelector<HTMLElement>('[data-connected-app="client-claude"]');

    expect(app?.textContent).toContain("Connections.apps.connected");
    expect(app?.textContent).toContain("Connections.apps.detail(since=2026-09-03,active=2 minutes ago)");
    expect(app?.textContent).toContain("Claude Desktop · MacBook Pro · ");
    expect(app?.querySelector("img")).not.toBeNull();

    const offered = [...container.querySelectorAll<HTMLElement>("[data-connect-ai-app]")].map(
      (button) => button.dataset.connectAiApp,
    );
    expect(offered).toEqual(["openai", "cursor", "gemini"]);
    expect(container.querySelector("#connections-ai-apps-connect")?.textContent).toContain("Connections.apps.connect");

    await click(container.querySelector<HTMLElement>('[data-connect-ai-app="gemini"]'));
    expect(harness.addKey).toHaveBeenCalledTimes(1);
    expect(harness.selectProvider).toHaveBeenCalledWith("gemini");
  });

  it("warns that disconnecting an account-wide app ends its access to the whole account", async () => {
    await render();

    await click(container.querySelector<HTMLElement>('[data-connected-app="client-claude"] button'));

    expect(harness.showConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ message: "ConnectedApps.disconnectAccountDescription(name=Claude)" }),
    );
  });

  it("keeps the workspace warning for an app connected to one workspace only", async () => {
    const legacy = { ...APP, accountWide: false };
    harness.rootStore = {
      ...rootStore(),
      connectedAppsStore: { items: [legacy], setItems: vi.fn(), disconnect: vi.fn() },
    };
    await render({ ...FULL, api: { apiKeys: [KEY], connectedApps: [legacy] } });

    await click(container.querySelector<HTMLElement>('[data-connected-app="client-claude"] button'));

    expect(harness.showConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ message: "ConnectedApps.disconnectDescription(name=Claude)" }),
    );
  });

  it("lists API keys in a compact table with a masked prefix and a create button", async () => {
    await render();
    const row = container.querySelector<HTMLElement>('[data-api-key="api-1"]');

    expect(row?.textContent).toContain("Website form import");
    expect(row?.textContent).toContain("Connections.keys.created(date=2026-09-03)");
    expect(row?.querySelector("[data-api-key-prefix]")?.textContent).toBe("cm_8f3••••••••");
    expect(row?.textContent).toContain("2 minutes ago");
    expect(row?.textContent).toContain("Common.never");

    await click(container.querySelector<HTMLElement>("#settings-api-keys-generate"));
    expect(harness.addKey).toHaveBeenCalledTimes(1);
  });

  it("shows only the sections the member may open and drops the filter when one is left", async () => {
    await render({ inbox: { accounts: [ACCOUNT], locked: false }, api: null });

    expect(section("inbox")).not.toBeNull();
    expect(section("apps")).toBeNull();
    expect(section("keys")).toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });
});
