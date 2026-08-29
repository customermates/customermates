import type { OperatorUserDetailDto, OperatorUserPageDto, OperatorUserSummaryDto } from "@/ee/operator/operator.schema";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { jsx } from "react/jsx-runtime";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/i18n/locales/en.json";

const mocks = vi.hoisted(() => ({
  adjustment: vi.fn(),
  detail: vi.fn(),
  list: vi.fn(),
  refresh: vi.fn(),
  reset: vi.fn(),
  status: vi.fn(),
  subscription: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../actions", () => ({
  correctOperatorSubscriptionSnapshotAction: mocks.subscription,
  createOperatorUserCreditAdjustmentAction: mocks.adjustment,
  getOperatorUserDetailAction: mocks.detail,
  listOperatorUsersAction: mocks.list,
  resetOperatorUserCreditsAction: mocks.reset,
  updateOperatorUserStatusAction: mocks.status,
}));

import { OperatorUserDetailPanel } from "../operator-user-detail";
import { OperatorUsersConsole } from "../operator-users-console";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PERIOD_START = "2026-08-17T13:42:19.000Z";
const PERIOD_END = "2026-09-17T13:42:19.000Z";
const UPDATED_AT = "2026-08-28T12:00:00.000Z";
const SUBSCRIPTION_UPDATED_AT = "2026-08-28T11:00:00.000Z";

const user = {
  userId: USER_ID,
  companyId: COMPANY_ID,
  email: "linnea@example.com",
  displayName: "Linnea Example",
  status: "active",
  isPlatformOperator: true,
  authEmailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastActiveAt: UPDATED_AT,
  role: { name: "Admin", isSystemRole: true },
  updatedAt: UPDATED_AT,
  agentCreditActivatedAt: PERIOD_START,
  isCurrentOperator: false,
  statusMutation: { allowed: true, blockedReason: null },
  subscription: {
    plan: "enterprise",
    status: "active",
    quantity: 4,
    billingProviderManaged: true,
    updatedAt: SUBSCRIPTION_UPDATED_AT,
    enterpriseCreditsPerUser: 500,
    agentCreditAnchorAt: PERIOD_START,
    trialEndDate: null,
    currentPeriodEnd: PERIOD_END,
  },
  creditPeriod: {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    baseAllowanceCredits: 500,
    adjustmentCredits: 0,
    effectiveAllowanceCredits: 500,
    chargedCredits: 100,
    reservedCredits: 20,
    committedCredits: 120,
    remainingCredits: 380,
    overageCredits: 0,
    blockedReason: null,
  },
} satisfies OperatorUserDetailDto;

const secondUser = {
  ...user,
  userId: "44444444-4444-4444-8444-444444444444",
  email: "second@example.com",
  displayName: "Second User",
  isPlatformOperator: false,
  isCurrentOperator: false,
} satisfies OperatorUserDetailDto;

const page = {
  users: [user, secondUser],
  nextCursor: "33333333-3333-4333-8333-333333333333",
  total: 26,
} satisfies OperatorUserPageDto;

const summary = {
  totalUsers: 32,
  totalCompanies: 12,
  platformOperators: 4,
  verifiedAuthUsers: 28,
  byStatus: { active: 24, inactive: 5, pendingAuthorization: 3 },
  byPlan: { starter: 8, pro: 7, business: 5, enterprise: 8, missing: 4 },
  bySubscriptionStatus: {
    trial: 4,
    active: 20,
    cancelled: 1,
    expired: 1,
    pastDue: 1,
    unPaid: 1,
    missing: 4,
  },
} satisfies OperatorUserSummaryDto;

let container: HTMLDivElement;
let root: Root;

function render(element: React.ReactNode) {
  act(() => {
    root.render(
      jsx(NextIntlClientProvider, {
        locale: "en",
        messages,
        timeZone: "UTC",
        children: element,
      }),
    );
  });
}

