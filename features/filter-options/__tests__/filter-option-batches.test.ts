import { describe, expect, it } from "vitest";

import {
  FILTER_OPTION_BATCH_CONCURRENCY,
  FILTER_OPTION_BATCH_SIZE,
  filterOptionBatches,
  resolveFilterOptionBatches,
} from "../filter-option-batches";

describe("filterOptionBatches", () => {
  it.each([0, FILTER_OPTION_BATCH_SIZE])("keeps %i IDs in at most one request", (count) => {
    const ids = Array.from({ length: count }, (_, index) => String(index));

    expect(filterOptionBatches(ids)).toEqual(count === 0 ? [] : [ids]);
  });

  it("splits a valid 101-value filter into bounded requests", () => {
    const ids = Array.from({ length: FILTER_OPTION_BATCH_SIZE + 1 }, (_, index) => String(index));

    expect(filterOptionBatches(ids)).toEqual([ids.slice(0, FILTER_OPTION_BATCH_SIZE), ids.slice(-1)]);
  });

  it("caps aggregate request concurrency for large saved filters", async () => {
    const ids = Array.from({ length: FILTER_OPTION_BATCH_SIZE * 5 + 1 }, (_, index) => String(index));
    let activeRequests = 0;
    let maximumActiveRequests = 0;

    const resolved = await resolveFilterOptionBatches(ids, async (batch) => {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      return [...batch];
    });

    expect(maximumActiveRequests).toBe(FILTER_OPTION_BATCH_CONCURRENCY);
    expect(resolved).toEqual(ids);
  });
});
