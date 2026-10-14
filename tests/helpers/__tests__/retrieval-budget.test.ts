import { describe, expect, it, vi } from "vitest";

import { RetrievalBudget } from "../retrieval-budget";

const request = (
  budget: RetrievalBudget,
  bound: number,
  provider: () => Promise<number>,
) => budget.run(bound, provider, (charge) => charge);

describe("retrieval evaluation budget admission", () => {
  it.each(["NaN", "Infinity", "-Infinity", "-1", "", " ", "no", "1e100"])(
    "rejects invalid cap %s before requests",
    (cap) => {
      expect(() => new RetrievalBudget(cap)).toThrow("finite nonnegative");
    },
  );

  it.each(["0", "0.000000001", "0.00000001"])(
    "rejects requests exceeding cap %s without provider work",
    async (cap) => {
      const provider = vi.fn(() => Promise.resolve(1));
      await expect(
        request(new RetrievalBudget(cap), 2, provider),
      ).rejects.toThrow("cannot admit");
      expect(provider).not.toHaveBeenCalled();
    },
  );

  it("admits the exact cap and frees only confirmed unused reservation", async () => {
    const budget = new RetrievalBudget("0.000001");
    await request(budget, 100, () => Promise.resolve(40));
    await request(budget, 60, () => Promise.resolve(60));
    expect(budget.accountedMicrocents).toBe(100);
    expect(() => budget.reserve(1)).toThrow("cannot admit");
  });

  it("counts simultaneous indexing, embeddings and reranks before dispatch", () => {
    const budget = new RetrievalBudget("0.00001");
    const indexing = budget.reserve(600);
    const query = budget.reserve(200);
    const rerank = budget.reserve(200);
    expect(budget.accountedMicrocents).toBe(1000);
    expect(() => budget.reserve(1)).toThrow("cannot admit");
    expect(() => indexing()).toThrow("cannot admit");
    expect(() => query()).toThrow("cannot admit");
    expect(() => rerank()).toThrow("cannot admit");
    expect(budget.accountedMicrocents).toBe(1000);
  });

  it("retains the conservative bound when provider billing is uncertain", async () => {
    const budget = new RetrievalBudget("0.00001");
    await expect(
      request(budget, 800, () => Promise.reject(new Error("timeout"))),
    ).rejects.toThrow("timeout");
    expect(budget.accountedMicrocents).toBe(800);
    expect(() => budget.reserve(201)).toThrow("cannot admit");
  });

  it("stops subsequent requests when provider pricing violates the bound", async () => {
    const budget = new RetrievalBudget("1");
    await expect(
      request(budget, 10, () => Promise.resolve(11)),
    ).rejects.toThrow("exceeded");
    expect(() => budget.reserve(1)).toThrow("exceeded");
  });
});