function buttonWithText(text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("OperatorUsersConsole", () => {
  it("renders the server snapshot and opens detail through an opaque POST-style selection", async () => {
    mocks.detail.mockResolvedValueOnce({ status: "success", data: user });
    render(jsx(OperatorUsersConsole, { initialPage: page, summary }));

    expect(container.textContent).toContain("32");
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("Users on active subscriptions");
    expect(container.querySelector("caption")?.className).toContain("sr-only");
    expect(container.querySelector("caption")?.textContent).toContain(
      "Server-paginated cross-workspace user directory",
    );
    expect(container.textContent).toContain("linnea@example.com");
    expect(container.querySelector<HTMLInputElement>("#operatorUserQuery")?.autocomplete).toBe("off");
    expect(container.querySelector<HTMLInputElement>("#operatorUserQuery")?.form?.method.toLowerCase()).toBe("post");
    expect(container.querySelector(`[href*="${USER_ID}"]`)).toBeNull();
    expect(container.querySelector('[href*="linnea%40example.com"]')).toBeNull();

    await act(async () => {
      buttonWithText("Open").click();
      await Promise.resolve();
    });

    expect(mocks.detail).toHaveBeenCalledWith(USER_ID);
    const detailPanel = container.querySelector('aside[aria-label="Selected user controls"]');
    expect(detailPanel?.className).toContain("self-start");
    expect(detailPanel?.className).toContain("xl:top-0");
    expect(detailPanel?.className).not.toContain("xl:top-20");
    expect(container.querySelector("[data-testid=operator-user-detail]")?.textContent).toContain("Admin");
    expect(document.activeElement?.textContent).toBe("Linnea Example");
    expect(container.textContent).toContain("Provider sync may overwrite this change");
    expect(container.textContent).toContain("every user in the workspace");
    expect(container.textContent).toContain("Usage remains immutable");
    const creditLabels = [...container.querySelectorAll("p")];
    expect(
      creditLabels.find((element) => element.textContent === "Charged usage")?.nextElementSibling?.textContent,
    ).toBe("100");
    expect(
      creditLabels.find((element) => element.textContent === "Reserved usage")?.nextElementSibling?.textContent,
    ).toBe("20");
    expect(container.querySelector<HTMLInputElement>('input[name="periodStart"]')?.value).toBe(PERIOD_START);
    expect(container.querySelector<HTMLInputElement>('input[name="periodEnd"]')?.value).toBe(PERIOD_END);

    const reset = container.querySelector<HTMLSelectElement>("#operatorCreditResetMode")?.closest("form");
    expect(reset?.querySelector<HTMLInputElement>('input[name="expectedPeriodStart"]')?.value).toBe(PERIOD_START);
    expect(reset?.querySelector<HTMLInputElement>('input[name="expectedPeriodEnd"]')?.value).toBe(PERIOD_END);
    expect(reset?.querySelector<HTMLInputElement>('input[name="expectedBaseAllowanceCredits"]')?.value).toBe("500");
    expect(reset?.querySelector<HTMLInputElement>('input[name="expectedAdjustmentCredits"]')?.value).toBe("0");
    expect(reset?.querySelector<HTMLInputElement>('input[name="expectedCommittedCredits"]')?.value).toBe("120");

    const subscriptionPlan = container.querySelector<HTMLSelectElement>("#operatorSubscriptionPlan");
    const subscriptionForm = subscriptionPlan?.closest("form");
    expect(subscriptionForm?.querySelectorAll('input[name="userId"]')).toHaveLength(1);
    expect(subscriptionForm?.querySelector<HTMLInputElement>('input[name="expectedUpdatedAt"]')?.value).toBe(
      SUBSCRIPTION_UPDATED_AT,
    );
  });

  it("clears a previously selected account before a failed filter request", async () => {
    mocks.detail.mockResolvedValueOnce({ status: "success", data: user });
    mocks.list.mockResolvedValueOnce({ status: "error", errorCode: "invalidInput" });
    render(jsx(OperatorUsersConsole, { initialPage: page, summary }));

    await act(async () => {
      buttonWithText("Open").click();
      await Promise.resolve();
    });
    expect(container.querySelector("[data-testid=operator-user-detail]")).not.toBeNull();

    const query = container.querySelector<HTMLInputElement>("#operatorUserQuery");
    if (!query?.form) throw new Error("Filter form not rendered");
    query.value = "different@example.com";

    await act(async () => {
      query.dispatchEvent(new Event("input", { bubbles: true }));
      query.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.querySelector("[data-testid=operator-user-detail]")).toBeNull();
    expect(container.textContent).toContain(messages.OperatorUsers.errors.invalidInput);
  });

  it("locks selection during a mutation and ignores a late result for another user", async () => {
    let resolveStatus: ((result: { status: "success"; data: OperatorUserDetailDto }) => void) | undefined;
    mocks.detail.mockResolvedValueOnce({ status: "success", data: user });
    mocks.status.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStatus = resolve;
        }),
    );
    render(jsx(OperatorUsersConsole, { initialPage: page, summary }));

    await act(async () => {
      buttonWithText("Open").click();
      await Promise.resolve();
    });

    const status = container.querySelector<HTMLSelectElement>("#operatorUserStatus");
    const statusForm = status?.closest("form");
    const reason = statusForm?.querySelector<HTMLTextAreaElement>('textarea[name="reason"]');
    const close = container.querySelector<HTMLButtonElement>('[aria-label="Close user details"]');
    const second = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open operator controls for second@example.com"]',
    );
    if (!statusForm || !reason || !close || !second) throw new Error("Mutation controls not rendered");
    reason.value = "Approved account correction";

    act(() => {
      statusForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      close.click();
      second.click();
    });

    expect(close.disabled).toBe(true);
    expect(second.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>("#operatorUserQuery")?.disabled).toBe(true);
    expect(mocks.detail).toHaveBeenCalledTimes(1);

    if (!resolveStatus) throw new Error("Status action did not start");
    const completeStatus = resolveStatus;
    await act(async () => {
      completeStatus({ status: "success", data: secondUser });
      await Promise.resolve();
    });

    const detail = container.querySelector("[data-testid=operator-user-detail]");
    expect(detail?.textContent).toContain("Linnea Example");
    expect(detail?.textContent).not.toContain("Second User");
  });
});

