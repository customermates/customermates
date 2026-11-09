import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  canUpdateCompany: true,
  subscription: null as { plan: string; onFreePlan: boolean } | null,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    userStore: { user: {}, can: () => harness.canUpdateCompany },
    subscriptionStore: { subscription: harness.subscription },
  }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).map(String).join("|")})` : key,
}));
vi.mock("mobx-react-lite", () => ({ observer: <T,>(component: T) => component }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatNumber: (value: number | undefined, options?: { maximumFractionDigits?: number }) =>
      String(Number((value ?? 0).toFixed(options?.maximumFractionDigits ?? 3))),
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { isStorageQuotaFailure, StorageFailureAction } from "../storage-failure-action";
import { StorageUpsellNote } from "../storage-upsell-note";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(node: ReactNode) {
  act(() => root.render(node));
}

beforeEach(() => {
  harness.canUpdateCompany = true;
  harness.subscription = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("storage meter note", () => {
  it("names Starter on Free with what it includes per user and links to billing focused on it", () => {
    render(<StorageUpsellNote plan="free" />);

    const note = container.querySelector("[data-storage-upsell]");
    expect(note?.getAttribute("data-storage-upsell")).toBe("starter");
    expect(note?.textContent).toContain("Upsell.storage.nextPlan(Subscription.planNames.starter|1 GB)");
    expect(note?.querySelector("a")?.getAttribute("href")).toBe("/settings/billing?plan=starter");
    expect(note?.querySelector("a")?.textContent).toBe("Subscription.picker.choose(Subscription.planNames.starter)");
  });

  it.each([
    ["starter", "pro", "5 GB"],
    ["pro", "business", "20 GB"],
    ["business", "max", "50 GB"],
  ] as const)("points %s to %s, the next plan with more storage", (plan, next, size) => {
    render(<StorageUpsellNote plan={plan} />);

    expect(container.querySelector("[data-storage-upsell]")?.getAttribute("data-storage-upsell")).toBe(next);
    expect(container.textContent).toContain(`Upsell.storage.nextPlan(Subscription.planNames.${next}|${size})`);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(`/settings/billing?plan=${next}`);
  });

  it("says contact support on the top plan and on a contract, with no billing link", () => {
    for (const plan of ["max", "enterprise"] as const) {
      render(<StorageUpsellNote plan={plan} />);

      const note = container.querySelector("[data-storage-upsell]");
      expect(note?.getAttribute("data-storage-upsell")).toBe("support");
      expect(note?.textContent).toContain("Upsell.storage.topPlan");
      expect(note?.querySelector("a")?.getAttribute("href")).toContain("mailto:");
      expect(note?.querySelector("a")?.textContent).toBe("CheckoutPending.contactSupport");
      expect(container.innerHTML).not.toContain("/settings/billing");
    }
  });

  it("tells a member who cannot change the plan to ask an admin", () => {
    harness.canUpdateCompany = false;
    render(<StorageUpsellNote plan="starter" />);

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[data-upsell-ask-admin]")?.textContent).toBe(
      "Upsell.askAdmin(Subscription.planNames.pro)",
    );
  });
});

describe("upload failure action", () => {
  it("recognises the two storage refusals by their code", () => {
    expect(isStorageQuotaFailure("storageQuotaExceeded")).toBe(true);
    expect(isStorageQuotaFailure("storageQuotaExceededTopPlan")).toBe(true);
    expect(isStorageQuotaFailure("recordFileTooLarge")).toBe(false);
    expect(isStorageQuotaFailure(undefined)).toBe(false);
  });

  it("links to billing focused on the next plan with more storage for the workspace's plan", () => {
    harness.subscription = { plan: "pro", onFreePlan: false };
    render(<StorageFailureAction />);

    expect(container.querySelector("a")?.getAttribute("href")).toBe("/settings/billing?plan=business");
  });

  it("reads an ended trial as Free and offers Starter", () => {
    harness.subscription = { plan: "pro", onFreePlan: true };
    render(<StorageFailureAction />);

    expect(container.querySelector("a")?.getAttribute("href")).toBe("/settings/billing?plan=starter");
  });

  it("adds nothing on the top plan, where the message itself says to contact support", () => {
    harness.subscription = { plan: "max", onFreePlan: false };
    render(<StorageFailureAction />);

    expect(container.innerHTML).toBe("");
  });

  it("asks a member without billing rights to ask an admin", () => {
    harness.subscription = { plan: "starter", onFreePlan: false };
    harness.canUpdateCompany = false;
    render(<StorageFailureAction />);

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[data-upsell-ask-admin]")?.textContent).toContain("Subscription.planNames.pro");
  });
});
