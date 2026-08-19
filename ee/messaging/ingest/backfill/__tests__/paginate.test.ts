import { describe, it, expect, vi } from "vitest";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { paginateStep, UNIPILE_MAX_LIMIT } from "../paginate";
import { UnipileRequestError } from "../../../messaging.service";

function page(count: number, nextCursor?: string) {
  return { data: Array.from({ length: count }, (_, index) => ({ id: `${index}` })), next_cursor: nextCursor };
}

function cursorPaginationError() {
  return new UnipileRequestError(
    400,
    "provider/invalid_parameters",
    '{"object":"Error","status":400,"type":"provider/invalid_parameters","title":"Invalid parameters","detail":"Google Calendar use cursor for pagination.","req_id":"req-9jg"}',
  );
}

describe("paginateStep", () => {
  it("follows next_cursor while the provider keeps returning one", async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(page(UNIPILE_MAX_LIMIT, "c1")).mockResolvedValueOnce(page(3));
    const handled: unknown[] = [];

    const result = await paginateStep({
      startCursor: null,
      limit: UNIPILE_MAX_LIMIT,
      fetchPage,
      handleItem: (item) => {
        handled.push(item);

        return Promise.resolve();
      },
    });

    expect(result).toEqual({ nextCursor: null, done: true });
    expect(fetchPage.mock.calls[1][0]).toEqual({ cursor: "c1" });
    expect(handled).toHaveLength(UNIPILE_MAX_LIMIT + 3);
  });

  it("advances by offset for a provider that paginates by offset", async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(page(UNIPILE_MAX_LIMIT)).mockResolvedValueOnce(page(2));

    const result = await paginateStep({
      startCursor: null,
      limit: UNIPILE_MAX_LIMIT,
      fetchPage,
      handleItem: () => Promise.resolve(),
    });

    expect(fetchPage.mock.calls[1][0]).toEqual({ offset: UNIPILE_MAX_LIMIT });
    expect(result).toEqual({ nextCursor: null, done: true });
  });

  it("stops cleanly when a cursor-only provider rejects the offset probe", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(UNIPILE_MAX_LIMIT))
      .mockRejectedValueOnce(cursorPaginationError());

    const result = await paginateStep({
      startCursor: null,
      limit: UNIPILE_MAX_LIMIT,
      fetchPage,
      handleItem: () => Promise.resolve(),
    });

    expect(result).toEqual({ nextCursor: null, done: true });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("still surfaces an unrelated bad-request failure", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(UNIPILE_MAX_LIMIT))
      .mockRejectedValueOnce(
        new UnipileRequestError(400, "provider/invalid_parameters", '{"detail":"Unknown field."}'),
      );

    await expect(
      paginateStep({
        startCursor: null,
        limit: UNIPILE_MAX_LIMIT,
        fetchPage,
        handleItem: () => Promise.resolve(),
      }),
    ).rejects.toBeInstanceOf(UnipileRequestError);
  });
});
