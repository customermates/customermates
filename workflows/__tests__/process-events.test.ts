import { describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn().mockResolvedValue({ processed: 1, hasMore: false }));
vi.mock("@/core/di", () => ({ getProcessDueEventsInteractor: () => ({ invoke }) }));
vi.mock("../capture-failure", () => ({ reportFailure: vi.fn(), toWorkflowFailure: vi.fn() }));

import { processEvents } from "../process-events";

describe("event outbox workflow", () => {
  it("keeps transport tenant metadata out of the strict system interactor input", async () => {
    const companyId = "6a61ad3a-df22-43db-9a09-c77b582cbfee";
    await processEvents({
      companyId,
      tenant: { companyId, userId: "15d4c3e0-cf7b-4d77-8eb4-2ca820efb5e1" },
    });
    expect(invoke).toHaveBeenCalledExactlyOnceWith({ companyId });
  });
});
