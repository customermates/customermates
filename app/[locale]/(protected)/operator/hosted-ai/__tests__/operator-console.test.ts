import type {
  HostedAiOperatorCandidateDto,
  HostedAiOperatorOverviewDto,
  OperatorAuditPageDto,
} from "@/ee/operator/operator.schema";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { jsx } from "react/jsx-runtime";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPERATOR_AUDIT_ACTION } from "@/ee/operator/operator.schema";
import messages from "@/i18n/locales/en.json";

const mocks = vi.hoisted(() => ({
  adjustment: vi.fn(),
  allowance: vi.fn(),
  audit: vi.fn(),
  candidate: vi.fn(),
  control: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../actions", () => ({
  createCreditAdjustmentAction: mocks.adjustment,
  findHostedAiCandidateAction: mocks.candidate,
  loadOperatorAuditEventsAction: mocks.audit,
  updateEnterpriseAllowanceAction: mocks.allowance,
  updateGlobalControlAction: mocks.control,
}));

import { HostedAiOperatorConsole } from "../operator-console";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PERIOD_START = "2026-08-17T13:42:19.000Z";
const PERIOD_END = "2026-09-17T13:42:19.000Z";

const overview = {
  generatedAt: "2026-08-28T12:00:00.000Z",
  currentUtcMonth: {
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-09-01T00:00:00.000Z",
    companiesWithUsage: 1,
    settledCostMicrocents: "100000000",
    reservedExposureMicrocents: "200000000",
    totalCommittedMicrocents: "300000000",
    chargedCredits: 100,
    reservedCredits: 20,
  },
  fleet: { companies: 2, enterpriseCompanies: 1, users: 3, activeUsers: 2 },
  globalControl: {
    id: "global",
    hostedProviderWorkPaused: false,
    monthlySpendCapMicrocents: null,
    reason: "Initial fail-closed state",
    version: 1,
    updatedByOperatorUserId: USER_ID,
    createdAt: "2026-08-28T12:00:00.000Z",
    updatedAt: "2026-08-28T12:00:00.000Z",
  },
} as HostedAiOperatorOverviewDto;

const candidate = {
  userId: USER_ID,
  companyId: COMPANY_ID,
  email: "linnea@example.com",
  displayName: "Linnea Example",
  status: "active",
  authEmailVerified: true,
  company: {
    companyId: COMPANY_ID,
    subscription: {
      plan: "enterprise",
      status: "active",
      enterpriseCreditsPerUser: 500,
      agentCreditAnchorAt: PERIOD_START,
      trialEndDate: null,
      currentPeriodEnd: PERIOD_END,
    },
    seats: { active: 1, total: 1 },
    currentUtcMonth: {
      settledCostMicrocents: "0",
      reservedExposureMicrocents: "0",
      totalCommittedMicrocents: "0",
      chargedCredits: 0,
      reservedCredits: 0,
    },
  },
  creditPeriod: {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    baseAllowanceCredits: 500,
    adjustmentCredits: 0,
    effectiveAllowanceCredits: 500,
    chargedCredits: 0,
    reservedCredits: 0,
    remainingCredits: 500,
    blockedReason: null,
  },
} as HostedAiOperatorCandidateDto;

const audit = { events: [], nextCursor: null } as OperatorAuditPageDto;

let container: HTMLDivElement;
let root: Root;

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

describe("HostedAiOperatorConsole", () => {
  it("shows the fail-closed cap state and resolves a workspace only after exact-email submission", async () => {
    mocks.candidate.mockResolvedValueOnce({ status: "success", data: candidate });

    act(() => {
      root.render(
        jsx(NextIntlClientProvider, {
          locale: "en",
          messages,
          timeZone: "UTC",
          children: jsx(HostedAiOperatorConsole, {
            audit,
            globalControlsEnabled: true,
            initialOperationIds: {
              adjustment: "33333333-3333-4333-8333-333333333333",
              allowance: "44444444-4444-4444-8444-444444444444",
              globalControl: "55555555-5555-4555-8555-555555555555",
            },
            overview,
          }),
        }),
      );
    });

    expect(container.textContent).toContain("New work blocked: cap not configured");
    expect(container.textContent).toContain("Not configured · new work blocked");
    expect(container.querySelector<HTMLInputElement>("#monthlySpendCapDollars")?.step).toBe("0.00000001");
    expect(container.querySelector("[data-testid=operator-candidate-result]")).toBeNull();

    const email = container.querySelector<HTMLInputElement>("#operatorCandidateEmail");
    expect(email?.autocomplete).toBe("off");
    expect(email?.form?.method.toLowerCase()).toBe("post");
    if (!email?.form) throw new Error("candidate form not rendered");
    email.value = "linnea@example.com";

    await act(async () => {
      email.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(mocks.candidate).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-testid=operator-candidate-result]")?.textContent).toContain(
      "linnea@example.com",
    );
    expect(container.querySelector<HTMLInputElement>('input[name="periodStart"]')?.value).toBe(PERIOD_START);
    expect(container.querySelector<HTMLInputElement>('input[name="periodEnd"]')?.value).toBe(PERIOD_END);

    mocks.candidate.mockResolvedValueOnce({ status: "error", errorCode: "invalidInput" });
    email.value = "not-an-email";

    await act(async () => {
      email.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.querySelector("[data-testid=operator-candidate-result]")).toBeNull();
    expect(container.querySelector('input[name="companyId"]')).toBeNull();
    expect(container.textContent).toContain(messages.OperatorConsole.errors.invalidInput);
  });

  it("labels every audited operator action instead of falling back to the generic label", () => {
    const actions = Object.values(OPERATOR_AUDIT_ACTION);
    const events = actions.map((action, index) => ({
      id: `66666666-6666-4666-8666-${String(index).padStart(12, "0")}`,
      actorUserId: USER_ID,
      action,
      targetCompanyId: null,
      targetUserId: null,
      operationId: `77777777-7777-4777-8777-${String(index).padStart(12, "0")}`,
      reason: null,
      metadata: null,
      createdAt: "2026-08-28T12:00:00.000Z",
    }));

    act(() => {
      root.render(
        jsx(NextIntlClientProvider, {
          locale: "en",
          messages,
          timeZone: "UTC",
          children: jsx(HostedAiOperatorConsole, {
            audit: { events, nextCursor: null } as OperatorAuditPageDto,
            globalControlsEnabled: true,
            initialOperationIds: {
              adjustment: "33333333-3333-4333-8333-333333333333",
              allowance: "44444444-4444-4444-8444-444444444444",
              globalControl: "55555555-5555-4555-8555-555555555555",
            },
            overview,
          }),
        }),
      );
    });

    const labels = [...container.querySelectorAll("tbody tr")].map((row) => row.children[1]?.textContent?.trim() ?? "");

    expect(labels).toHaveLength(actions.length);
    expect(labels).not.toContain(messages.OperatorConsole.audit.actions.other);
    expect(new Set(labels).size).toBe(actions.length);
  });
});
