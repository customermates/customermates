import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ user: {} as object | null, canUpdateCompany: true }));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ userStore: { user: harness.user, can: () => harness.canUpdateCompany } }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).map(String).join("|")})` : key,
}));
vi.mock("mobx-react-lite", () => ({ observer: <T,>(component: T) => component }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    resolvedFormattingLanguageTag: "en",
    formatNumber: (value: number | undefined) => String(value ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
  }),
}));
vi.mock("@/core/utils/server-rendered-client", () => ({ serverRenderedClient: <T,>(component: T) => component }));
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

import { FREE_PLAN_USAGE_LIMITS } from "@/core/commercial/plan-catalog";
import { AgentUpgradePanel } from "@/app/components/agent-chat/agent-upgrade-panel";

import { PlanLimitNotice } from "../plan-limit-notice";
import { PlanUsageCard } from "../plan-usage-card";
import { PaymentFailedBanner } from "../payment-failed-banner";
import { PlanPausedBanner } from "../plan-paused-banner";
import { TeamsNeedPlanPanel } from "../teams-need-plan-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(node: ReactNode) {
  act(() => root.render(node));
}

beforeEach(() => {
  harness.user = {};
  harness.canUpdateCompany = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("record limit notice", () => {
  it("stays hidden below 80 percent of the records", () => {
    render(<PlanLimitNotice kind="records" limit={250} used={199} />);

    expect(container.querySelector("[data-plan-limit]")).toBeNull();
  });

  it("warns at 80 percent and names Starter with its price", () => {
    render(<PlanLimitNotice kind="records" limit={250} used={200} />);

    const notice = container.querySelector("[data-plan-limit='records']");
    expect(notice?.getAttribute("data-usage-level")).toBe("approaching");
    expect(notice?.textContent).toContain("PlanUsage.recordsApproaching(200|250)");
    expect(notice?.textContent).toContain("Upsell.planPrice(Subscription.planNames.starter|€12)");
    expect(notice?.querySelector("a")?.getAttribute("href")).toBe("/settings/billing?plan=starter");
    expect(notice?.querySelector("a")?.textContent).toBe("Upsell.upgradeTo(Subscription.planNames.starter)");
  });

  it("says the limit is reached at 250 records", () => {
    render(<PlanLimitNotice kind="records" limit={250} used={250} />);

    const notice = container.querySelector("[data-plan-limit='records']");
    expect(notice?.getAttribute("data-usage-level")).toBe("reached");
    expect(notice?.textContent).toContain("PlanUsage.recordsReached(250|250)");
  });

  it("sends a member who cannot change the plan to an admin instead of a billing link", () => {
    harness.canUpdateCompany = false;
    render(<PlanLimitNotice kind="records" limit={250} used={250} />);

    const notice = container.querySelector("[data-plan-limit='records']");
    expect(notice?.querySelector("a")).toBeNull();
    expect(notice?.querySelector("[data-upsell-ask-admin]")?.textContent).toBe(
      "Upsell.askAdmin(Subscription.planNames.starter)",
    );
  });

  it("prompts for people only once the one Free seat is taken", () => {
    render(<PlanLimitNotice kind="members" limit={1} used={0} />);
    expect(container.querySelector("[data-plan-limit='members']")).toBeNull();

    render(<PlanLimitNotice kind="members" limit={1} used={1} />);
    expect(container.querySelector("[data-plan-limit='members']")?.textContent).toContain(
      "PlanUsage.membersReached(1|1)",
    );
  });
});

describe("teams need a plan", () => {
  it("tells a Free workspace that teams start on Starter, with the price and a billing link", () => {
    const onNavigate = vi.fn();
    render(<TeamsNeedPlanPanel onNavigate={onNavigate} />);

    const panel = container.querySelector("[data-teams-need-plan]");
    expect(panel?.textContent).toContain("PlanUsage.teamsTitle(Subscription.planNames.starter)");
    expect(panel?.textContent).toContain("Upsell.planPrice(Subscription.planNames.starter|€12)");
    const link = panel?.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/settings/billing?plan=starter");
    act(() => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("tells a member who cannot change the plan to ask an admin instead of linking to billing", () => {
    harness.canUpdateCompany = false;
    render(<TeamsNeedPlanPanel />);

    const panel = container.querySelector("[data-teams-need-plan]");
    expect(panel?.querySelector("a")).toBeNull();
    expect(panel?.querySelector("[data-upsell-ask-admin]")?.textContent).toBe(
      "Upsell.askAdmin(Subscription.planNames.starter)",
    );
  });

  it("keeps the upgrade action while the user is still loading", () => {
    harness.user = null;
    harness.canUpdateCompany = false;
    render(<TeamsNeedPlanPanel />);

    expect(container.querySelector("[data-teams-need-plan] a")).not.toBeNull();
  });
});

describe("plan paused banner", () => {
  it("shows how many people are paused and links to Starter", () => {
    render(<PlanPausedBanner subscription={{ onFreePlan: true, pausedMembers: 2 }} />);

    const banner = container.querySelector("[data-plan-paused-banner]");
    expect(banner?.textContent).toContain("PlanPause.banner(2|Subscription.planNames.starter)");
    expect(banner?.querySelector("a")?.getAttribute("href")).toBe("/settings/billing?plan=starter");
  });

  it("stays hidden without paused people or off Free", () => {
    render(
      <>
        <PlanPausedBanner subscription={{ onFreePlan: true, pausedMembers: 0 }} />

        <PlanPausedBanner subscription={{ onFreePlan: false, pausedMembers: 2 }} />

        <PlanPausedBanner subscription={null} />
      </>,
    );

    expect(container.querySelector("[data-plan-paused-banner]")).toBeNull();
  });
});

describe("plan usage card", () => {
  it("shows people, records, storage, the API limits and the paused people against the Free limits", () => {
    render(
      <PlanUsageCard
        usage={{
          plan: "free",
          limits: FREE_PLAN_USAGE_LIMITS,
          usage: { members: 1, pausedMembers: 2, records: 212, storageBytes: 1024, apiRequestsToday: 42 },
        }}
      />,
    );

    const meter = (id: string) => container.querySelector(`[data-plan-usage='${id}']`);
    expect(meter("members")?.textContent).toContain("PlanUsage.of(1|1)");
    expect(meter("members")?.getAttribute("data-usage-level")).toBe("reached");
    expect(meter("records")?.textContent).toContain("PlanUsage.of(212|250)");
    expect(meter("records")?.getAttribute("data-usage-level")).toBe("approaching");
    expect(meter("customLists")).toBeNull();
    expect(meter("storage")).not.toBeNull();
    expect(meter("api")?.textContent).toContain("PlanUsage.apiToday");
    expect(meter("api")?.textContent).toContain("PlanUsage.of(42|200)");
    expect(meter("api")?.getAttribute("data-usage-level")).toBe("ok");
    expect(container.querySelector("#settings-billing-plan-usage")?.textContent).toContain(
      "PlanUsage.apiPerMinute(30)",
    );
    expect(meter("paused")?.textContent).toContain("PlanUsage.paused(2)");
  });

  it("leaves out the paused line when nobody is paused and renders nothing on a plan without limits", () => {
    render(
      <PlanUsageCard
        usage={{
          plan: "free",
          limits: FREE_PLAN_USAGE_LIMITS,
          usage: { members: 1, pausedMembers: 0, records: 3, storageBytes: 0, apiRequestsToday: 0 },
        }}
      />,
    );
    expect(container.querySelector("[data-plan-usage='paused']")).toBeNull();

    render(
      <PlanUsageCard
        usage={{
          plan: "pro",
          limits: null,
          usage: { members: 0, pausedMembers: 0, records: 0, storageBytes: 0, apiRequestsToday: 0 },
        }}
      />,
    );

    expect(container.querySelector("#settings-billing-plan-usage")).toBeNull();
  });
});

describe("Mate upgrade panel", () => {
  it("explains that Mate is not on Free, keeps MCP as the free path and upgrades to Starter", () => {
    const onClose = vi.fn();
    render(<AgentUpgradePanel plan="starter" onClose={onClose} />);

    const panel = container.querySelector("[data-testid='agent-upgrade-panel']");
    expect(panel?.textContent).toContain("Upsell.locked.mate.title");
    expect(panel?.textContent).toContain("Upsell.locked.mate.description");
    expect(panel?.textContent).toContain("Upsell.planPrice(Subscription.planNames.starter|€12)");
    const link = panel?.querySelector("a");
    expect(link?.textContent).toBe("Upsell.upgradeTo(Subscription.planNames.starter)");
    expect(link?.getAttribute("href")).toBe("/settings/billing?plan=starter");
    act(() => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("payment failed banner", () => {
  it("shows the grey strip with one ink action to billing when the last payment failed", () => {
    render(<PaymentFailedBanner canOpenBilling subscription={{ status: "pastDue", plan: "pro", onFreePlan: false }} />);

    const banner = container.querySelector("[data-payment-failed-banner]");
    expect(banner?.getAttribute("data-layout")).toBe("banner");
    expect(banner?.textContent).toContain("PlanBanner.paymentFailed(Subscription.planNames.pro)");
    expect(banner?.querySelector("a")?.getAttribute("href")).toBe("/settings/billing");
  });

  it("stays hidden for a healthy subscription, on Free and for people who cannot open billing", () => {
    render(
      <>
        <PaymentFailedBanner canOpenBilling subscription={{ status: "active", plan: "pro", onFreePlan: false }} />

        <PaymentFailedBanner canOpenBilling subscription={{ status: "pastDue", plan: "pro", onFreePlan: true }} />

        <PaymentFailedBanner
          canOpenBilling={false}
          subscription={{ status: "unPaid", plan: "pro", onFreePlan: false }}
        />
      </>,
    );

    expect(container.querySelector("[data-payment-failed-banner]")).toBeNull();
  });
});

describe("usage meter tone", () => {
  it("draws a full allowance in ink, warns only on records and storage, and turns red only over the limit", async () => {
    const { usageMeterTone } = await import("../plan-usage-bar");

    expect(usageMeterTone(1, 1, false)).toBe("full");
    expect(usageMeterTone(0, 1, false)).toBe("ok");
    expect(usageMeterTone(2, 1, false)).toBe("over");
    expect(usageMeterTone(199, 250, true)).toBe("ok");
    expect(usageMeterTone(212, 250, true)).toBe("approaching");
    expect(usageMeterTone(250, 250, true)).toBe("approaching");
    expect(usageMeterTone(251, 250, true)).toBe("over");
  });
});
