import type { ReactNode } from "react";
import type { Root as ReactRoot } from "react-dom/client";
import type { RootStoreInitialState } from "../root-store.provider";
import type { TenantUser } from "@/features/user/user.schema";
import type { Company } from "@/generated/prisma";

import { act, createElement, Suspense, use } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Action,
  Currency,
  EntityType,
  Locale,
  Resource,
  Status,
  SubscriptionPlan,
  SubscriptionStatus,
  Theme,
} from "@/generated/prisma";

vi.mock("../root.store", () => ({
  RootStore: class {
    readonly appMode: string;
    readonly localeStore = {
      locale: "en",
      setLocale: (locale: string) => {
        this.localeStore.locale = locale;
      },
    };
    readonly userStore = {
      user: null as TenantUser | null,
      setUser: (user: TenantUser | null) => {
        this.userStore.user = user;
      },
      can: () => this.userStore.user !== null,
    };
    readonly companyStore = {
      company: null as Company | null,
      setCompany: (company: Company | null) => {
        this.companyStore.company = company;
      },
    };
    readonly terminologyStore = {
      overrides: [] as RootStoreInitialState["terminology"],
      setOverrides: (overrides: RootStoreInitialState["terminology"]) => {
        this.terminologyStore.overrides = overrides;
      },
    };
    readonly subscriptionStore = {
      subscription: null as RootStoreInitialState["subscription"],
      setSubscription: (subscription: RootStoreInitialState["subscription"]) => {
        this.subscriptionStore.subscription = subscription;
      },
    };
    readonly intlStore = {
      markClientHydrated: () => undefined,
      formatNumber: (value: number) =>
        new Intl.NumberFormat(this.localeStore.locale === "de" ? "de-DE" : "en-US").format(value),
    };

    constructor(appMode: string) {
      this.appMode = appMode;
    }
  },
}));

import { RootStoreProvider, useRootStore } from "../root-store.provider";

const mountedRoots: ReactRoot[] = [];
const mountedContainers: HTMLElement[] = [];

let delayHydration = false;
let releaseHydration: (() => void) | null = null;
let hydrationDelay: Promise<void> | null = null;

const initialState: RootStoreInitialState = {
  locale: "de",
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    companyId: "company-1",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    roleId: null,
    status: Status.active,
    country: "de",
    avatarUrl: null,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-01T00:00:00.000Z"),
    displayLanguage: Locale.de,
    formattingLocale: Locale.system,
    theme: Theme.system,
    agreeToTerms: true,
    lastActiveAt: null,
    onboardingWizardCompletedAt: new Date("2025-01-01T00:00:00.000Z"),
    role: { isSystemRole: true, permissions: [] },
  } as unknown as TenantUser,
  company: { currency: Currency.usd } as unknown as Company,
  terminology: [{ entityType: EntityType.deal, presetKey: "opportunity" }],
  subscription: {
    status: SubscriptionStatus.active,
    plan: SubscriptionPlan.pro,
    quantity: 1,
    activeUsers: 1,
    trialEndDate: null,
    currentPeriodEnd: null,
    customerPortalUrl: null,
    hasActiveSubscription: true,
  },
};

function DelayedBoundary({ children }: { children: ReactNode }) {
  if (delayHydration && hydrationDelay) use(hydrationDelay);
  return children;
}

function InitialStateProbe() {
  const rootStore = useRootStore();
  const values = [
    rootStore.userStore.can(Resource.contacts, Action.readAll) ? "allowed" : "blocked",
    rootStore.companyStore.company?.currency,
    rootStore.terminologyStore.overrides[0]?.presetKey,
    rootStore.subscriptionStore.subscription?.plan,
    rootStore.intlStore.formatNumber(1234.5),
  ];
  return createElement("span", { "data-initial-state": true }, values.join("|"));
}

function TestApp() {
  const children = createElement(
    Suspense,
    { fallback: createElement("span", { "data-fallback": true }) },
    createElement(DelayedBoundary, null, createElement(InitialStateProbe)),
  );
  const props = { appMode: "cloud", initialState } as Parameters<typeof RootStoreProvider>[0];
  return createElement(RootStoreProvider, props, children);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  delayHydration = false;
  releaseHydration = null;
  hydrationDelay = null;
});

afterEach(() => {
  act(() => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  for (const container of mountedContainers.splice(0)) container.remove();
});

describe("RootStoreProvider initial state", () => {
  it("seeds permission, company, terminology, subscription, and locale before a delayed child hydrates", async () => {
    const html = renderToString(createElement(TestApp));
    expect(html).toContain("allowed|usd|opportunity|pro|1.234,5");

    hydrationDelay = new Promise<void>((resolve) => {
      releaseHydration = resolve;
    });
    delayHydration = true;

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    mountedContainers.push(container);

    const recoverableErrors: unknown[] = [];
    let root: ReactRoot | undefined;
    await act(async () => {
      root = hydrateRoot(container, createElement(TestApp), {
        onRecoverableError: (error) => recoverableErrors.push(error),
      });
      await Promise.resolve();
    });
    if (!root) throw new Error("Expected hydration to create a React root");
    mountedRoots.push(root);

    expect(container.querySelector("[data-initial-state]")?.textContent).toBe("allowed|usd|opportunity|pro|1.234,5");

    await act(async () => {
      delayHydration = false;
      releaseHydration?.();
      await hydrationDelay;
    });

    await vi.waitFor(() => {
      expect(container.querySelector("[data-initial-state]")?.textContent).toBe("allowed|usd|opportunity|pro|1.234,5");
    });
    expect(recoverableErrors).toEqual([]);
  });
});
