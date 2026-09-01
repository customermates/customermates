import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  decide: vi.fn(),
  read: vi.fn(),
  reconcile: vi.fn(),
  report: vi.fn(),
  pathname: "/",
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ appearance: _appearance, onClick, ...props }: React.ComponentProps<"a"> & { appearance?: string }) =>
    createElement("a", {
      ...props,
      onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        onClick?.(event);
      },
    }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ variant, ...props }: React.ComponentProps<"button"> & { variant?: string }) =>
    createElement("button", { ...props, "data-variant": variant ?? "default" }),
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children, modal, open }: { children: React.ReactNode; modal?: boolean; open: boolean }) =>
    open ? createElement("div", { "data-popover-modal": String(modal) }, children) : null,
  PopoverAnchor: ({ children }: { children: React.ReactNode }) => children,
  PopoverContent: ({
    align: _align,
    side: _side,
    sideOffset: _sideOffset,
    onEscapeKeyDown: _onEscapeKeyDown,
    onInteractOutside: _onInteractOutside,
    ...props
  }: React.ComponentProps<"div"> & Record<string, unknown>) => createElement("div", props),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: mocks.report,
  runUserAction: (action: () => unknown) => void Promise.resolve(action()).catch(mocks.report),
}));
vi.mock("@/features/acquisition/google-ads-consent.actions", () => ({
  captureConsentedGoogleAdsClickAction: mocks.capture,
  decidePublicGoogleAdsConsentAction: mocks.decide,
  readPublicGoogleAdsConsentAction: mocks.read,
  reconcileGoogleAdsAttributionWithdrawalAction: mocks.reconcile,
}));

import { PublicGoogleAdsConsent } from "../public-google-ads-consent";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(null);
  mocks.capture.mockResolvedValue(undefined);
  mocks.reconcile.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState({}, "", "/");
  vi.useRealTimers();
});

