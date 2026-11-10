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
  IntlLink: ({ href, children, onClick }: { href: string; children: ReactNode; onClick?: () => void }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatNumber: (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
  }),
}));
vi.mock("@/app/components/upsell/upsell-plan-price", () => ({
  UpsellPlanPrice: ({ plan }: { plan: string }) => <span data-upsell-plan={plan}>{`price:${plan}`}</span>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
}));

import { CLOUD_TRIAL, FREE_PLAN_USAGE_LIMITS } from "@/core/commercial/plan-catalog";
import { EMPTY_PLAN_FIT_USAGE, type PlanFitUsage } from "@/core/commercial/plan-fit";

import { FreePlanSidebarCard, TrialSidebarCard, trialCardVisible, trialProgressPercent } from "../trial-sidebar-card";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(node: ReactNode) {
  act(() => root.render(node));
}

function card() {
  return container.querySelector("[data-trial-card]");
}

beforeEach(() => {
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("trial sidebar card", () => {
  it("shows the days left, a progress bar and a billing action", () => {
    const onNavigate = vi.fn();
    render(<TrialSidebarCard daysLeft={7} planName="Pro" workspaceKey="company-a" onNavigate={onNavigate} />);

    expect(card()?.textContent).toContain("Upsell.trial.title(7|Pro)");
    const bar = card()?.querySelector<HTMLElement>("[aria-hidden] > span");
    expect(bar?.style.width).toBe(`${trialProgressPercent(7)}%`);
    const link = card()?.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/settings/billing");
    expect(link?.textContent).toBe("Upsell.trial.cta");

    act(() => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("stays hidden for the rest of the session once dismissed in that workspace", () => {
    render(<TrialSidebarCard daysLeft={3} planName="Pro" workspaceKey="company-a" onNavigate={vi.fn()} />);

    const dismiss = container.querySelector<HTMLButtonElement>('button[aria-label="Upsell.trial.dismiss"]');
    act(() => {
      dismiss?.click();
    });

    expect(card()).toBeNull();
    expect(window.sessionStorage.getItem("customermates:trial-card-dismissed:company-a")).toBe("1");

    render(<TrialSidebarCard daysLeft={3} planName="Pro" workspaceKey="company-a" onNavigate={vi.fn()} />);
    expect(card()).toBeNull();

    render(<TrialSidebarCard daysLeft={3} planName="Pro" workspaceKey="company-b" onNavigate={vi.fn()} />);
    expect(card()).not.toBeNull();
  });
});

describe("trial progress", () => {
  it("measures the days left against the catalog trial length", () => {
    expect(trialProgressPercent(CLOUD_TRIAL.days)).toBe(100);
    expect(trialProgressPercent(0)).toBe(0);
    expect(trialProgressPercent(CLOUD_TRIAL.days * 2)).toBe(100);
    expect(trialProgressPercent(-1)).toBe(0);
  });
});

describe("trial card visibility", () => {
  const visible = {
    appMode: "cloud" as const,
    restricted: false,
    subscription: {
      status: "trial" as const,
      hasActiveSubscription: false,
      checkout: "none" as const,
      onFreePlan: false,
    },
    trialDaysLeft: 5,
    onBillingPage: false,
    canOpenBilling: true,
  };

  it("shows during an in-app cloud trial to members who can open billing", () => {
    expect(trialCardVisible(visible)).toBe(true);
  });

  it.each([
    ["self-hosted", { appMode: "self-hosted" as const }],
    ["the demo", { appMode: "demo" as const }],
    ["a restricted account", { restricted: true }],
    ["a paid workspace", { subscription: { ...visible.subscription, status: "active" as const } }],
    ["a live provider subscription", { subscription: { ...visible.subscription, hasActiveSubscription: true } }],
    [
      "an ended trial, which shows the Free card instead",
      { subscription: { ...visible.subscription, onFreePlan: true } },
    ],
    ["a pending checkout", { subscription: { ...visible.subscription, checkout: "pending" as const } }],
    ["an unknown trial end", { trialDaysLeft: null }],
    ["the billing page", { onBillingPage: true }],
    ["members without billing access", { canOpenBilling: false }],
    ["a missing subscription", { subscription: null }],
  ])("stays hidden for %s", (_, override) => {
    expect(trialCardVisible({ ...visible, ...override })).toBe(false);
  });
});

describe("free plan sidebar card", () => {
  function freeCard() {
    return container.querySelector("[data-free-plan-card]");
  }

  it("says the workspace is on Free and offers one upgrade action to Starter with its price", () => {
    const onNavigate = vi.fn();
    render(<FreePlanSidebarCard workspaceKey="company-a" onNavigate={onNavigate} />);

    expect(freeCard()?.textContent).toContain("Upsell.free.title");
    expect(freeCard()?.textContent).toContain(
      "Upsell.free.description(Subscription.planNames.pro|Subscription.planNames.starter|1|250)",
    );
    expect(freeCard()?.querySelector("[data-upsell-plan]")?.getAttribute("data-upsell-plan")).toBe("starter");
    const links = freeCard()?.querySelectorAll("a") ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("/settings/billing?plan=starter");
    expect(links[0]?.textContent).toBe("Upsell.upgradeTo(Subscription.planNames.starter)");
    act(() => {
      links[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("can be hidden for the session per workspace", () => {
    render(<FreePlanSidebarCard workspaceKey="company-a" onNavigate={vi.fn()} />);
    act(() => {
      freeCard()
        ?.querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(freeCard()).toBeNull();
  });
});

describe("trial end card", () => {
  const usage: PlanFitUsage = {
    ...EMPTY_PLAN_FIT_USAGE,
    members: 3,
    connectedAccounts: 2,
    maxAccountsPerUser: 1,
    openDrafts: 4,
    activeRoutines: 2,
    maxRoutinesPerOwner: 2,
    webhooks: 1,
    mateRequests: 9,
  };

  function lossKinds() {
    return [...container.querySelectorAll("[data-trial-end-loss]")].map((item) =>
      item.getAttribute("data-trial-end-loss"),
    );
  }

  it("lists what this workspace uses that stops on Free and names the one plan that keeps it running", () => {
    const onNavigate = vi.fn();
    render(<TrialSidebarCard daysLeft={3} fit={usage} planName="Pro" workspaceKey="end-1" onNavigate={onNavigate} />);

    expect(card()?.textContent).toContain("Upsell.trial.title(3|Pro)");
    expect(lossKinds()).toEqual(["accounts", "drafts", "routines", "members", "webhooks", "mate"]);
    expect(card()?.querySelector("[data-trial-end-loss='accounts']")?.textContent).toBe(
      "Upsell.trialEnd.items.accounts(2)",
    );
    expect(card()?.querySelector("[data-trial-end-loss='members']")?.textContent).toBe(
      "Upsell.trialEnd.items.members(2)",
    );
    expect(card()?.querySelector("[data-upsell-plan]")?.getAttribute("data-upsell-plan")).toBe("pro");
    const links = card()?.querySelectorAll("a") ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("/settings/billing?plan=pro");
    expect(links[0]?.textContent).toBe("Upsell.trialEnd.cta(Subscription.planNames.pro)");
    act(() => {
      links[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("names Starter when only things Starter includes are in use", () => {
    render(
      <TrialSidebarCard
        daysLeft={2}
        fit={{ ...EMPTY_PLAN_FIT_USAGE, members: 2, webhooks: 1 }}
        planName="Pro"
        workspaceKey="end-2"
        onNavigate={vi.fn()}
      />,
    );

    expect(lossKinds()).toEqual(["members", "webhooks"]);
    expect(card()?.querySelector("a")?.getAttribute("href")).toBe("/settings/billing?plan=starter");
  });

  it("starts four days before the end and not earlier", () => {
    render(<TrialSidebarCard daysLeft={4} fit={usage} planName="Pro" workspaceKey="end-3" onNavigate={vi.fn()} />);
    expect(lossKinds()).toHaveLength(6);

    render(<TrialSidebarCard daysLeft={5} fit={usage} planName="Pro" workspaceKey="end-4" onNavigate={vi.fn()} />);
    expect(lossKinds()).toEqual([]);
    expect(card()?.querySelector("a")?.getAttribute("href")).toBe("/settings/billing");
  });

  it("shows the plain countdown when nothing would stop or the usage is not known yet", () => {
    render(
      <TrialSidebarCard
        daysLeft={2}
        fit={{ ...EMPTY_PLAN_FIT_USAGE, members: 1, apiClients: 1 }}
        planName="Pro"
        workspaceKey="end-5"
        onNavigate={vi.fn()}
      />,
    );
    expect(lossKinds()).toEqual([]);
    expect(card()?.textContent).toContain("Upsell.trial.description");
    expect(card()?.querySelector("a")?.textContent).toBe("Upsell.trial.cta");

    render(<TrialSidebarCard daysLeft={2} fit={null} planName="Pro" workspaceKey="end-6" onNavigate={vi.fn()} />);
    expect(lossKinds()).toEqual([]);
    expect(card()?.textContent).toContain("Upsell.trial.description");
  });

  it("comes back on the last day after being hidden earlier in the session", () => {
    render(<TrialSidebarCard daysLeft={3} fit={usage} planName="Pro" workspaceKey="end-last" onNavigate={vi.fn()} />);
    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Upsell.trial.dismiss"]')?.click();
    });
    expect(card()).toBeNull();

    render(<TrialSidebarCard daysLeft={1} fit={usage} planName="Pro" workspaceKey="end-last" onNavigate={vi.fn()} />);
    expect(card()).not.toBeNull();
    expect(lossKinds()).toHaveLength(6);
  });
});

describe("free plan sidebar card usage", () => {
  function usageOf(overrides: Partial<{ members: number; records: number; apiRequestsToday: number }> = {}) {
    return {
      plan: "free" as const,
      limits: FREE_PLAN_USAGE_LIMITS,
      usage: { members: 1, pausedMembers: 0, records: 120, storageBytes: 0, apiRequestsToday: 35, ...overrides },
    };
  }

  function meter(id: string) {
    return container.querySelector<HTMLElement>(`[data-free-plan-card] [data-plan-usage='${id}']`);
  }

  it("shows compact bars for records, people and today's API calls against the Free limits", () => {
    render(<FreePlanSidebarCard usage={usageOf()} workspaceKey="usage-9" onNavigate={vi.fn()} />);

    expect(container.querySelector("[data-free-plan-card]")?.textContent).toContain(
      "Upsell.free.upgradeDescription(Subscription.planNames.pro|Subscription.planNames.starter)",
    );
    expect(meter("records")?.textContent).toContain("PlanUsage.of(120|250)");
    expect(meter("members")?.textContent).toContain("PlanUsage.of(1|1)");
    expect(meter("api")?.textContent).toContain("PlanUsage.apiToday");
    expect(meter("api")?.textContent).toContain("PlanUsage.of(35|200)");
    expect(meter("records")?.querySelector<HTMLElement>("[aria-hidden] > span")?.style.width).toBe("48%");
    expect(meter("api")?.querySelector<HTMLElement>("[aria-hidden] > span")?.style.width).toBe("18%");
  });

  it("warns on records near the limit and keeps the single upgrade action", () => {
    render(<FreePlanSidebarCard usage={usageOf({ records: 230 })} workspaceKey="usage-10" onNavigate={vi.fn()} />);

    expect(meter("records")?.getAttribute("data-usage-tone")).toBe("approaching");
    expect(container.querySelectorAll("[data-free-plan-card] a")).toHaveLength(1);
  });

  it("leaves out the bars until the usage has loaded", () => {
    render(<FreePlanSidebarCard usage={null} workspaceKey="usage-11" onNavigate={vi.fn()} />);

    expect(container.querySelector("[data-free-plan-usage]")).toBeNull();
    expect(container.querySelector("[data-free-plan-card]")).not.toBeNull();
  });
});
