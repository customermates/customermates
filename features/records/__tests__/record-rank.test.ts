import { describe, expect, it } from "vitest";

import { rankBetween } from "../record-rank";

const derived = (micros: number, id: string) => `${String(9999999999999999 - micros).padStart(16, "0")}${id}v`;

function expectBetween(lower: string | null, upper: string | null) {
  const rank = rankBetween(lower, upper);
  if (lower !== null) expect(rank > lower, `${rank} > ${lower}`).toBe(true);
  if (upper !== null) expect(rank < upper, `${rank} < ${upper}`).toBe(true);
  expect(rank).toMatch(/^[0-9a-z]*[1-9a-z]$/);
  return rank;
}

describe("record rank keys", () => {
  it("places a key strictly between any two neighbours, including derived creation keys", () => {
    expectBetween(null, null);
    expectBetween(null, "1");
    expectBetween("z", null);
    expectBetween("a", "b");
    expectBetween("a", "a1");
    expectBetween("0i", "1");
    expectBetween(derived(1_760_000_000_000_000, "3f2a"), derived(1_750_000_000_000_000, "00ff"));
    expectBetween(derived(1_760_000_000_000_000, "3f2a"), derived(1_760_000_000_000_000, "3f2b"));
  });

  it("keeps finding room after many inserts at the same spot", () => {
    let lower = "a";
    let upper = "b";
    for (let index = 0; index < 200; index++) {
      const rank = expectBetween(lower, upper);
      if (index % 2) lower = rank;
      else upper = rank;
    }
    let tail = expectBetween(null, null);
    for (let index = 0; index < 200; index++) tail = expectBetween(tail, null);
    expect(tail.length).toBeLessThan(40);
    let head = expectBetween(null, null);
    for (let index = 0; index < 200; index++) head = expectBetween(null, head);
    expect(head.length).toBeLessThan(220);
  });

  it("rejects neighbours in the wrong order or with characters outside the key alphabet", () => {
    expect(() => rankBetween("b", "a")).toThrow();
    expect(() => rankBetween("a", "a")).toThrow();
    expect(() => rankBetween("A", null)).toThrow();
  });
});
