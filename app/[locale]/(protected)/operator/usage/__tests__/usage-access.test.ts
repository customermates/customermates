import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/core/errors/app-errors";

const state = vi.hoisted(() => ({
  authorizeRead: vi.fn(),
  ledgerReads: vi.fn(),
  notFound: vi.fn((): never => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notFound: state.notFound,
}));
vi.mock("@/core/di", async () => {
  const { GetOperatorBillingUsageInteractor } = await import("@/ee/operator/get/get-operator-billing-usage.interactor");

  return {
    getOperatorAccessService: () => ({ authorizeRead: state.authorizeRead }),
    getGetOperatorBillingUsageInteractor: () =>
      new GetOperatorBillingUsageInteractor({ readBillingUsageLedgerUnscoped: state.ledgerReads }),
  };
});

import OperatorUsagePage from "../page";
import { getOperatorBillingUsageAction } from "../../workspaces/actions";

const COMPANY_ID = "00000000-0000-4000-8000-000000000020";

beforeEach(() => {
  state.authorizeRead.mockReset().mockRejectedValue(new ForbiddenError("Platform operator access required"));
  state.ledgerReads.mockReset().mockResolvedValue({ workspaces: [], intervals: [] });
  state.notFound.mockClear();
});

describe("operator usage access", () => {
  it("answers a non-operator on the usage page with the operator console's not-found response", async () => {
    await expect(OperatorUsagePage({ searchParams: Promise.resolve({ month: "2026-09" }) })).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );

    expect(state.notFound).toHaveBeenCalledOnce();
    expect(state.ledgerReads).not.toHaveBeenCalled();
  });

  it("refuses the workspace usage server action for a non-operator with a permission failure", async () => {
    const result = await getOperatorBillingUsageAction({ month: "2026-09", companyId: COMPANY_ID });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain("permissionDenied");
    expect(state.ledgerReads).not.toHaveBeenCalled();
  });

  it("serves the usage once the operator guard admits the caller", async () => {
    state.authorizeRead.mockResolvedValue({
      authUserId: "auth-id",
      userId: "user-id",
      companyId: "company-id",
      email: "operator@example.invalid",
    });

    const result = await getOperatorBillingUsageAction({ month: "2026-09" });

    expect(result).toMatchObject({ ok: true, data: { month: "2026-09", workspaces: [] } });
    expect(state.ledgerReads).toHaveBeenCalledOnce();
  });
});
