import { describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/prisma/db", () => ({ prisma: { $queryRaw: queryRaw } }));

import { PrismaDocsChunkRepo } from "../prisma-docs-chunk.repository";

describe("documentation semantic index completeness", () => {
  it("does not query the optional embedding column when semantic indexing is unavailable", async () => {
    const repo = new PrismaDocsChunkRepo();
    vi.spyOn(repo, "semanticIndexAvailable").mockResolvedValue(false);
    queryRaw.mockRejectedValue(new Error("column c.embedding does not exist"));

    await expect(
      repo.semanticIndexComplete({ buildHash: "without-vector", locale: "en", sources: ["docs"] }, "model"),
    ).resolves.toBe(false);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
