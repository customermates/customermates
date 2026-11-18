import { describe, expect, it } from "vitest";

import { mapInParallel } from "../map-in-parallel";

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("mapInParallel", () => {
  it("keeps the order of the items and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const results = await mapInParallel([5, 1, 4, 2, 3, 6, 7], 3, async (value) => {
      running += 1;
      peak = Math.max(peak, running);
      for (let waited = 0; waited < value; waited += 1) await tick();
      running -= 1;
      return value * 10;
    });

    expect(results).toEqual([50, 10, 40, 20, 30, 60, 70]);
    expect(peak).toBe(3);
  });

  it("returns an empty list for no items and runs a single item with any limit", async () => {
    expect(await mapInParallel([], 4, (value: number) => Promise.resolve(value))).toEqual([]);
    expect(await mapInParallel([1], 0, (value) => Promise.resolve(value + 1))).toEqual([2]);
  });

  it("rejects with the first failure and starts no further items", async () => {
    const started: number[] = [];
    const run = mapInParallel([1, 2, 3, 4, 5, 6], 2, async (value) => {
      started.push(value);
      await tick();
      if (value === 2) throw new Error("second failed");
      for (let waited = 0; waited < 5; waited += 1) await tick();
      return value;
    });

    await expect(run).rejects.toThrow("second failed");
    for (let waited = 0; waited < 20; waited += 1) await tick();
    expect(started).toEqual([1, 2]);
  });
});
