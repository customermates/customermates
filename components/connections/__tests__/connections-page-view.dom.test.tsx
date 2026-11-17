import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => router,
  IntlLink: ({ children, href }: { children: unknown; href: string }) =>
    createElement("a", { href }, children as never),
}));

import { ConnectionAgentsTab } from "../connection-agents-tab";
import { ConnectionAppsTab } from "../connection-apps-tab";
import { ConnectionsPageView } from "../connections-page-view";

let container: HTMLDivElement;
let root: Root;

function tabs(prefix: string) {
  return [...document.querySelectorAll<HTMLButtonElement>(`[role="tab"][id^="${prefix}-tab-"]`)];
}

function render(node: ReturnType<typeof createElement>) {
  act(() => root.render(node));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ConnectionsPageView", () => {
  it("lists the four tabs, marks the open one and shows its content in a labelled panel", () => {
    render(
      createElement(
        ConnectionsPageView,
        { tabs: ["channels", "apps", "agents", "developers"], tab: "apps", section: null, bleed: false },
        createElement("p", null, "apps content"),
      ),
    );

    expect(tabs("connections").map((tab) => tab.textContent)).toEqual([
      "Connections.tabs.channels",
      "Connections.tabs.apps",
      "Connections.tabs.agents",
      "Connections.tabs.developers",
    ]);
    expect(tabs("connections").map((tab) => tab.dataset.state)).toEqual(["inactive", "active", "inactive", "inactive"]);
    const panel = document.getElementById("connections-panel");
    expect(panel?.getAttribute("aria-labelledby")).toBe("connections-tab-apps");
    expect(panel?.textContent).toContain("apps content");
    expect(document.querySelector("h1")?.textContent).toBe("Connections.title");
    expect(document.querySelector('[role="tablist"][aria-label="Connections.tabsLabel"]')).not.toBeNull();
  });

  it("offers only the tabs the person may see", () => {
    render(
      createElement(
        ConnectionsPageView,
        { tabs: ["apps", "agents"], tab: "apps", section: null, bleed: false },
        createElement("p", null, "content"),
      ),
    );

    expect(tabs("connections").map((tab) => tab.textContent)).toEqual([
      "Connections.tabs.apps",
      "Connections.tabs.agents",
    ]);
    expect(document.querySelector('[aria-label="Connections.channels.sectionsLabel"]')).toBeNull();
  });

  it("opens the next tab through the address, so a tab can be linked and reloaded", async () => {
    render(
      createElement(
        ConnectionsPageView,
        { tabs: ["channels", "apps", "agents", "developers"], tab: "channels", section: "accounts", bleed: false },
        createElement("p", null, "content"),
      ),
    );

    act(() => tabs("connections")[0]?.focus());
    act(() => {
      tabs("connections")[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/settings/connections?tab=apps"));
  });

  it("shows the sections of the Channels and Developers tabs and keeps the tab when one is chosen", async () => {
    render(
      createElement(
        ConnectionsPageView,
        { tabs: ["channels", "apps", "agents", "developers"], tab: "developers", section: "keys", bleed: false },
        createElement("p", null, "keys content"),
      ),
    );

    expect(tabs("connections-section").map((tab) => tab.textContent)).toEqual([
      "SettingsNav.apiKeys",
      "SettingsNav.webhooks",
      "SettingsNav.deliveries",
      "SettingsNav.incomingWebhooks",
    ]);
    expect(
      document.querySelector('[role="tablist"][aria-label="Connections.developers.sectionsLabel"]'),
    ).not.toBeNull();

    act(() => tabs("connections-section")[0]?.focus());
    act(() => {
      tabs("connections-section")[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    await vi.waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/settings/connections?tab=developers&section=webhooks"),
    );
  });

  it("shows the booking pages as the second section of Channels", () => {
    render(
      createElement(
        ConnectionsPageView,
        { tabs: ["channels", "apps"], tab: "channels", section: "booking", bleed: false },
        createElement("p", null, "booking content"),
      ),
    );

    expect(tabs("connections-section").map((tab) => tab.textContent)).toEqual([
      "SettingsNav.channels",
      "SettingsNav.booking",
    ]);
    expect(tabs("connections-section").map((tab) => tab.dataset.state)).toEqual(["inactive", "active"]);
    expect(document.querySelector('[aria-label="Connections.channels.sectionsLabel"]')).not.toBeNull();
  });
});

describe("ConnectionAppsTab", () => {
  it("says no apps are connected yet and names the owner and scope while the registry is empty", () => {
    render(createElement(ConnectionAppsTab));

    expect(container.textContent).toContain("Connections.apps.emptyTitle");
    expect(container.textContent).toContain("Connections.apps.emptyBody");
    expect(container.querySelector("[data-connection-owner='workspace'][data-connection-scope='apps']")).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("lists each provider with what it enables and a disabled Connect button until it is available", () => {
    render(
      createElement(ConnectionAppsTab, {
        providers: [
          { id: "alpha", name: "Alpha", enablesKey: "Connections.apps.enables", available: false },
          { id: "beta", name: "Beta", enablesKey: "Connections.apps.enables", available: true },
        ],
      }),
    );

    const cards = [...container.querySelectorAll<HTMLElement>("[data-connection-provider]")];
    expect(cards.map((card) => card.dataset.connectionProvider)).toEqual(["alpha", "beta"]);
    expect(cards[0]?.textContent).toContain("Alpha");
    expect(cards[0]?.textContent).toContain("Connections.apps.comingSoon");
    expect(cards[0]?.querySelector("button")?.disabled).toBe(true);
    expect(cards[1]?.textContent).not.toContain("Connections.apps.comingSoon");
    expect(cards[1]?.querySelector("button")?.disabled).toBe(false);
  });
});

describe("ConnectionAgentsTab", () => {
  it("links to the agent settings page and names its owner and scope", () => {
    render(createElement(ConnectionAgentsTab));

    expect(container.querySelector("a")?.getAttribute("href")).toBe("/settings/agents");
    expect(container.textContent).toContain("Connections.agents.body");
    expect(
      container.querySelector("[data-connection-owner='workspace'][data-connection-scope='agents']"),
    ).not.toBeNull();
  });
});
