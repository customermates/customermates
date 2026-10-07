import type { ReactElement } from "react";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { createZodError } from "@/core/validation/validation.utils";

const mocks = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  getThread: vi.fn(),
  getThreads: vi.fn(),
  hasPermission: vi.fn(),
  readSurfaceParams: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn().mockResolvedValue((key: string) => key) }));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));
vi.mock("@/features/auth/next/require", () => ({ requireAccess: mocks.requireAccess }));
vi.mock("@/core/data-view/next/read-surface-params", () => ({ readSurfaceParams: mocks.readSurfaceParams }));
vi.mock("@/core/di", () => ({
  getGetMessagingThreadInteractor: () => ({ invoke: mocks.getThread }),
  getGetMessagingThreadsInteractor: () => ({ invoke: mocks.getThreads }),
  getGetSubscriptionInteractor: () => ({ invoke: mocks.getSubscription }),
  getUserService: () => ({ hasPermission: mocks.hasPermission }),
}));
vi.mock("@/components/shared/page-container", () => ({ PageContainer: "page-container" }));
vi.mock("@/components/shared/locked-feature-overlay", () => ({ LockedFeatureOverlay: "locked-feature-overlay" }));
vi.mock("../components/inbox-list", () => ({ InboxList: "inbox-list" }));
vi.mock("../components/inbox-surface", () => ({ InboxSurface: "inbox-surface" }));
vi.mock("../components/thread-panel", () => ({ ThreadPanel: "thread-panel" }));

import InboxPage from "../page";

const threadId = "17000000-0000-4000-8000-000000000015";

function subscription(plan: SubscriptionPlan, status: SubscriptionStatus) {
  return {
    ok: true,
    data: {
      activeUsers: 1,
      currentPeriodEnd: null,
      hasActiveSubscription: true,
      hasBillingPortal: true,
      plan,
      quantity: 1,
      status,
      trialEndDate: null,
    },
  };
}

async function renderPage() {
  return (await InboxPage({ searchParams: Promise.resolve({ threadId }) })) as ReactElement<{
    children: ReactElement<Record<string, unknown>>;
  }>;
}

describe("InboxPage subscription lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasPermission.mockResolvedValue(true);
    mocks.readSurfaceParams.mockResolvedValue({});
    mocks.getThread.mockResolvedValue({ ok: false, error: createZodError("paidSubscriptionRequired") });
    mocks.getThreads.mockResolvedValue({ ok: false, error: createZodError("paidSubscriptionRequired") });
  });

  it.each([SubscriptionStatus.pastDue, SubscriptionStatus.cancelled])(
    "renders the refusal overlay instead of loading threads while the subscription is %s",
    async (status) => {
      mocks.getSubscription.mockResolvedValue(subscription(SubscriptionPlan.pro, status));

      const page = await renderPage();
      const overlay = page.props.children;

      expect(overlay.type).toBe("locked-feature-overlay");
      expect(overlay.props).toMatchObject({
        ctaHref: "/settings/plan",
        description: "ConnectedAccountsCard.paidSubscriptionRequired",
      });
      expect(mocks.getThreads).not.toHaveBeenCalled();
      expect(mocks.getThread).not.toHaveBeenCalled();
    },
  );

  it("keeps the plan upsell copy on Starter", async () => {
    mocks.getSubscription.mockResolvedValue(subscription(SubscriptionPlan.starter, SubscriptionStatus.active));

    const page = await renderPage();

    expect(page.props.children.type).toBe("locked-feature-overlay");
    expect(page.props.children.props).toMatchObject({ description: "MessagingUpsell.description" });
    expect(mocks.getThreads).not.toHaveBeenCalled();
  });

  it("loads threads without an overlay on an active Pro subscription", async () => {
    mocks.getSubscription.mockResolvedValue(subscription(SubscriptionPlan.pro, SubscriptionStatus.active));
    mocks.getThread.mockResolvedValue({ ok: true, data: { thread: { id: threadId } } });
    mocks.getThreads.mockResolvedValue({ ok: true, data: { items: [] } });

    const page = await renderPage();

    expect(page.props.children.type).toBe("inbox-surface");
    expect(mocks.getThreads).toHaveBeenCalledOnce();
    expect(mocks.getThread).toHaveBeenCalledWith({ threadId });
  });
});