async function render(path: string) {
  window.history.replaceState({}, "", path);
  mocks.pathname = new URL(path, window.location.origin).pathname;
  await act(async () => {
    root.render(createElement(PublicGoogleAdsConsent));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function navigate(path: string) {
  window.history.replaceState(null, "", path);
  mocks.pathname = new URL(path, window.location.origin).pathname;
  await act(async () => {
    root.render(createElement(PublicGoogleAdsConsent));
    await Promise.resolve();
  });
}

describe("PublicGoogleAdsConsent", () => {
  it.each(["gclid", "gbraid", "wbraid"])("opens only for a fresh %s click", async (kind) => {
    await render(`/en/features/cloud-crm?${kind}=paid-click`);
    const card = container.querySelector('[data-testid="google-ads-consent-card"]');
    expect(card).not.toBeNull();
    expect(container.querySelector('[data-popover-modal="true"]')).not.toBeNull();
    expect(card?.querySelectorAll("button")).toHaveLength(2);
    expect(card?.textContent).not.toContain("Common.actions.close");
  });

  it("does not interrupt traffic without a Google click ID", async () => {
    await render("/en/features/cloud-crm?utm_source=google&utm_medium=cpc");
    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).toBeNull();
  });

  it.each(["/en/auth/signup", "/en/dashboard"])(
    "does not start attribution on an ineligible %s landing",
    async (path) => {
      await render(`${path}?gclid=paid-click`);
      expect(container.querySelector('[data-testid="google-ads-consent-card"]')).toBeNull();
    },
  );

  it("emphasizes allow, persists refusal, and closes only after the decision", async () => {
    mocks.decide.mockResolvedValue({
      advertising: false,
      decidedAt: "2026-08-31T10:00:00.000Z",
    });
    await render("/en/features/cloud-crm?gclid=paid-click");
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons[0]?.dataset.variant).toBe("default");
    expect(buttons[1]?.dataset.variant).toBe("secondary");

    await act(async () => {
      buttons[1]?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.decide).toHaveBeenCalledWith({
      choice: "necessary-only",
      visit: expect.objectContaining({ pendingAt: expect.any(String), search: "?gclid=paid-click" }),
    });
    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).toBeNull();
  });

  it("closes after refusal without waiting for database cleanup", async () => {
    mocks.decide.mockResolvedValue({
      advertising: false,
      decidedAt: "2026-08-31T10:00:00.000Z",
    });
    mocks.reconcile.mockReturnValue(new Promise(() => undefined));
    await render("/en/features/cloud-crm?gclid=paid-click");

    await act(async () => {
      container.querySelectorAll("button")[1]?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.reconcile).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).toBeNull();
  });

  it("submits only one decision when the primary action is clicked twice", async () => {
    let resolveDecision: ((value: { advertising: true; decidedAt: string }) => void) | undefined;
    mocks.decide.mockReturnValue(
      new Promise((resolve) => {
        resolveDecision = resolve;
      }),
    );
    await render("/en/features/cloud-crm?gclid=paid-click");
    const allow = container.querySelectorAll("button")[0];

    await act(async () => {
      allow?.click();
      allow?.click();
      await Promise.resolve();
    });

    expect(mocks.decide).toHaveBeenCalledOnce();

    await act(async () => {
      resolveDecision?.({ advertising: true, decidedAt: "2026-08-31T10:00:00.000Z" });
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("keeps the dialog retryable after a failed decision request", async () => {
    mocks.decide.mockRejectedValueOnce(new Error("decision unavailable"));
    await render("/en/features/cloud-crm?gclid=retry-click");
    const allow = container.querySelectorAll("button")[0];

    await act(async () => {
      allow?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.report).toHaveBeenCalledOnce();
    expect(allow?.disabled).toBe(false);
    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).not.toBeNull();

    mocks.decide.mockResolvedValue({ advertising: true, decidedAt: "2026-08-31T10:00:00.000Z" });
    await act(async () => {
      allow?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.decide).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).toBeNull();
  });

  it("stays open while the visitor reads the explicit privacy information path", async () => {
    await render("/en/features/cloud-crm?gclid=paid-click");
    await act(async () => {
      container.querySelector<HTMLAnchorElement>("a")?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).not.toBeNull();
  });

  it("keeps only the landing click in the marked URL across routes until the visitor decides", async () => {
    mocks.decide.mockResolvedValue({
      advertising: true,
      decidedAt: "2026-08-31T10:00:00.000Z",
    });
    await render("/en/features/cloud-crm?utm_source=google&gclid=paid-click&utm_campaign=cloud-crm");
    await navigate("/en/compare");

    expect(new URLSearchParams(window.location.search).get("gclid")).toBe("paid-click");
    expect(Number(new URLSearchParams(window.location.search).get("cm_ads_pending"))).toBeGreaterThan(0);

    await act(async () => {
      container.querySelectorAll("button")[0]?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.decide).toHaveBeenCalledWith({
      choice: "allow-attribution",
      visit: expect.objectContaining({ pendingAt: expect.any(String), search: "?gclid=paid-click" }),
    });
    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("leaves the undecided click in the destination URL so a full reload can recover it", async () => {
    await render("/en/features/cloud-crm?gclid=reload-safe-click");
    await navigate("/en/privacy");

    expect(window.location.pathname).toBe("/en/privacy");
    expect(new URLSearchParams(window.location.search).get("gclid")).toBe("reload-safe-click");
    expect(Number(new URLSearchParams(window.location.search).get("cm_ads_pending"))).toBeGreaterThan(0);

    act(() => root.unmount());
    root = createRoot(container);
    await render(window.location.href);

    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).not.toBeNull();
  });

  it("recovers an undecided click after reloading an otherwise ineligible signup route", async () => {
    await render("/en/features/cloud-crm?gclid=signup-reload-click");
    await navigate("/en/auth/signup");

    expect(new URLSearchParams(window.location.search).get("gclid")).toBe("signup-reload-click");
    expect(Number(new URLSearchParams(window.location.search).get("cm_ads_pending"))).toBeGreaterThan(0);

    act(() => root.unmount());
    root = createRoot(container);
    await render(window.location.href);

    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).not.toBeNull();
  });

  it("restores the first pending click after same-path browser history navigation", async () => {
    await render("/en/features/cloud-crm?gclid=first-pending-click");

    window.history.pushState(null, "", "/en/features/cloud-crm?view=kanban&gclid=later-click");
    window.dispatchEvent(new PopStateEvent("popstate"));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("view")).toBe("kanban");
    expect(params.get("gclid")).toBe("first-pending-click");
    expect(Number(params.get("cm_ads_pending"))).toBeGreaterThan(0);
  });

  it("snapshots the landing click before an immediate route change", async () => {
    let resolveConsent: ((value: null) => void) | undefined;
    mocks.read.mockReturnValue(
      new Promise<null>((resolve) => {
        resolveConsent = resolve;
      }),
    );

    await render("/en/features/cloud-crm?gclid=fast-paid-click");
    window.history.replaceState({}, "", "/en/compare");

    await act(async () => {
      resolveConsent?.(null);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).not.toBeNull();
  });

  it("reconciles a stored refusal without prompting", async () => {
    mocks.read.mockResolvedValue({
      advertising: false,
      decidedAt: "2026-08-31T10:00:00.000Z",
    });
    await render("/en/features/cloud-crm?gclid=paid-click");
    expect(mocks.reconcile).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("captures a new click under stored consent and removes it from the visible URL", async () => {
    mocks.read.mockResolvedValue({
      advertising: true,
      decidedAt: "2026-08-31T10:00:00.000Z",
    });

    await render("/en/features/cloud-crm?utm_source=google&gclid=paid-click");

    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({ pendingAt: expect.any(String), search: "?gclid=paid-click" }),
    );
    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).toBeNull();
    expect(window.location.search).toBe("?utm_source=google");
  });

  it("removes a decided click restored by browser history", async () => {
    mocks.read.mockResolvedValue({
      advertising: false,
      decidedAt: "2026-08-31T10:00:00.000Z",
    });
    await render("/en/features/cloud-crm");

    window.history.pushState(null, "", "/en/features/cloud-crm?gclid=history-click");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(window.location.search).toBe("");
  });

  it("does not reprompt when stored-consent capture fails", async () => {
    mocks.read.mockResolvedValue({
      advertising: true,
      decidedAt: "2026-08-31T10:00:00.000Z",
    });
    mocks.capture.mockRejectedValue(new Error("capture unavailable"));

    await render("/en/features/cloud-crm?gclid=paid-click");

    expect(mocks.report).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("strips an expired marked click instead of reopening or refreshing it", async () => {
    const staleMarker = Math.floor(Date.now() / 1000) - 60 * 60 * 24 - 1;

    await render(`/en/auth/signup?gclid=stale-click&cm_ads_pending=${staleMarker}`);

    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("expires and strips a live pending click after 24 hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T10:00:00.000Z"));
    await render("/en/features/cloud-crm?gclid=live-expiry-click");

    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 24 * 1000);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).toBeNull();
    expect(window.location.search).toBe("");
  });
});
