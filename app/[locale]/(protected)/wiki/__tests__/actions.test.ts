import { beforeEach, describe, expect, it, vi } from "vitest";

import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));

vi.mock("@/core/di", () => ({
  getStartWikiHomepageSetupInteractor: () => ({ invoke: mocks.start }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
}));

import { startWikiHomepageSetupAction } from "../actions";

const CLIENT_REQUEST_ID = "00000000-0000-4000-8000-000000000001";
const CONVERSATION_ID = "00000000-0000-4000-8000-000000000002";

beforeEach(() => vi.clearAllMocks());

describe("startWikiHomepageSetupAction", () => {
  it("passes the request locale to the interactor and returns its started setup", async () => {
    const started = { conversationId: CONVERSATION_ID, homepage: "https://example.com/", domain: "example.com" };
    mocks.start.mockResolvedValue({ ok: true, data: started });

    await expect(
      startWikiHomepageSetupAction({ homepage: "example.com", clientRequestId: CLIENT_REQUEST_ID }),
    ).resolves.toEqual({ ok: true, data: started });
    expect(mocks.start).toHaveBeenCalledExactlyOnceWith({
      homepage: "example.com",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "en",
    });
  });

  it("serializes an interactor failure as a field error tree", async () => {
    mocks.start.mockResolvedValue({
      ok: false,
      error: createZodError("Mate could not start the Wiki setup.", ["homepage"], {
        error: CustomErrorCode.wikiHomepageSetupStartFailed,
      }),
    });

    const result = await startWikiHomepageSetupAction({ homepage: "example.com", clientRequestId: CLIENT_REQUEST_ID });

    expect(result).toMatchObject({
      ok: false,
      error: { properties: { homepage: { errors: ["Mate could not start the Wiki setup."] } } },
    });
  });
});
