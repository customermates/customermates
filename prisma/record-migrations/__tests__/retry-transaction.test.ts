import { describe, expect, it, vi } from "vitest";
import { retryMigrationTransaction } from "../retry-transaction";

describe("migration transaction retries", () => {
  it.each(["40001", "40P01"])("restarts a rolled-back %s transaction and returns its result", async (code) => {
    const transaction = vi.fn().mockRejectedValueOnce({ code }).mockResolvedValue({ valid: true });
    expect(await retryMigrationTransaction(transaction)).toEqual({ valid: true });
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it("bounds contention retries", async () => {
    const error = { code: "40001" };
    const transaction = vi.fn().mockRejectedValue(error);
    await expect(retryMigrationTransaction(transaction)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(5);
  });
  it.each([new Error("Unknown committed response"), { code: "23505" }, { code: "ECONNRESET" }])(
    "does not blindly replay ambiguous outcomes or integrity errors",
    async (error) => {
      const transaction = vi.fn().mockRejectedValue(error);
      await expect(retryMigrationTransaction(transaction)).rejects.toBe(error);
      expect(transaction).toHaveBeenCalledTimes(1);
    },
  );
});
