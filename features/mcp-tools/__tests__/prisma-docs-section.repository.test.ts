import { describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/prisma/db", () => ({ prisma: { $queryRaw: queryRaw } }));

import { PrismaDocsSectionRepo } from "../prisma-docs-section.repository";

describe("documentation semantic index completeness", () => {
  it("does not query the optional embedding column when semantic indexing is unavailable", async () => {
    const repo = new PrismaDocsSectionRepo();
    vi.spyOn(repo, "semanticIndexAvailable").mockResolvedValue(false);
    queryRaw.mockRejectedValue(new Error("column s.embedding does not exist"));

    await expect(
      repo.semanticIndexComplete({ buildHash: "without-vector", locale: "en", sources: ["docs"] }, "version"),
    ).resolves.toBe(false);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
