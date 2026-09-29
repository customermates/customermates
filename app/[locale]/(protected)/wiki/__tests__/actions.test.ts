import { beforeEach, describe, expect, it, vi } from "vitest";

import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

const mocks = vi.hoisted(() => ({ start: vi.fn(), update: vi.fn(), remove: vi.fn() }));

vi.mock("@/core/di", () => ({
  getStartWikiHomepageSetupInteractor: () => ({ invoke: mocks.start }),
  getUpdateWikiPageInteractor: () => ({ invoke: mocks.update }),
  getDeleteWikiPageInteractor: () => ({ invoke: mocks.remove }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
}));

import { deleteWikiPageAction, startWikiHomepageSetupAction, updateWikiPageAction } from "../actions";

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

  it("preserves the browser or selected Wiki language instead of replacing it with the route locale", async () => {
    mocks.start.mockResolvedValue({ ok: true, data: { conversationId: null } });
    await startWikiHomepageSetupAction({ homepage: "example.com", clientRequestId: CLIENT_REQUEST_ID, locale: "de" });
    expect(mocks.start).toHaveBeenCalledExactlyOnceWith({
      homepage: "example.com",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "de",
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

describe("Wiki page concurrency conflicts", () => {
  const input = { id: "00000000-0000-4000-8000-000000000003", expectedUpdatedAt: new Date() };

  it.each([
    ["a stale-page conflict", { kind: "conflict", error: CustomErrorCode.wikiPageConflict }, true],
    ["a validation failure", { error: CustomErrorCode.invalidUrl }, false],
  ])("flags only %s", async (_case, params, conflict) => {
    const failure = { ok: false, error: createZodError("Failed", ["expectedUpdatedAt"], params) };
    mocks.update.mockResolvedValue(failure);
    mocks.remove.mockResolvedValue(failure);

    expect(await updateWikiPageAction({ ...input, title: "Title" })).toMatchObject({ ok: false, conflict });
    expect(await deleteWikiPageAction(input)).toMatchObject({ ok: false, conflict });
  });
});
