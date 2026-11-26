import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).map(String).join("|")})` : key,
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ href, children, ...rest }: { href: string; children: ReactNode; [key: string]: unknown }) => (
    <a data-trial-reminder={rest["data-trial-reminder"] as string | undefined} href={href}>
      {children}
    </a>
  ),
}));
vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/actions", () => ({
  refreshConnectedAppsAction: vi.fn(),
}));
vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/channels/actions", () => ({
  refreshConnectedAccountsAction: vi.fn(),
}));

const store = vi.hoisted(() => ({
  apps: { canManage: true, isReady: true, items: [] as unknown[] },
  accounts: { isReady: true, items: [] as unknown[] },
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    connectedAppsStore: store.apps,
    connectedAccountsStore: store.accounts,
    userStore: { can: () => true },
  }),
}));

import { GetStartedSidebarCard } from "../get-started-sidebar-card";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DISMISS_KEY = "customermates:get-started-dismissed:company-a";

let container: HTMLDivElement;
let root: Root;

function render(trialDaysLeft: number | null) {
  act(() =>
    root.render(<GetStartedSidebarCard canOpenBilling trialDaysLeft={trialDaysLeft} workspaceKey="company-a" />),
  );
}

const checklist = () => container.querySelector("[data-get-started-card]");
const reminder = () => container.querySelector("[data-trial-reminder]");

beforeEach(() => {
  window.localStorage.clear();
  store.apps.items = [];
  store.accounts.items = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("get started sidebar card", () => {
  it("lists the setup steps and the plan step while setup is open", () => {
    render(12);

    expect(checklist()?.textContent).toContain("AgentStart.stepPlan");
    expect(checklist()?.textContent).toContain("AgentStart.daysLeft(12)");
    expect(reminder()).toBeNull();
  });

  it("links the agent step to Settings, Connections instead of handing out a setup prompt", () => {
    render(12);

    const agentStep = [...(checklist()?.querySelectorAll("a") ?? [])].find((link) =>
      link.textContent?.includes("AgentStart.stepAgent"),
    );
    expect(agentStep?.getAttribute("href")).toBe("/settings/connections");
    expect(checklist()?.querySelector("button[data-agent-start-pill]")).toBeNull();
  });

  it("leaves the plan step to the trial card in the last days of the trial", () => {
    render(3);

    expect(checklist()?.textContent).not.toContain("AgentStart.stepPlan");
    expect(checklist()?.textContent).toContain("AgentStart.progress(0|2)");
  });

  it("keeps a one-line trial reminder linking to billing once the checklist is hidden", () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    render(12);

    expect(checklist()).toBeNull();
    expect(reminder()?.getAttribute("href")).toBe("/settings/billing");
    expect(reminder()?.textContent).toContain("Subscription.status.trialDaysLeft(12)");
    expect(reminder()?.textContent).toContain("AgentStart.stepPlan");
  });

  it("keeps the reminder once every setup step is done", () => {
    store.apps.items = [{}];
    store.accounts.items = [{}];
    render(12);

    expect(checklist()).toBeNull();
    expect(reminder()).not.toBeNull();
  });

  it("shows nothing outside a trial or in its last days once the checklist is hidden", () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    render(null);
    expect(container.innerHTML).toBe("");

    render(3);
    expect(container.innerHTML).toBe("");
  });
});
