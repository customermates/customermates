import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/core/di", () => ({
  getStartWikiHomepageSetupInteractor: () => ({ invoke: mocks.invoke }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve((key: string) => key),
}));

import { startWikiHomepageSetupAction } from "../setup-action";

const CLIENT_REQUEST_ID = "00000000-0000-4000-8000-000000000001";
const CONVERSATION_ID = "00000000-0000-4000-8000-000000000002";

function disposition(value: "run" | "running" | "completedReplay" | "failed" | "uncertain" | "conflict") {
  return {
    ok: true as const,
    data: {
      disposition: value,
      clientRequestId: CLIENT_REQUEST_ID,
      conversationId: value === "conflict" ? undefined : CONVERSATION_ID,
      retryAllowed: value === "failed",
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("startWikiHomepageSetupAction", () => {
  it.each(["run", "running", "completedReplay"] as const)("accepts the durable %s disposition", async (value) => {
    mocks.invoke.mockResolvedValue(disposition(value));

    await expect(
      startWikiHomepageSetupAction({ homepage: "example.com", clientRequestId: CLIENT_REQUEST_ID }),
    ).resolves.toEqual({ ok: true, data: { conversationId: CONVERSATION_ID } });

    expect(mocks.invoke).toHaveBeenCalledWith({
      homepage: "example.com",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "en",
      retry: false,
    });
  });

  it("retries a pre-provider failure with the same request identity", async () => {
    mocks.invoke.mockResolvedValueOnce(disposition("failed")).mockResolvedValueOnce(disposition("run"));

    await expect(
      startWikiHomepageSetupAction({ homepage: "example.com", clientRequestId: CLIENT_REQUEST_ID }),
    ).resolves.toEqual({ ok: true, data: { conversationId: CONVERSATION_ID } });

    expect(mocks.invoke.mock.calls.map(([input]) => input.retry)).toEqual([false, true]);
  });

  it.each(["uncertain", "conflict"] as const)("does not present a %s turn as accepted", async (value) => {
    mocks.invoke.mockResolvedValue(disposition(value));

    const result = await startWikiHomepageSetupAction({
      homepage: "example.com",
      clientRequestId: CLIENT_REQUEST_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(JSON.stringify(result.error)).toContain("startFailed");
  });
});
