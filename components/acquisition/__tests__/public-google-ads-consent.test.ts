import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  decide: vi.fn(),
  read: vi.fn(),
  reconcile: vi.fn(),
  report: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
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
  Popover: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? children : null),
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
});

async function render(path: string) {
  window.history.replaceState({}, "", path);
  await act(async () => {
    root.render(createElement(PublicGoogleAdsConsent));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("PublicGoogleAdsConsent", () => {
  it.each(["gclid", "gbraid", "wbraid"])("opens only for a fresh %s click", async (kind) => {
    await render(`/en/features/cloud-crm?${kind}=paid-click`);
    const card = container.querySelector('[data-testid="google-ads-consent-card"]');
    expect(card).not.toBeNull();
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
      visit: { search: "?gclid=paid-click" },
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

  it("stays open while the visitor reads the explicit privacy information path", async () => {
    await render("/en/features/cloud-crm?gclid=paid-click");
    await act(async () => {
      container.querySelector<HTMLAnchorElement>("a")?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).not.toBeNull();
  });

  it("keeps only the landing click in memory across routes until the visitor decides", async () => {
    mocks.decide.mockResolvedValue({
      advertising: true,
      decidedAt: "2026-08-31T10:00:00.000Z",
    });
    await render("/en/features/cloud-crm?utm_source=google&gclid=paid-click&utm_campaign=cloud-crm");
    window.history.replaceState({}, "", "/en/compare");

    await act(async () => {
      container.querySelectorAll("button")[0]?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.decide).toHaveBeenCalledWith({
      choice: "allow-attribution",
      visit: { search: "?gclid=paid-click" },
    });
    expect(container.querySelector('[data-testid="google-ads-consent-card"]')).toBeNull();
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
  });
});
