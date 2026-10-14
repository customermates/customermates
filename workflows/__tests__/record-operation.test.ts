import { afterEach, describe, expect, it, vi } from "vitest";

const advance = vi.hoisted(() => vi.fn());
const sleep = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const companyId = "6a61ad3a-df22-43db-9a09-c77b582cbfee";
vi.mock("@/core/di", () => ({
  getAdvanceSystemRecordOperationInteractor: () => ({ invoke: advance }),
  getFailRecordOperationInteractor: () => ({ invoke: vi.fn() }),
  getRecordOperationService: vi.fn(),
}));
vi.mock("workflow", () => ({ sleep }));
vi.mock("../capture-failure", () => ({ reportFailure: vi.fn(), toWorkflowFailure: vi.fn() }));

import { recordOperation } from "../record-operation";

describe("record operation workflow", () => {
  afterEach(() => vi.useRealTimers());

  it("ends a step after its time budget and sleeps before the next one, so no delivery outlives the queue", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T20:00:00.000Z"), toFake: ["Date"] });
    advance
      .mockImplementationOnce(() => Promise.resolve({ done: false }))
      .mockImplementationOnce(() => {
        vi.setSystemTime(new Date("2026-10-12T20:00:11.000Z"));
        return Promise.resolve({ done: false });
      })
      .mockImplementationOnce(() => Promise.resolve({ done: true }));

    await recordOperation({ operationId: "4b5c0bd5-27c2-4f52-a8e4-9b1b4a07f4c3", system: { companyId } });

    expect(advance).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledExactlyOnceWith("1s");
  });
});
