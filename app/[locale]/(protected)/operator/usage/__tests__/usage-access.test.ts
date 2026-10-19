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

beforeEach(() => {
  state.authorizeRead.mockReset().mockRejectedValue(new ForbiddenError("Platform operator access required"));
  state.ledgerReads.mockReset().mockResolvedValue({ workspaces: [], intervals: [], recordingStartedAt: null });
  state.notFound.mockClear();
});

describe("operator usage page access", () => {
  it("answers a non-operator on the usage page with the operator console's not-found response", async () => {
    await expect(OperatorUsagePage({ searchParams: Promise.resolve({ month: "2026-09" }) })).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );

    expect(state.notFound).toHaveBeenCalledOnce();
    expect(state.ledgerReads).not.toHaveBeenCalled();
  });
});