describe("OperatorUserDetailPanel credit controls", () => {
  it("refreshes a stale credit position and retains the reset operation ID on conflict", async () => {
    const onUpdated = vi.fn();
    const refreshed = {
      ...user,
      creditPeriod: { ...user.creditPeriod, adjustmentCredits: 25, effectiveAllowanceCredits: 525 },
    } satisfies OperatorUserDetailDto;
    mocks.reset.mockImplementationOnce((_previous: unknown, formData: FormData) =>
      Promise.resolve({
        status: "error",
        errorCode: "conflict",
        operationId: String(formData.get("operationId")),
      }),
    );
    mocks.detail.mockResolvedValueOnce({ status: "success", data: refreshed });
    render(jsx(OperatorUserDetailPanel, { user, onClose: vi.fn(), onUpdated }));

    const mode = container.querySelector<HTMLSelectElement>("#operatorCreditResetMode");
    const resetForm = mode?.closest("form");
    const reason = resetForm?.querySelector<HTMLTextAreaElement>('textarea[name="reason"]');
    const operationId = resetForm?.querySelector<HTMLInputElement>('input[name="operationId"]')?.value;
    if (!resetForm || !reason || !operationId) throw new Error("Reset form not rendered");
    reason.value = "Approved account correction";

    await act(async () => {
      resetForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(mocks.detail).toHaveBeenCalledWith(USER_ID);
    expect(onUpdated).toHaveBeenCalledWith(refreshed);
    expect(resetForm.querySelector<HTMLInputElement>('input[name="operationId"]')?.value).toBe(operationId);
    expect(container.textContent).toContain("The record changed while you were editing");
  });

  it("blocks manual correction for a blocked user but permits an auditable reset", () => {
    render(
      jsx(OperatorUserDetailPanel, {
        user: {
          ...user,
          creditPeriod: { ...user.creditPeriod, blockedReason: "subscription_unavailable" },
        },
        onClose: vi.fn(),
        onUpdated: vi.fn(),
      }),
    );

    expect(container.querySelector<HTMLInputElement>("#operatorCreditDelta")?.disabled).toBe(true);
    expect(container.querySelector<HTMLSelectElement>("#operatorCreditResetMode")?.disabled).toBe(false);
  });

  it("blocks both correction and reset controls for a non-active user", () => {
    render(
      jsx(OperatorUserDetailPanel, {
        user: { ...user, status: "inactive" },
        onClose: vi.fn(),
        onUpdated: vi.fn(),
      }),
    );

    expect(container.querySelector<HTMLInputElement>("#operatorCreditDelta")?.disabled).toBe(true);
    expect(container.querySelector<HTMLSelectElement>("#operatorCreditResetMode")?.disabled).toBe(true);
  });

  it("blocks status changes that require canonical provider seat synchronization", () => {
    render(
      jsx(OperatorUserDetailPanel, {
        user: {
          ...user,
          subscription: { ...user.subscription, plan: "enterprise", billingProviderManaged: true },
          statusMutation: { allowed: false, blockedReason: "provider_managed_seat_sync_required" },
        },
        onClose: vi.fn(),
        onUpdated: vi.fn(),
      }),
    );

    expect(container.querySelector<HTMLSelectElement>("#operatorUserStatus")?.disabled).toBe(true);
    expect(container.textContent).toContain("Provider seat sync required");
    expect(container.textContent).toContain("canonical tenant or billing flow");
  });
});
